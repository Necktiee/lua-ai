/**
 * Daily Briefing & Evening Review — เลขาสรุปให้ทุกเช้าและก่อนนอน.
 *
 * Daily Briefing (เช้า):
 *   ☀️ สวัสดีครับ
 *   วันนี้มี
 *   • ประชุม 10:00
 *   • ต้องส่ง Proposal 15:00
 *   • ฝนตกช่วงเย็น
 *   • เหลือ To-do 5 งาน
 *   • วันนี้เป็นวันเกิดแม่
 *   แนะนำ
 *   - โทรหาแม่ก่อน 9 โมง
 *
 * Evening Review (ก่อนนอน):
 *   วันนี้
 *   ✅ ทำเสร็จ 8 งาน
 *   ❌ ค้าง 2 งาน
 *   พรุ่งนี้ควรทำ
 *   1. ...
 *   2. ...
 */
import { requireDb } from "@/lib/db/client";
import { listEventsInRange } from "@/lib/calendar/events";
import { listRecent } from "@/lib/memory/store";
import { chat } from "@/lib/llm/pool";
import { getTodayWeather, weatherToThai } from "@/lib/weather";
import { BANGKOK, bangkokDayBounds, localDateStr, localDayBounds, localMonthDay, localTomorrowBounds } from "@/lib/tz";
import { listOpenFollowUps } from "@/lib/followup/repo";
import type { TodoRecord, CalendarEvent, Person } from "@/lib/types";

function fmtTime(iso: string, timeZone: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  });
}

function ymdInTz(d: Date, timeZone: string): string {
  return localDateStr(d, timeZone);
}

function isToday(dateIso: string, timeZone: string): boolean {
  return ymdInTz(new Date(dateIso), timeZone) === ymdInTz(new Date(), timeZone);
}

function dayBounds(timeZone: string) {
  return timeZone === BANGKOK ? bangkokDayBounds() : localDayBounds(new Date(), timeZone);
}

async function getTodayCalendarEvents(userId: string, timeZone: string): Promise<CalendarEvent[]> {
  const { start, end } = dayBounds(timeZone);
  // Google-first, mirror-fallback — see listEventsInRange. Events the user
  // added directly in Google Calendar or accepted via invite never reach the
  // local mirror, so reading the mirror alone would silently miss meetings.
  const { events } = await listEventsInRange(userId, start, end);
  return events;
}

async function getPendingTodos(userId: string): Promise<TodoRecord[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(20);
  if (error) console.warn("[briefing] todos", error.message);
  return (data ?? []) as TodoRecord[];
}

async function getTodosCompletedToday(userId: string, timeZone: string): Promise<TodoRecord[]> {
  const db = requireDb();
  const { start } = dayBounds(timeZone);
  const { data, error } = await db
    .from("todos")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "done")
    .gte("completed_at", start)
    .order("completed_at", { ascending: false });
  if (error) console.warn("[briefing] todos done", error.message);
  return (data ?? []) as TodoRecord[];
}

async function getBirthdaysToday(userId: string, timeZone: string): Promise<Person[]> {
  const db = requireDb();
  const mmdd = localMonthDay(new Date(), timeZone);
  const { data, error } = await db.from("people").select("*").eq("user_id", userId);
  if (error) console.warn("[briefing] birthdays", error.message);
  const people = (data ?? []) as Person[];
  return people.filter((p) => {
    const bday = p.notes?.birthday as string | undefined;
    return typeof bday === "string" && bday.endsWith(mmdd);
  });
}

