/**
 * Journal repo — Auto Journal (feature #13).
 * Nightly cron generates a summary of the day's activity.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { chat } from "@/lib/llm/pool";
import { bangkokDateStr, bangkokDayBounds, localDateStr, localDayBounds } from "@/lib/tz";
import type { JournalEntry } from "@/lib/types";

export async function getJournalEntry(userId: string, date: Date, timeZone?: string): Promise<JournalEntry | null> {
  const db = requireDb();
  const dateStr = timeZone ? localDateStr(date, timeZone) : bangkokDateStr(date);
  const { data, error } = await db
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .eq("entry_date", dateStr)
    .maybeSingle();
  if (error) console.warn("[journal] get", error.message);
  return (data as JournalEntry) ?? null;
}

export async function generateAndStoreJournal(
  userId: string,
  date: Date = new Date(),
  timeZone?: string,
): Promise<JournalEntry | null> {
  const db = requireDb();
  await touchUser(userId);
  const dateStr = timeZone ? localDateStr(date, timeZone) : bangkokDateStr(date);

  const { start, end } = timeZone ? localDayBounds(date, timeZone) : bangkokDayBounds(date);

  const [memoriesToday, todosDone, todosPending, events] = await Promise.all([
    db.from("memory").select("id, content").eq("user_id", userId).gte("created_at", start).lte("created_at", end).order("created_at", { ascending: false }).limit(15),
    db.from("todos").select("title").eq("user_id", userId).eq("status", "done").gte("completed_at", start).lte("completed_at", end),
    db.from("todos").select("title").eq("user_id", userId).eq("status", "pending"),
    db.from("calendar_events").select("summary,start_at").eq("user_id", userId).gte("start_at", start).lte("start_at", end),
  ]);

  const recent = memoriesToday.data ?? [];
  const ctx = {
    memories: recent.slice(0, 10).map((m: { content: string }) => m.content.slice(0, 100)),
    todosCompleted: (todosDone.data ?? []).map((t: { title: string }) => t.title),
    todosStillPending: (todosPending.data ?? []).slice(0, 5).map((t: { title: string }) => t.title),
    events: (events.data ?? []).map((e: { summary: string; start_at: string }) => ({ title: e.summary, time: e.start_at })),
  };

  let content: string;
  try {
    const res = await chat({
      messages: [
        {
          role: "system",
          content: `เขียนไดอารี่สั้นๆ สรุปวันนี้เป็นภาษาไทย 3-5 ประโยค เกริ่นแบบส่วนตัว (เหมือนเขียนเอง). กล่าวถึงสิ่งที่ทำ ประชุม ความคืบหน้า และสิ่งที่ค้างไว้. ไม่ต้องใส่หัวข้อย่อย ให้เป็นย่อหน้าเดียว.`,
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      options: { temperature: 0.6, maxOutputTokens: 300 },
    });
    content = res.text?.trim() || "ไม่มีกิจกรรมบันทึกไว้วันนี้";
  } catch (e) {
    console.warn("[journal] LLM failed", (e as Error).message);
    content = `วันนี้ทำงาน ${ctx.todosCompleted.length} งาน${ctx.events.length > 0 ? `, มีนัด ${ctx.events.length} นัด` : ""}${ctx.todosStillPending.length > 0 ? `, ค้าง ${ctx.todosStillPending.length} งาน` : ""}.`;
  }

  const memoryIds = recent.slice(0, 5).map((m: { id: string }) => m.id);

  const { data, error } = await db
    .from("journal_entries")
    .upsert({
      user_id: userId,
      entry_date: dateStr,
      content,
      auto_generated: true,
      related_memory_ids: memoryIds,
    }, { onConflict: "user_id,entry_date" })
    .select()
    .single();
  if (error) {
    console.warn("[journal] store", error.message);
    return null;
  }
  return data as JournalEntry;
}
