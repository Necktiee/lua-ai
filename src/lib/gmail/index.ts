/**
 * Gmail integration — Inbox Zero (feature #5).
 * Reuses per-user Google OAuth tokens (with gmail.readonly scope).
 * - summarizeInbox: fetch unread, classify via LLM → summary
 * - draftReply: generate reply text for an email (user sends manually)
 */
import { google } from "googleapis";
import { getAuthedClient } from "@/lib/calendar/events";
import { requireDb } from "@/lib/db/client";
import { chat } from "@/lib/llm/pool";

export interface EmailSummary {
  total: number;
  urgent: Array<{ from: string; subject: string; snippet: string }>;
  meetings: Array<{ from: string; subject: string; date?: string }>;
  invoices: Array<{ from: string; subject: string }>;
  newsletters: number;
  spam: number;
}

interface MimePart {
  body?: { data?: string };
  mimeType?: string;
  parts?: MimePart[];
}

interface RawMessage {
  id: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
    parts?: MimePart[];
    body?: { data?: string };
  };
  snippet?: string;
}

function decodeBase64Url(s: string): string {
  const decoded = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return decoded.toString("utf-8");
}

function getHeader(msg: RawMessage, name: string): string {
  return msg.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function findPlainText(parts: MimePart[]): string | null {
  const direct = parts.find((p) => p.mimeType === "text/plain");
  if (direct?.body?.data) return decodeBase64Url(direct.body.data).slice(0, 2000);
  for (const p of parts) {
    if (p.parts?.length) {
      const nested = findPlainText(p.parts);
      if (nested) return nested;
    }
  }
  return null;
}

function getBody(msg: RawMessage): string {
  const parts = msg.payload?.parts ?? [];
  const fromParts = parts.length ? findPlainText(parts) : null;
  if (fromParts) return sanitizeEmailForLlm(fromParts);
  if (msg.payload?.body?.data) return sanitizeEmailForLlm(decodeBase64Url(msg.payload.body.data).slice(0, 2000));
  return sanitizeEmailForLlm(msg.snippet ?? "");
}

/** Strip prompt-injection patterns from untrusted email/text before LLM. */
export function sanitizeEmailForLlm(text: string): string {
  return text
    .slice(0, 800)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\b(system|assistant|user|ignore previous|disregard):\s*/gi, "")
    .replace(/<\/?[a-z][^>]*>/gi, "");
}

/** Fetch unread emails from last 24h. */
export async function fetchUnreadEmails(userId: string, maxResults = 30): Promise<RawMessage[]> {
  const client = await getAuthedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const oneDayAgo = Math.floor(Date.now() / 1000 - 86400);
  const { data: list } = await gmail.users.messages.list({
    userId: "me",
    q: `is:unread after:${oneDayAgo}`,
    maxResults,
  });
  if (!list.messages || list.messages.length === 0) return [];

  const messages: RawMessage[] = [];
  for (const m of list.messages) {
    const { data: msg } = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" });
    messages.push(msg as unknown as RawMessage);
  }
  return messages;
}