// =============================================================
// DAILY BRIEFING
// =============================================================
export async function generateDailyBriefing(userId: string, timeZone = BANGKOK): Promise<string> {
  const [events, todos, followUps, weather, birthdays] = await Promise.all([
    getTodayCalendarEvents(userId, timeZone),
    getPendingTodos(userId),
    listOpenFollowUps(userId),
    getTodayWeather(),
    getBirthdaysToday(userId, timeZone),
  ]);

  const lines: string[] = [];
  lines.push("☀️ สวัสดีครับ สรุปวันนี้ให้นะ\n");

  const sections: string[] = [];

  // Calendar
  if (events.length > 0) {
    const eventLines = events.slice(0, 8).map((e) => `• ${fmtTime(e.start_at, timeZone)} ${e.summary}`);
    sections.push("📅 นัดหมายวันนี้\n" + eventLines.join("\n"));
  }

  // Todos due today
  const todosDueToday = todos.filter((t) => t.due_at && isToday(t.due_at, timeZone));
  const todayYmd = ymdInTz(new Date(), timeZone);
  const todosOverdue = todos.filter(
    (t) => t.due_at && ymdInTz(new Date(t.due_at), timeZone) < todayYmd,
  );
  if (todos.length > 0) {
    const todoInfo = [`• เหลือ To-do ${todos.length} งาน`];
    if (todosDueToday.length > 0) todoInfo.push(`• ครบกำหนดวันนี้ ${todosDueToday.length} งาน`);
    if (todosOverdue.length > 0) todoInfo.push(`⚠️ เลยกำหนด ${todosOverdue.length} งาน`);
    sections.push("📋 งาน\n" + todoInfo.join("\n"));
  }

  // Follow-ups stale
  const staleFollowUps = followUps.filter((f) => {
    const days = (Date.now() - new Date(f.created_at).getTime()) / 86_400_000;
    return days >= 3;
  });
  if (staleFollowUps.length > 0) {
    sections.push("🔁 ติดตาม\n" + staleFollowUps.slice(0, 3).map((f) => `• ${f.subject}${f.waiting_for ? ` (รอ ${f.waiting_for})` : ""}`).join("\n"));
  }

  // Weather
  if (weather) {
    const w: string[] = [`🌤 อากาศ ${weather.tempC}°C ${weatherToThai(weather.description)}`];
    if (weather.rainChance !== undefined && weather.rainChance > 30) {
      w.push(`🌧 โอกาสฝนตก ${weather.rainChance}% ช่วงบ่าย`);
    }
    sections.push(w.join("\n"));
  }

  // Birthdays
  if (birthdays.length > 0) {
    sections.push("🎂 วันเกิดวันนี้\n" + birthdays.map((p) => `• ${p.name}`).join("\n"));
  }

  // Skip sending if nothing to report (avoid empty briefings)
  if (sections.length === 0) {
    return "☀️ สวัสดีครับ วันนี้ไม่มีนัดหมายหรืองานเร่งด่วน สบายใจได้ครับ 😊";
  }

  lines.push(sections.join("\n\n"));

  // LLM suggestions
  const suggestionContext = {
    events: events.slice(0, 5).map((e) => ({ time: fmtTime(e.start_at, timeZone), title: e.summary })),
    todosDueToday: todosDueToday.slice(0, 5).map((t) => t.title),
    todosOverdue: todosOverdue.slice(0, 3).map((t) => t.title),
    birthdays: birthdays.map((p) => p.name),
    weatherRain: weather?.rainChance,
    followUpsStale: staleFollowUps.slice(0, 3).map((f) => f.subject),
  };
  try {
    const suggestion = await chat({
      messages: [
        {
          role: "system",
          content: "เป็นโฮชิ เลขาส่วนตัว. จากข้อมูลวันนี้ แนะนำ 2-3 ข้อสั้นๆ ภาษาไทย (เช่น 'โทรหาแม่ก่อน 9 โมง', 'ออกบ้านเร็วขึ้นเพราะฝน'). ตอบสั้น ไม่เกิน 3 บรรทัด ขึ้นต้นแต่ละบรรทัดด้วย '- '.",
        },
        { role: "user", content: JSON.stringify(suggestionContext) },
      ],
      options: { lite: true, temperature: 0.4, maxOutputTokens: 150 },
    });
    if (suggestion.text?.trim()) {
      lines.push("\n\n💡 แนะนำ\n" + suggestion.text.trim());
    }
  } catch (e) {
    console.warn("[briefing] suggestion LLM failed", (e as Error).message);
  }

  return lines.join("\n");
}

// =============================================================
// EVENING REVIEW
// =============================================================
export async function generateEveningReview(userId: string, timeZone = BANGKOK): Promise<string> {
  const [completed, pending, recent] = await Promise.all([
    getTodosCompletedToday(userId, timeZone),
    getPendingTodos(userId),
    listRecent(userId, 10),
  ]);

  const lines: string[] = [];
  lines.push("🌙 สรุปวันนี้\n");

  lines.push(`✅ ทำเสร็จ ${completed.length} งาน`);
  if (completed.length > 0 && completed.length <= 5) {
    lines.push(completed.map((t) => `   ✓ ${t.title}`).join("\n"));
  }
  if (pending.length > 0) {
    lines.push(`❌ ค้าง ${pending.length} งาน`);
  }

  // Tomorrow preview — Google-first via listEventsInRange so invites the user
  // accepted in Google directly show up here too (mirror only has bot-created events).
  const { start: tmrStart, end: tmrEnd } = localTomorrowBounds(timeZone);
  const { events: tmrEvents } = await listEventsInRange(userId, tmrStart, tmrEnd);
  const tomorrowEvents = tmrEvents as CalendarEvent[];

  // LLM suggestion for tomorrow
  try {
    const ctx = {
      completedToday: completed.map((t) => t.title),
      pendingTodos: pending.slice(0, 10).map((t) => ({ title: t.title, due: t.due_at })),
      tomorrowEvents: tomorrowEvents.map((e) => ({ time: fmtTime(e.start_at, timeZone), title: e.summary })),
      recentActivity: recent.slice(0, 5).map((m) => m.content.slice(0, 80)),
    };
    const suggestion = await chat({
      messages: [
        {
          role: "system",
          content: "เป็นโฮชิ เลขาส่วนตัว. แนะนำลำดับความสำคัญ 3 อย่างแรกที่ควรทำพรุ่งนี้ เรียงตามความสำคัญ. ภาษาไทย สั้นกระชับ. ขึ้นต้นด้วย 1. 2. 3.",
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      options: { lite: true, temperature: 0.4, maxOutputTokens: 200 },
    });
    if (suggestion.text?.trim()) {
      lines.push("\n📌 พรุ่งนี้ควรทำ\n" + suggestion.text.trim());
    }
  } catch (e) {
    console.warn("[review] suggestion LLM failed", (e as Error).message);
  }

  return lines.join("\n");
}
