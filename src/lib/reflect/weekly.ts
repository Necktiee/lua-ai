/**
 * Weekly Reflection — Gap #3 fix.
 * Aggregates the past 7 days (journal entries, goal progress, overdue todos,
 * stale follow-ups) into an LLM-summarized pattern review, pushed once/week
 * (Sunday evening, local time) so the "Reflect" step of the agent loop isn't
 * limited to a single day's journal.
 */
import { requireDb } from "@/lib/db/client";
import { chat } from "@/lib/llm/pool";
import { BANGKOK, localWeekStartISO } from "@/lib/tz";
import { getGoals, getProgressMapForGoals } from "@/lib/goal/repo";
import { getAllOverdueTodosByUser } from "@/lib/todo/repo";
import { getAllStaleFollowUpsByUser } from "@/lib/followup/repo";
import type { JournalEntry } from "@/lib/types";

async function getJournalsSince(userId: string, sinceIso: string): Promise<JournalEntry[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("journal_entries")
    .select("*")
    .eq("user_id", userId)
    .gte("entry_date", sinceIso.slice(0, 10))
    .order("entry_date", { ascending: true });
  if (error) console.warn("[weekly-reflect] journals", error.message);
  return (data ?? []) as JournalEntry[];
}

async function getTodosDoneCountSince(userId: string, sinceIso: string): Promise<number> {
  const db = requireDb();
  const { count, error } = await db
    .from("todos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "done")
    .gte("completed_at", sinceIso);
  if (error) {
    console.warn("[weekly-reflect] todos done", error.message);
    return 0;
  }
  return count ?? 0;
}

/** Generate this user's weekly reflection message. Returns null if nothing to say. */
export async function generateWeeklyReflection(userId: string, timeZone = BANGKOK): Promise<string | null> {
  const weekStartIso = localWeekStartISO(new Date(), timeZone);

  const [journals, todosDoneCount, goals, overdueMap, staleMap] = await Promise.all([
    getJournalsSince(userId, weekStartIso),
    getTodosDoneCountSince(userId, weekStartIso),
    getGoals(userId, "active"),
    getAllOverdueTodosByUser(1),
    getAllStaleFollowUpsByUser(3),
  ]);

  const overdueTodos = overdueMap.get(userId) ?? [];
  const staleFollowUps = staleMap.get(userId) ?? [];
  const progressMap = goals.length > 0 ? await getProgressMapForGoals(goals, timeZone) : new Map<string, number>();

  // Nothing happened this week — skip the push entirely (avoid noise).
  if (journals.length === 0 && todosDoneCount === 0 && goals.length === 0 && overdueTodos.length === 0 && staleFollowUps.length === 0) {
    return null;
  }

  const goalsSummary = goals.map((g) => {
    const progress = progressMap.get(g.id) ?? 0;
    const targetStr = g.target_value ? `/${g.target_value}${g.unit ?? ""}` : "";
    return `${g.title}: ${progress}${targetStr} (${g.period})`;
  });

  const ctx = {
    journalCount: journals.length,
    journalExcerpts: journals.slice(-5).map((j) => j.content.slice(0, 150)),
    todosCompletedThisWeek: todosDoneCount,
    overdueTodoTitles: overdueTodos.slice(0, 5).map((t) => t.title),
    staleFollowUpSubjects: staleFollowUps.slice(0, 5).map((f) => f.subject),
    goals: goalsSummary,
  };

  const lines: string[] = ["🗓 สรุปรอบสัปดาห์"];
  lines.push(`✅ ทำงานเสร็จ ${todosDoneCount} งานในรอบสัปดาห์นี้`);
  if (overdueTodos.length > 0) lines.push(`⚠️ ยังมีงานเลยกำหนด ${overdueTodos.length} งาน`);
  if (staleFollowUps.length > 0) lines.push(`🔁 มีเรื่องรอติดตามค้างนาน ${staleFollowUps.length} เรื่อง`);
  if (goalsSummary.length > 0) lines.push(`🎯 เป้าหมาย\n${goalsSummary.map((s) => `• ${s}`).join("\n")}`);

  try {
    const res = await chat({
      messages: [
        {
          role: "system",
          content:
            "เป็นแจ๋ว เลขาส่วนตัว. จากข้อมูลกิจกรรมสัปดาห์ที่ผ่านมา วิเคราะห์ pattern สั้นๆ (เช่น งานที่ผัดผ่อนซ้ำๆ, เป้าหมายที่ตามหลัง, เรื่องที่ควรปิด) แล้วแนะนำ 2-3 ข้อสำหรับสัปดาห์หน้า ภาษาไทย กระชับ ขึ้นต้นแต่ละข้อด้วย '- '.",
        },
        { role: "user", content: JSON.stringify(ctx) },
      ],
      options: { lite: true, temperature: 0.5, maxOutputTokens: 250 },
    });
    if (res.text?.trim()) {
      lines.push(`\n💡 มองย้อนสัปดาห์\n${res.text.trim()}`);
    }
  } catch (e) {
    console.warn("[weekly-reflect] LLM failed", (e as Error).message);
  }

  return lines.join("\n");
}