export async function summarizeInbox(userId: string): Promise<string> {
  const db = requireDb();
  const { data: tok } = await db.from("google_tokens").select("scope").eq("user_id", userId).maybeSingle();
  const scope = tok?.scope ?? "";
  if (!scope.includes("gmail.readonly")) {
    return "ยังไม่ได้อนุญาต Gmail — พิมพ์ 'เชื่อม calendar' อีกครั้งเพื่อให้สิทธิ์อ่านเมล";
  }

  let messages: RawMessage[];
  try {
    messages = await fetchUnreadEmails(userId, 30);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("invalid_grant") || msg.includes("unauthorized") || msg.includes("ยังไม่ได้เชื่อม")) {
      return "ยังไม่ได้เชื่อม Gmail พิมพ์ 'เชื่อม calendar' เพื่อเริ่ม OAuth (ใช้สิทธิ์ Gmail ด้วย)";
    }
    throw e;
  }

  if (messages.length === 0) return "📭 ไม่มีเมลใหม่ใน 24 ชม.ล่าสุด — Inbox Zero! 🎉";

  // Parse emails
  const parsed = messages.map((m) => ({
    from: getHeader(m, "From"),
    subject: getHeader(m, "Subject"),
    body: getBody(m),
    snippet: m.snippet ?? "",
  }));

  // Classify via LLM
  const res = await chat({
    messages: [
      {
        role: "system",
        content: `จำแนกอีเมลเป็นหมวดและสรุปเป็นภาษาไทย ส่งกลับเป็น JSON:
{
  "urgent": [{"from":"","subject":"","reason":""}],
  "meetings": [{"from":"","subject":"","date":""}],
  "invoices": [{"from":"","subject":""}],
  "newsletters": number,
  "spam": number
}
- urgent: ต้องตอบด่วน/สำคัญ
- meetings: เชิญประชุม/นัดหมาย
- invoices: ใบแจ้งหนี้/ใบเสร็จ
- newsletters: จดหมายข่าว/โปรโมชั่น
- spam: สแปม
ส่งกลับ JSON เท่านั้น ไม่มีคำอธิบาย`,
      },
      { role: "user", content: JSON.stringify(parsed.slice(0, 30)) },
    ],
    options: { temperature: 0.2, maxOutputTokens: 800 },
  });

  let summary: EmailSummary;
  try {
    const cleaned = res.text.replace(/```json|```/g, "").trim();
    summary = JSON.parse(cleaned);
    summary.urgent = Array.isArray(summary.urgent) ? summary.urgent : [];
    summary.meetings = Array.isArray(summary.meetings) ? summary.meetings : [];
    summary.invoices = Array.isArray(summary.invoices) ? summary.invoices : [];
    summary.newsletters = typeof summary.newsletters === "number" ? summary.newsletters : 0;
    summary.spam = typeof summary.spam === "number" ? summary.spam : 0;
    summary.total = messages.length;
  } catch {
    // fallback: simple format
    return `📬 มีเมลใหม่ ${messages.length} ฉบับใน 24 ชม.ล่าสุด\n\n` +
      parsed.slice(0, 8).map((m) => `• ${m.subject.slice(0, 60)} — ${m.from.slice(0, 40)}`).join("\n");
  }

  const lines: string[] = [];
  lines.push(`📬 สรุป Inbox (24 ชม.ล่าสุด)`);
  lines.push(`รวม ${summary.total} ฉบับ | ด่วน ${summary.urgent.length} | ประชุม ${summary.meetings.length} | ใบแจ้งหนี้ ${summary.invoices.length} | newsletter ${summary.newsletters} | spam ${summary.spam}\n`);

  if (summary.urgent.length > 0) {
    lines.push(`🔴 ต้องตอบด่วน`);
    for (const e of summary.urgent.slice(0, 4)) {
      lines.push(`• ${e.subject} — ${e.from}`);
    }
    lines.push("");
  }

  if (summary.meetings.length > 0) {
    lines.push(`📅 ประชุม`);
    for (const e of summary.meetings.slice(0, 4)) {
      lines.push(`• ${e.subject}${e.date ? ` (${e.date})` : ""} — ${e.from}`);
    }
    lines.push("");
  }

  if (summary.invoices.length > 0) {
    lines.push(`💰 ใบแจ้งหนี้`);
    for (const e of summary.invoices.slice(0, 4)) {
      lines.push(`• ${e.subject} — ${e.from}`);
    }
  }

  lines.push(`\nพิมพ์ "ตอบเมล ..." เพื่อให้ช่วยร่างคำตอบ`);
  return lines.join("\n");
}

/** Fetch unread emails newer than `sinceMinutesAgo` minutes (bounded window for frequent cron polling). */
export async function fetchRecentUnreadEmails(userId: string, sinceMinutesAgo: number, maxResults = 20): Promise<RawMessage[]> {
  const client = await getAuthedClient(userId);
  const gmail = google.gmail({ version: "v1", auth: client });

  const sinceEpoch = Math.floor(Date.now() / 1000 - sinceMinutesAgo * 60);
  const { data: list } = await gmail.users.messages.list({
    userId: "me",
    q: `is:unread after:${sinceEpoch}`,
    maxResults,
  });
  if (!list.messages || list.messages.length === 0) return [];

  const messages: RawMessage[] = [];
  for (const m of list.messages) {
    const { data: msg } = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "full" });
    messages.push(msg as unknown as RawMessage);
  }
  return messages;
}

async function alreadyNotifiedEmail(userId: string, gmailMessageId: string): Promise<boolean> {
  const db = requireDb();
  // Only skip if status is 'sent' or 'skipped'. 'pending' means a previous
  // push failed and the email should be retried.
  const { data, error } = await db
    .from("email_notified")
    .select("id")
    .eq("user_id", userId)
    .eq("gmail_message_id", gmailMessageId)
    .in("status", ["sent", "skipped"])
    .maybeSingle();
  if (error) console.warn("[gmail] notified check", error.message);
  return !!data;
}

async function markEmailNotified(userId: string, gmailMessageId: string, status: "pending" | "sent" | "skipped" = "sent"): Promise<void> {
  const db = requireDb();
  // Upsert with status — if row already exists (race), update status
  const { error } = await db
    .from("email_notified")
    .upsert({ user_id: userId, gmail_message_id: gmailMessageId, status }, { onConflict: "user_id,gmail_message_id" });
  if (error && error.code !== "23505") console.warn("[gmail] notified mark", error.message);
}

/** Update the status of an already-claimed email notification. */
export async function updateEmailStatus(userId: string, gmailMessageId: string, status: "sent" | "skipped"): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("email_notified")
    .update({ status })
    .eq("user_id", userId)
    .eq("gmail_message_id", gmailMessageId);
  if (error) console.warn("[gmail] updateEmailStatus", error.message);
}

/** Release a pending email claim so the next cron tick can retry it. */
export async function releaseEmailClaim(userId: string, gmailMessageId: string): Promise<void> {
  const db = requireDb();
  const { error } = await db
    .from("email_notified")
    .delete()
    .eq("user_id", userId)
    .eq("gmail_message_id", gmailMessageId)
    .eq("status", "pending");
  if (error) console.warn("[gmail] releaseEmailClaim", error.message);
}

