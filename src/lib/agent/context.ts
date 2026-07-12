/**
 * Agent context builder — assembles the 6-layer system prompt on EVERY turn.
 *
 *   L0 IDENTITY  โฮชิเป็นใคร (persona)                    [static]
 *   L1 SOP       กฎปฏิบัติ + ขั้นตอนมาตรฐาน                [static, versioned]
 *   L2 PROFILE   โปรไฟล์เจ้าของจาก KB (always-inject)      [knowledge table]
 *   L3 STATE     สถานะสด: งานค้าง / เตือน / follow-up      [live queries]
 *   L4 MEMORY    ความจำที่ตรงประเด็นกับข้อความนี้ (RAG)     [pgvector recall]
 *   L5 HISTORY   ประวัติแชทล่าสุด — ต่อเป็น ChatTurn แยก   [caller appends]
 *
 * WHY: the old chat path only pulled listRecent(3) — the 3 NEWEST memories,
 * not the most RELEVANT — and never saw the owner's profile. This builds
 * relevance-first context (RAG on the current message) + always-on profile so
 * a cheap model (gemini-flash) answers as if it truly knows the owner.
 *
 * All retrieved/user data is wrapped in XML tags (<knowledge>, <state>,
 * <memory>) per Anthropic prompting guidance so the model can cleanly separate
 * instructions from data.
 */
import { listAlwaysInject, recallKnowledgeHybrid } from "@/lib/kb/repo";
import { recallHybrid, listRecent } from "@/lib/memory/store";
import { listTodos } from "@/lib/todo/repo";
import { listUpcoming } from "@/lib/remind/schedule";
import { listPeople } from "@/lib/people/repo";
import { embedOne } from "@/lib/llm/embed";
import { BANGKOK, localDateStr, localHHMM } from "@/lib/tz";
import type { KnowledgeRecord, MemoryRecord, Person } from "@/lib/types";

// Prompt text lives in the registry module — this file assembles context.
export {
  T0_SECURITY_POLICY,
  T1_PRODUCT_SOP,
  PROMPT_VERSION,
  SOP_VERSION,
} from "@/lib/agent/prompts";
export type { PromptVersions } from "@/lib/agent/prompts";

import { T0_SECURITY_POLICY, T1_PRODUCT_SOP, compileDomainSop } from "@/lib/agent/prompts";

// Legacy exports — naming follows Phase 1 M8 fix convention.
export const IDENTITY = T0_SECURITY_POLICY;
export const CORE_SOP = T1_PRODUCT_SOP;

/** Escape XML metacharacters so retrieved data can't break the tag structure. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Token estimate — Thai chars use ~3 chars/token, English ~4 chars/token.
 *  Use the more conservative estimate for mixed Thai/English content. */
function estimateTokens(text: string): number {
  const thaiCharCount = (text.match(/[\u0E00-\u0E7F]/g) || []).length;
  const otherCharCount = text.length - thaiCharCount;
  return Math.ceil(thaiCharCount / 3 + otherCharCount / 4);
}

/** Context token budget — keeps prompt bounded for cheap models. */
const MAX_KB_ALWAYS_TOKENS = 800;
const MAX_MEMORY_TOKENS = 1500;

// ─── L2 PROFILE (KB) ────────────────────────────────────────────
function formatKnowledge(rows: KnowledgeRecord[]): string {
  if (rows.length === 0) return "";
  // group by category so SOP / profile / preferences read cleanly
  const order: KnowledgeRecord["category"][] = [
    "sop",
    "profile",
    "relationship",
    "preference",
    "context",
  ];
  const label: Record<KnowledgeRecord["category"], string> = {
    sop: "คำสั่งประจำ (ต้องปฏิบัติเสมอ)",
    profile: "โปรไฟล์เจ้าของ",
    relationship: "คนสำคัญ",
    preference: "ความชอบ",
    context: "บริบท",
  };
  const byCat = new Map<string, string[]>();
  for (const r of rows) {
    const arr = byCat.get(r.category) ?? [];
    arr.push(`${r.key}: ${r.value}`);
    byCat.set(r.category, arr);
  }
  // Token-budgeted: priority 1 (SOP, profile) first, then priority 2 if room.
  // Cap individual entries at 40% of total budget to prevent single oversized
  // SOP from crowding out all other knowledge. Add source IDs [K1], [K2]...
  // so the LLM can cite evidence.
  const parts: string[] = [];
  let usedTokens = 0;
  const maxPerEntry = Math.floor(MAX_KB_ALWAYS_TOKENS * 0.4);
  let kIdx = 1;
  for (const cat of order) {
    const items = byCat.get(cat);
    if (!items || items.length === 0) continue;
    const catLines: string[] = [];
    for (const item of items) {
      const tagged = `[K${kIdx}] ${item}`;
      const lineTokens = estimateTokens(tagged);
      if (lineTokens > maxPerEntry) continue;
      if (usedTokens + lineTokens > MAX_KB_ALWAYS_TOKENS) break;
      catLines.push(`- ${esc(tagged)}`);
      usedTokens += lineTokens;
      kIdx++;
    }
    if (catLines.length === 0) continue;
    const tag = cat === "sop" ? ' category="sop"' : "";
    parts.push(
      `<knowledge${tag} type="${label[cat]}">\n` +
        catLines.join("\n") +
        `\n</knowledge>`,
    );
    if (usedTokens >= MAX_KB_ALWAYS_TOKENS) break;
  }
  return parts.join("\n");
}

