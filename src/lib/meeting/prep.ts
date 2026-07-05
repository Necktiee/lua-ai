/**
 * Meeting Prep — สร้าง brief ก่อนประชุม (feature #6).
 * - Pre-meeting brief: scan calendar events starting in 30 min → recall people+memory context → push.
 * - On-demand: "เตรียมตัวประชุม X" → generate brief.
 */
import { requireDb } from "@/lib/db/client";
import { recall, listRecent } from "@/lib/memory/store";
import { findPerson, getMentionsForPerson } from "@/lib/people/repo";
import { chat } from "@/lib/llm/pool";
import type { CalendarEvent, Person } from "@/lib/types";
import { BANGKOK } from "@/lib/tz";

function fmtTime(iso: string, timeZone = BANGKOK): string {
  return new Date(iso).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

/** Extract names from event summary (e.g. "ประชุมกับ John เรื่อง budget"). */
async function extractNamesFromText(text: string): Promise<string[]> {
  const { extractPeopleFromText } = await import("@/lib/people/repo");
  return extractPeopleFromText(text);
}

export async function generateMeetingBrief(userId: string, event: CalendarEvent): Promise<string> {
  const { getSettings } = await import("@/lib/settings/repo");
  const settings = await getSettings(userId);
  const tz = settings.timezone || BANGKOK;
  // 1. Extract people from event title
  const names = await extractNamesFromText(event.summary);

  // 2. Look up people records + gather context
  const peopleContext: string[] = [];
  for (const name of names.slice(0, 3)) {
    const person = await findPerson(userId, name);
    if (person) {
      const mentions = await getMentionsForPerson(person.id, 3);
      const notes = person.notes ?? {};
      const noteStrs = Object.entries(notes).slice(0, 4).map(([k, v]) => `${k}: ${String(v)}`);
      peopleContext.push(`${person.name}${noteStrs.length > 0 ? ` (${noteStrs.join(", ")})` : ""}${mentions.length > 0 ? `, ${mentions.length} ครั้งที่พบ` : ""}`);
    } else {
      peopleContext.push(`${name} (ยังไม่มีข้อมูล)`);
    }
  }

  // 3. Recall related memories
  const memoryResults = await recall(userId, event.summary, 5);

  const lines: string[] = [];
  lines.push(`📋 เตรียมประชุม`);
  lines.push(`📅 ${fmtTime(event.start_at, tz)} — ${event.summary}`);
  if (event.location) lines.push(`📍 ${event.location}`);

  if (peopleContext.length > 0) {
    lines.push(`\n👥 คนที่เกี่ยวข้อง`);
    lines.push(...peopleContext.map((p) => `• ${p}`));
  }

  if (memoryResults.length > 0) {
    lines.push(`\n📝 ที่เกี่ยวข้อง`);
    for (const r of memoryResults.slice(0, 4)) {
      if (r.similarity < 0.3) continue;
      const date = new Date(r.memory.created_at).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
      lines.push(`• ${date} — ${r.memory.content.slice(0, 120)}`);
    }
  }

  // 4. LLM suggested questions
  try {
    const ctx = {
      event: event.summary,
      people: peopleContext,
      memories: memoryResults.slice(0, 3).map((r) => r.memory.content.slice(0, 100)),
    };
    const res = await chat({
      messages: [
        {
          role: "system",
          content: "เป็นโฮชิ เลขาส่วนตัว. แนะนำคำถามสำคัญ 2-3 ข้อที่ควรถามในประชุมนี้ ภาษาไทย สั้นๆ. ขึ้นต้นด้วย '? '",
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      options: { lite: true, temperature: 0.4, maxOutputTokens: 150 },
    });
    if (res.text?.trim()) {
      lines.push(`\n💡 ควรถาม`);
      lines.push(res.text.trim());
    }
  } catch (e) {
    console.warn("[meeting-prep] LLM failed", (e as Error).message);
  }

  return lines.join("\n");
}

/** Get upcoming events in next N minutes for pre-meeting push (on-demand chat use — swallows auth errors). */
export async function getEventsStartingSoon(userId: string, withinMinutes = 30): Promise<CalendarEvent[]> {
  const { events } = await getEventsStartingSoonDetailed(userId, withinMinutes);
  return events;
}

/** Classify a thrown error from the Google Calendar client for proactive notification purposes. */
function classifyGoogleError(msg: string): "not_connected" | "expired" | undefined {
  if (msg.includes("ยังไม่ได้เชื่อม")) return "not_connected";
  if (/invalid_grant|unauthorized|invalid_token|token.*expired|token.*revoked/i.test(msg)) return "expired";
  return undefined;
}

async function fallbackDbEvents(userId: string, withinMinutes: number): Promise<CalendarEvent[]> {
  const db = requireDb();
  const now = new Date();
  const cutoff = new Date(now.getTime() + withinMinutes * 60_000);
  const { data, error } = await db
    .from("calendar_events")
    .select("*")
    .eq("user_id", userId)
    .gte("start_at", now.toISOString())
    .lte("start_at", cutoff.toISOString())
    .order("start_at", { ascending: true });
  if (error) console.warn("[meeting-prep] events", error.message);
  return (data ?? []) as CalendarEvent[];
}

/**
 * Same as getEventsStartingSoon but surfaces whether the primary Google fetch
 * failed due to an auth problem, so the cron can proactively notify the user
 * instead of failing silently (Gap #6).
 */
export async function getEventsStartingSoonDetailed(
  userId: string,
  withinMinutes = 30,
): Promise<{ events: CalendarEvent[]; authError?: "not_connected" | "expired" }> {
  try {
    const { listEventsWithinMinutes } = await import("@/lib/calendar/events");
    const items = await listEventsWithinMinutes(userId, withinMinutes);
    const mapped: CalendarEvent[] = [];
    for (const e of items) {
      const startRaw = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T09:00:00+07:00` : null);
      const endRaw = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T10:00:00+07:00` : null);
      if (!startRaw || !e.id) continue;
      mapped.push({
        id: e.id,
        user_id: userId,
        google_event_id: e.id,
        summary: e.summary ?? "(ไม่มีชื่อ)",
        start_at: new Date(startRaw).toISOString(),
        end_at: endRaw
          ? new Date(endRaw).toISOString()
          : new Date(new Date(startRaw).getTime() + 3_600_000).toISOString(),
        location: e.location ?? undefined,
        created_at: new Date().toISOString(),
      });
    }
    return { events: mapped };
  } catch (e) {
    const msg = (e as Error).message;
    const authError = classifyGoogleError(msg);
    console.warn("[meeting-prep] google events fallback to DB", msg);
    const events = await fallbackDbEvents(userId, withinMinutes);
    return { events, authError };
  }
}