export interface UrgentEmailResult {
  urgent: Array<{ id: string; from: string; subject: string; snippet: string; body: string }>;
  authError?: "not_connected" | "expired";
}

/**
 * Proactive urgent-email check for cron use — bounded time window (avoids full 24h rescans),
 * classifies unread mail via LLM, filters out already-notified messages, returns only new urgent ones.
 */
export async function checkUrgentEmails(userId: string, sinceMinutesAgo = 15): Promise<UrgentEmailResult> {
  const db = requireDb();
  const { data: tok } = await db.from("google_tokens").select("scope").eq("user_id", userId).maybeSingle();
  const scope = tok?.scope ?? "";
  if (!scope.includes("gmail.readonly")) return { urgent: [] };

  let messages: RawMessage[];
  try {
    messages = await fetchRecentUnreadEmails(userId, sinceMinutesAgo, 20);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes("invalid_grant") || msg.includes("unauthorized") || msg.includes("invalid_token") || /token.*(expired|revoked)/i.test(msg)) {
      return { urgent: [], authError: "expired" };
    }
    if (msg.includes("ยังไม่ได้เชื่อม")) return { urgent: [], authError: "not_connected" };
    throw e;
  }
  if (messages.length === 0) return { urgent: [] };

  // Skip messages already notified before spending an LLM call on them.
  // 'pending' status (from a previous failed push) is NOT skipped — retry.
  const fresh: RawMessage[] = [];
  for (const m of messages) {
    if (!(await alreadyNotifiedEmail(userId, m.id))) fresh.push(m);
  }
  if (fresh.length === 0) return { urgent: [] };

  // Claim each fresh email as 'pending' BEFORE classification. This prevents
  // concurrent cron workers from both classifying and pushing the same email.
  for (const m of fresh) {
    await markEmailNotified(userId, m.id, "pending");
  }

  const parsed = fresh.map((m) => ({
    id: m.id,
    from: getHeader(m, "From"),
    subject: getHeader(m, "Subject"),
    body: getBody(m),
    snippet: m.snippet ?? "",
  }));

  const res = await chat({
    messages: [
      {
        role: "system",
        content: `จำแนกว่าอีเมลแต่ละฉบับ "ด่วน/สำคัญต้องรีบตอบ" หรือไม่ ส่งกลับ JSON เท่านั้น:
{"urgentIds": ["id1", "id2"]}
เกณฑ์ด่วน: deadline ใกล้, ขอคำตอบ/อนุมัติ, ปัญหาเร่งด่วน, คนสำคัญทวงถาม. ไม่ใช่ newsletter/โปรโมชั่น/สแปม/จดหมายทั่วไป.`,
      },
      { role: "user", content: JSON.stringify(parsed.map((p) => ({ id: p.id, from: p.from, subject: p.subject, snippet: p.snippet }))) },
    ],
    options: { temperature: 0.1, maxOutputTokens: 300, lite: true },
  });

  let urgentIds: string[] = [];
  try {
    const cleaned = res.text.replace(/```json|```/g, "").trim();
    const j = JSON.parse(cleaned);
    urgentIds = Array.isArray(j.urgentIds) ? j.urgentIds : [];
  } catch {
    urgentIds = [];
  }

  const urgent = parsed.filter((p) => urgentIds.includes(p.id));
  // Mark non-urgent emails as 'skipped' so they aren't reclassified every tick.
  // Urgent ones stay 'pending' — the cron route marks them 'sent' after
  // successful LINE push, or deletes the claim to retry on failure.
  const urgentIdsSet = new Set(urgent.map((u) => u.id));
  for (const m of fresh) {
    if (!urgentIdsSet.has(m.id)) {
      await updateEmailStatus(userId, m.id, "skipped");
    }
  }
  return { urgent };
}

/** Draft a reply for a given email context. */
export async function draftEmailReply(userId: string, context: string): Promise<string> {
  const db = requireDb();
  const { data: tok } = await db.from("google_tokens").select("scope").eq("user_id", userId).maybeSingle();
  const scope = tok?.scope ?? "";
  if (!scope.includes("gmail.readonly")) {
    return "ยังไม่ได้อนุญาต Gmail — พิมพ์ 'เชื่อม calendar' อีกครั้งเพื่อให้สิทธิ์อ่านเมล";
  }

  const res = await chat({
    messages: [
      {
        role: "system",
        content: `ร่างคำตอบอีเมลเป็นภาษาไทย (หรือภาษาที่เหมาะสม) สุภาพ กระชับ. ขึ้นต้นด้วย "เรียน คุณ..." จบด้วย "ขอแสดงความนับถือ". ไม่ใส่หัวเรื่อง.`,
      },
      { role: "user", content: `บริบท: ${sanitizeEmailForLlm(context)}\n\nร่างคำตอบ:` },
    ],
    options: { temperature: 0.5, maxOutputTokens: 300 },
  });
  return `✉️ ร่างคำตอบ:\n\n${res.text?.trim() ?? "(ไม่สามารถร่างได้)"}`;
}