// ─── L2.5 RELATIONSHIPS (people + tiers) ─────────────────────────
// Contact tiers (P1-P4) borrowed from secretary-agent (kylem148): they are
// context the LLM reasons with when weighting follow-ups, nudges, and meeting
// prep — NOT hard rules. A high tier informs prioritization the same way a
// human assistant weighs "who is this person to the owner".
const TIER_LABEL: Record<number, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

/** Compact a notes jsonb into a short readable suffix (e.g. role/relationship). */
function compactNotes(notes: Record<string, unknown>): string {
  const entries = Object.entries(notes)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .slice(0, 2)
    .map(([k, v]) => `${esc(k)}: ${esc(typeof v === "string" ? v : JSON.stringify(v))}`);
  return entries.length ? ` — ${entries.join("; ")}` : "";
}

function formatPeople(rows: Person[]): string {
  if (rows.length === 0) return "";
  const lines = rows.map((p) => {
    const tag = p.tier ? `[${TIER_LABEL[p.tier] ?? "P?"}] ` : "";
    const aliases =
      p.aliases && p.aliases.length > 0
        ? ` (เรียก: ${p.aliases.slice(0, 3).map(esc).join(", ")})`
        : "";
    return `- ${tag}${esc(p.name)}${aliases}${compactNotes(p.notes ?? {})}`;
  });
  return `<people>\n${lines.join("\n")}\n</people>`;
}

// ─── L4 MEMORY (RAG, relevance + recency blend) ─────────────────
function formatMemory(
  relevant: { memory: MemoryRecord }[],
  recent: MemoryRecord[],
): string {
  // dedup by id AND by content prefix (catches near-duplicate memories
  // that were stored via different paths but have overlapping content).
  const seenIds = new Set<string>();
  const seenContentPrefixes = new Set<string>();
  const merged: MemoryRecord[] = [];
  for (const r of relevant) {
    if (!r.memory.id || seenIds.has(r.memory.id)) continue;
    const prefix = r.memory.content.slice(0, 100).toLowerCase();
    if (seenContentPrefixes.has(prefix)) continue;
    seenIds.add(r.memory.id);
    seenContentPrefixes.add(prefix);
    merged.push(r.memory);
  }
  for (const m of recent) {
    if (!m.id || seenIds.has(m.id)) continue;
    const prefix = m.content.slice(0, 100).toLowerCase();
    if (seenContentPrefixes.has(prefix)) continue;
    seenIds.add(m.id);
    seenContentPrefixes.add(prefix);
    merged.push(m);
  }
  if (merged.length === 0) return "";
  const lines: string[] = [];
  let usedTokens = 0;
  let idx = 1;
  for (const m of merged) {
    const date = new Date(m.created_at).toLocaleDateString("th-TH", {
      day: "numeric",
      month: "short",
      timeZone: BANGKOK,
    });
    const line = `- [M${idx}] (${date}) ${esc(m.content)}`;
    const lineTokens = estimateTokens(line);
    if (usedTokens + lineTokens > MAX_MEMORY_TOKENS) break;
    lines.push(line);
    usedTokens += lineTokens;
    idx++;
    if (lines.length >= 8) break;
  }
  if (lines.length === 0) return "";
  return `<memory>\n${lines.join("\n")}\n</memory>`;
}

// ─── L3 STATE (live) ────────────────────────────────────────────
function fmtThaiDate(iso: string, timeZone: string): string {
  try {
    return new Date(iso).toLocaleString("th-TH", {
      timeZone,
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Code-controlled current time; regenerated for every agent turn. */
export function currentTimeBlock(now = new Date(), timeZone = BANGKOK): string {
  const localDate = new Intl.DateTimeFormat("th-TH", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const localTime = localHHMM(now, timeZone);
  const localYmd = localDateStr(now, timeZone);
  return `<current_time time_zone="${esc(timeZone)}" utc="${now.toISOString()}" local_date="${localYmd}" local_time="${localTime}">
เวลาปัจจุบันของผู้ใช้: ${localDate} เวลา ${localTime} น. ใช้เวลานี้เป็นหลักเมื่ออ้างถึง วันนี้ พรุ่งนี้ เมื่อวาน หรือเวลาสัมพัทธ์
</current_time>`;
}

export interface BuildContextArgs {
  userId: string;
  message: string;
  timeZone?: string;
  /** Classified action — used to compile domain-specific SOP snippets. */
  action?: string;
}

/**
 * Assemble the full system prompt (L0-L4). L5 history is appended by the caller
 * as separate ChatTurns. Every layer is fetched in parallel and each retrieval
 * is independently defensive — one failing query degrades that layer to empty
 * rather than blanking the whole context or throwing.
 */
export async function buildAgentContext(args: BuildContextArgs): Promise<string> {
  const { userId, message } = args;
  const timeZone = args.timeZone || BANGKOK;
  const q = message.trim();

  // Embed the current message ONCE and share the vector across both semantic
  // recalls (memory + knowledge). This path runs on every chat turn; embedding
  // the identical query twice doubled load on the quota-sensitive bge-m3
  // endpoint (403-retryable) and added a second rate-limit stall before the
  // reply LLM. The embed is a shared promise so the 4 cheap DB queries below
  // still start immediately (full concurrency) — only the two recalls await it.
  // On embed failure the promise resolves undefined and each recall falls back
  // to its own ILIKE text search as before.
  const vecPromise: Promise<number[] | undefined> = q
    ? embedOne(q.slice(0, 8000)).catch((e) => {
        console.warn("[context] shared embed", (e as Error).message);
        return undefined;
      })
    : Promise.resolve(undefined);

  const [kbAlways, kbRelevant, memRelevant, memRecent, todos, reminders, people] =
    await Promise.all([
      listAlwaysInject(userId, 2).catch((e) => {
        console.warn("[context] kb always", (e as Error).message);
        return [] as KnowledgeRecord[];
      }),
      q
        ? vecPromise
            .then((vec) => recallKnowledgeHybrid(userId, q, 4, { precomputedVec: vec }))
            .catch((e) => {
              console.warn("[context] kb hybrid recall", (e as Error).message);
              return [];
            })
        : Promise.resolve([]),
      q
        ? vecPromise
            .then((vec) => recallHybrid(userId, q, 6, undefined, vec))
            .catch((e) => {
              console.warn("[context] mem hybrid recall", (e as Error).message);
              return [];
            })
        : Promise.resolve([]),
      listRecent(userId, 3).catch((e) => {
        console.warn("[context] mem recent", (e as Error).message);
        return [] as MemoryRecord[];
      }),
      listTodos(userId, "pending").catch((e) => {
        console.warn("[context] todos", (e as Error).message);
        return [];
      }),
      listUpcoming(userId, 3).catch((e) => {
        console.warn("[context] reminders", (e as Error).message);
        return [];
      }),
      listPeople(userId, 12).catch((e) => {
        console.warn("[context] people", (e as Error).message);
        return [] as Person[];
      }),
    ]);

  // ── L2 PROFILE: merge always-inject + message-relevant KB, dedup by id ──
  const kbSeen = new Set<string>();
  const kbMerged: KnowledgeRecord[] = [];
  for (const k of kbAlways) {
    if (!kbSeen.has(k.id)) {
      kbSeen.add(k.id);
      kbMerged.push(k);
    }
  }
  for (const r of kbRelevant) {
    if (!kbSeen.has(r.knowledge.id)) {
      kbSeen.add(r.knowledge.id);
      kbMerged.push(r.knowledge);
    }
  }
  const profileBlock = formatKnowledge(kbMerged);

  // ── L2.5 RELATIONSHIPS ──
  const peopleBlock = formatPeople(people);
  const timeBlock = currentTimeBlock(new Date(), timeZone);

  // ── L3 STATE ──
  const stateLines: string[] = [];
  if (todos.length > 0) {
    stateLines.push(`งานค้าง ${todos.length} รายการ:`);
    for (const t of todos.slice(0, 6)) {
      stateLines.push(
        `- ${esc(t.title)}${t.due_at ? ` (ครบ ${fmtThaiDate(t.due_at, timeZone)})` : ""}`,
      );
    }
  }
  if (reminders.length > 0) {
    stateLines.push("เตือนที่ตั้งไว้:");
    for (const r of reminders) {
      stateLines.push(`- ${fmtThaiDate(r.fire_at, timeZone)}: ${esc(r.message)}`);
    }
  }
  const stateBlock =
    stateLines.length > 0 ? `<state>\n${stateLines.join("\n")}\n</state>` : "";

  // ── L4 MEMORY (RAG, untrusted evidence) ──
  const memoryBlock = formatMemory(memRelevant, memRecent);

  // ── Domain SOP (request-specific, compiled from action) ──
  const domainBlock = args.action ? compileDomainSop(args.action) : "";

  // T0 (security) + T1 (SOP+identity) + domain SOP + T2 (KB profile) +
  // T2.5 (people) + T3 (state + memory evidence). T0 is always first,
  // T3 evidence is explicitly labeled as untrusted data.
  return [T0_SECURITY_POLICY, T1_PRODUCT_SOP, domainBlock, timeBlock, profileBlock, peopleBlock, stateBlock, memoryBlock]
    .filter(Boolean)
    .join("\n\n");
}
