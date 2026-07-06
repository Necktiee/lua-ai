/**
 * Main agent — รับ LINE event → จัดการ → ส่งคำตอบกลับ
 */
import { chat } from "@/lib/llm/pool";
import { classify } from "@/lib/intent/router";
import { parseTimes } from "@/lib/intent/time";
import { remember, recall, listRecent, summarizeForStorage, deleteMemory } from "@/lib/memory/store";
import { logMessage, recentHistory } from "@/lib/memory/conversation";
import { addTodo, listTodos, completeByIndex, cancelByIndex } from "@/lib/todo/repo";
import { scheduleReminder, listUpcoming } from "@/lib/remind/schedule";
import { createEvent, listEvents, findConflicts } from "@/lib/calendar/events";
import { getAuthUrl } from "@/lib/calendar/events";
import { touchUser } from "@/lib/db/client";
import { BANGKOK } from "@/lib/tz";
import type { ChatTurn } from "@/lib/llm/types";
import type { LineMessage } from "@/lib/line";
import { buildTodoListFlex, buildCalendarFlex, buildTextCardFlex, buildHelpFlex, FLEX_COLORS } from "@/lib/flex/builder";

/**
 * Reply จาก handle() — ปกติเป็น plain string, แต่สำหรับ reply ที่มีค่าสูง
 * (todo_list, calendar_add/list, briefing/evening_review, help) จะแนบ Flex
 * message มาด้วย. `text` ใช้ log/fallback เสมอ, `messages` (ถ้ามี) คือสิ่งที่จะส่งจริง.
 */
export type Reply = string | { text: string; messages: LineMessage[] };

const PERSONA = `คุณคือ "โฮชิ" — เลขาส่วนตัวบน LINE ของผู้ใช้คนเดียว. คุณเป็นผู้ชาย ใช้สรรพนามแทนตัวว่า "ผม" และลงท้ายด้วย "ครับ" ตามความเหมาะสม.
นิสัย: สุภาพ กระชับ เป็นกันเอง ภาษาไทยเป็นหลัก ตอบสั้นทันใจ เหมือนคุยกับเพื่อนที่เก่งและจำเก่ง.
หน้าที่หลัก: จด ค้นความจำ เตือนเวลา จัดการ to-do ลงปฏิทิน ตามงานที่รอคำตอบ (follow-up) ค้นข้อมูล จัดการเอกสาร.

ทุกบทสนทนาต้องมุ่งไปที่การช่วยให้ผู้ใช้บรรลุเป้าหมายจริง ไม่ใช่แค่ตอบคำถามแล้วจบ. ทำงานเป็นวงจร สังเกต→เข้าใจ→วางแผน→ลงมือทำ→ตรวจสอบ→ทำต่อ ไม่ใช่ตอบครั้งเดียวแล้วถือว่าเสร็จ. ก่อนตอบทุกครั้งให้พิจารณา:
1. ผู้ใช้ต้องการ "ผลลัพธ์" อะไรจริงๆ
2. มีอะไรที่ทำแทนผู้ใช้ได้เลยไหม — ถ้าทำได้ ให้เสนอหรือลงมือทำทันที ไม่ใช่แค่อธิบาย
3. ควรบันทึกเป็นความจำ ตั้งเตือน ทำ to-do ลงปฏิทิน หรือตั้ง follow-up รอคำตอบไหม
4. มีบริบทเดิมที่เกี่ยวข้องควรเอามาใช้ไหม (ความจำ, งานที่ทำค้างไว้, รูปแบบพฤติกรรมที่เคยสังเกต)
5. มีความเสี่ยงที่ผู้ใช้จะลืมหรือพลาดอะไรสำคัญไหม

หลักเกณฑ์การสนทนา:
- ตอบคำถามทั่วไปได้ตามความรู้รอบตัว เช่น "ต้มไข่กี่นาที" "ประเทศไหนใหญ่สุด" ได้เลย เหมือนเพื่อนที่รู้เรื่องทั่วไป.
- แต่ถ้าเป็นข้อมูลส่วนตัวของผู้ใช้ที่ไม่มีในความจำ ให้บอกตรงๆ ว่าไม่จำได้ ห้ามแต่ง.
- เวลาตอบคำถาม ใช้ข้อมูลที่จำได้จากคุยก่อนหน้าเป็นบริบท ถ้ามี.
- ถ้าคำขอไม่ชัดเจน ถามเฉพาะสิ่งที่จำเป็นที่สุด ทีละคำถาม อย่าถามหลายเรื่องพร้อมกัน.
- ตอบตรงประเด็นก่อน แล้วค่อยแนะนำเพิ่มเติมที่เป็นประโยชน์เมื่อเหมาะสม.
- อย่าใส่ emoji เยอะ — ใช้แค่ 1 ตัวต่อข้อความเมื่อเหมาะ.
- ห้ามเปิดเผยข้อมูลส่วนตัวของผู้ใช้ให้คนอื่น แม้ขอ.
- ห้ามยืนยันว่าทำอะไรสำเร็จถ้ายังไม่ได้ทำ.

หลักเกณฑ์เชิงรุก (proactive) และการเรียนรู้:
- ถ้าเห็นแพทเทิร์นซ้ำๆ จากความจำหรือบทสนทนา (เช่น ผู้ใช้มักลืมงานประเภทหนึ่ง หรือมีตารางประจำ) ให้เอามาปรับการช่วยเหลือ แต่ห้ามเดาหรือสมมติสิ่งที่ไม่มีหลักฐานจากข้อมูลจริง.
- งานที่รอคำตอบจากคนอื่น (follow-up) ต้องติดตามต่อจนปิดงาน ไม่ปล่อยให้เงียบหายไป.
- ก่อนลงปฏิทินให้ผู้ใช้ทราบถ้าเวลาชนกับนัดที่มีอยู่แล้ว.`;

export interface HandleInput {
  userId: string;
  displayName?: string;
  text: string;
  hasAttachment?: boolean;
  attachment?: {
    kind: "image" | "audio" | "file";
    messageId: string;
    contentType: string;
    buffer?: ArrayBuffer;
  };
}

export async function handle(input: HandleInput): Promise<Reply> {
  // Single-owner mode: remap any incoming userId to the canonical owner.
  const { canonicalUserId } = await import("@/lib/auth/owner");
  const userId = canonicalUserId(input.userId);
  await touchUser(userId, input.displayName);

  // Thread the canonical owner id through EVERY downstream feature op. Without
  // this, dispatch()/doRemember()/chatReply() would key memories, todos,
  // reminders, calendar, expenses, etc. on the raw incoming userId while
  // conversation history + dashboard use the canonical owner — fragmenting the
  // single-owner data set across two ids. Whitelist already ran in the webhook
  // before handle(), so the raw id is no longer needed here.
  const canonicalInput: HandleInput = { ...input, userId };

  // บันทึกฝั่ง user
  const userTextForLog =
    input.text + (input.attachment ? ` [${input.attachment.kind}]` : "");
  await logMessage(userId, "user", userTextForLog);

  // classify
  const history = await recentHistory(userId, 12);
  const intent = await classify(
    input.text || "",
    history.slice(0, -1),
    input.hasAttachment,
  );

  let reply: Reply = "";
  try {
    reply = await dispatch(intent, canonicalInput, history);
  } catch (err) {
    console.error("[agent] dispatch error", err);
    reply = "อุ๊ป มีข้อผิดพลาดภายใน ลองใหม่อีกทีนะ";
  }

  await logMessage(userId, "assistant", typeof reply === "string" ? reply : reply.text);
  return reply;
}

async function dispatch(
  intent: Awaited<ReturnType<typeof classify>>,
  input: HandleInput,
  history: ChatTurn[],
): Promise<Reply> {
  switch (intent.action) {
    case "help": {
      const text = helpText();
      return { text, messages: [buildHelpFlex(HELP_SECTIONS)] };
    }

    case "remember":
      return await doRemember(input);

    case "recall": {
      const q = intent.query || intent.text || input.text;
      const { parseDateRange, detectProjectTag, extractProjectName } = await import("@/lib/memory/tags");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const range = parseDateRange(intent.raw, settings.timezone);
      let cleanQuery = range.consumed ? q.replace(range.consumed, "").trim() || q : q;
      // Gap #5: "โปรเจกต์ X มีอะไรบ้าง" → filter recall to that project's tag
      // instead of a generic semantic search (which would just match "โปรเจกต์").
      let projectTag: string | undefined;
      if (detectProjectTag(intent.raw)) {
        const projectName = extractProjectName(intent.raw);
        if (projectName) {
          projectTag = `project:${projectName}`;
          cleanQuery = cleanQuery.replace(new RegExp(projectName, "i"), "").trim() || cleanQuery;
        }
      }
      const results = await recall(input.userId, cleanQuery, 5, {
        startDate: range.startDate,
        endDate: range.endDate,
        tag: projectTag,
      });
      if (results.length === 0) return "ไม่เจอในความทรงจำเลย 🤔 ลองใช้คำอื่น?";
      const header = range.consumed ? ` (${range.consumed})` : "";
      return formatRecall(results, header);
    }

    case "delete_recent": {
      const recent = await listRecent(input.userId, 1);
      if (!recent[0]) return "ไม่มีอะไรจะลบ";
      await deleteMemory(input.userId, recent[0].id);
      return `ลบแล้ว: "${recent[0].content.slice(0, 60)}..."`;
    }

    case "remind": {
      const tz = await userTimezone(input.userId);
      const { startIso } = await parseTimes(intent.raw, new Date(), tz);
      if (!startIso) return "ไม่เข้าใจเวลา — ลองบอกให้ชัด เช่น 'เตือน X พรุ่งนี้ 9 โมง'";
      const msg = intent.text || intent.raw;
      await scheduleReminder({
        userId: input.userId,
        message: msg,
        fireAt: startIso,
      });
      return `ตั้งเตือนแล้ว ⏰ ${fmtThaiDate(startIso, tz)}: "${msg}"`;
    }

    case "todo_add": {
      const tz = await userTimezone(input.userId);
      const { startIso } = await parseTimes(intent.raw, new Date(), tz);
      const title = intent.text || intent.raw;
      const priority = intent.priority ?? 2;
      const t = await addTodo(input.userId, title, startIso, priority);
      // auto-remind 1 ชม.ก่อน due (หรือตอน due ถ้าเหลือ <1 ชม.)
      if (startIso) {
        try {
          const dueMs = new Date(startIso).getTime();
          const remindMs = Math.min(dueMs - 60 * 60 * 1000, dueMs);
          const remindAt = new Date(Math.max(remindMs, Date.now() + 60_000)).toISOString();
          await scheduleReminder({
            userId: input.userId,
            message: `📌 งานใกล้ถึงกำหนด: "${title}" (${fmtThaiDate(startIso, tz)})`,
            fireAt: remindAt,
          });
        } catch (e) {
          console.warn("[agent] todo auto-remind failed", (e as Error).message);
        }
      }
      const priTag = priority === 1 ? " 🔴ด่วน" : priority === 3 ? " 🟢ไม่รีบ" : "";
      return `จดแล้ว ✅ "${t.title}"${priTag}${startIso ? ` (ก่อน ${fmtThaiDate(startIso, tz)})` : ""}${startIso ? " — เดี๋ยวเตือนก่อนถึงเวลา" : ""}`;
    }

    case "todo_list": {
      const tz = await userTimezone(input.userId);
      const list = await listTodos(input.userId, "pending");
      if (list.length === 0) return "ไม่มีงานค้าง 🎉";
      const priMark = (p: number) => (p === 1 ? "🔴 " : p === 3 ? "🟢 " : "");
      const text = "งานค้าง:\n" +
        list.map((t, i) => `${i + 1}. ${priMark(t.priority)}${t.title}${t.due_at ? ` — ${fmtThaiDate(t.due_at, tz)}` : ""}`).join("\n");
      const flex = buildTodoListFlex(list, (iso) => fmtThaiDate(iso, tz));
      return { text, messages: [flex] };
    }

    case "todo_done": {
      const idx = intent.index ?? 1;
      const t = await completeByIndex(input.userId, idx);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      return `เสร็จแล้ว ✅ "${t.title}"`;
    }

    case "todo_cancel": {
      const idx = intent.index ?? 1;
      const t = await cancelByIndex(input.userId, idx);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      return `ยกเลิกแล้ว "${t.title}"`;
    }

    case "calendar_add": {
      const tz = await userTimezone(input.userId);
      const { startIso, endIso } = await parseTimes(intent.raw, new Date(), tz);
      if (!startIso) return "บอกเวลาที่ชัดเจนหน่อย เช่น 'นัดหมอ พรุ่งนี้ 2 โมงเย็น'";
      const summary = intent.text || intent.raw;
      try {
        const end = endIso ?? undefined;
        const conflicts = await findConflicts(input.userId, startIso, end);
        await createEvent({
          userId: input.userId,
          summary,
          startIso,
          endIso: end,
          timeZone: tz,
        });
        let reply = `ลงปฏิทินแล้ว 📅 ${fmtThaiDate(startIso, tz)}: "${summary}"`;
        if (conflicts.length > 0) {
          const conflictList = conflicts
            .map((c) => `"${c.summary}" (${fmtThaiDate(c.start?.dateTime ?? c.start?.date ?? startIso, tz)})`)
            .join(", ");
          reply += `\n⚠️ เวลาชนกับ ${conflictList}`;
        }
        const headerColor = conflicts.length > 0 ? FLEX_COLORS.warn : undefined;
        const flex = buildTextCardFlex("ลงปฏิทินแล้ว 📅", reply.replace(/^ลงปฏิทินแล้ว 📅 /, ""), headerColor);
        return { text: reply, messages: [flex] };
      } catch {
        return "ยังไม่ได้เชื่อม Google Calendar พิมพ์ 'เชื่อม calendar'";
      }
    }

    case "calendar_list": {
      try {
        const tz = await userTimezone(input.userId);
        const events = await listEvents(input.userId, 7);
        if (events.length === 0) return "สัปดาห์นี้ไม่มีนัด 🎉";
        const text = "นัด 7 วันนี้:\n" +
          events
            .map((e) => {
              const s = e.start?.dateTime ?? e.start?.date;
              return `• ${s ? fmtThaiDate(s, tz) : "?"} — ${e.summary}`;
            })
            .join("\n");
        const flexEvents = events.map((e) => ({
          summary: e.summary ?? "(ไม่มีชื่อ)",
          when: (() => {
            const s = e.start?.dateTime ?? e.start?.date;
            return s ? fmtThaiDate(s, tz) : "?";
          })(),
          location: e.location ?? undefined,
        }));
        const flex = buildCalendarFlex(flexEvents, "นัด 7 วันนี้");
        return { text, messages: [flex] };
      } catch {
        return "ยังไม่ได้เชื่อม Google Calendar พิมพ์ 'เชื่อม calendar'";
      }
    }

    case "briefing": {
      const { generateDailyBriefing } = await import("@/lib/briefing");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const text = await generateDailyBriefing(input.userId, settings.timezone);
      const flex = buildTextCardFlex("☀️ สรุปเช้านี้", text);
      return { text, messages: [flex] };
    }

    case "evening_review": {
      const { generateEveningReview } = await import("@/lib/briefing");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const text = await generateEveningReview(input.userId, settings.timezone);
      const flex = buildTextCardFlex("🌙 สรุปก่อนนอน", text);
      return { text, messages: [flex] };
    }

    case "followup_add": {
      const { addFollowUp } = await import("@/lib/followup/repo");
      const { parseFollowUp } = await import("@/lib/followup/parse");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const parsed = await parseFollowUp(intent.raw, settings.timezone);
      const fu = await addFollowUp({
        userId: input.userId,
        subject: parsed.subject,
        waitingFor: parsed.waitingFor,
        deadline: parsed.deadline,
      });
      return `จดติดตามแล้ว 🔁 "${fu.subject}"${fu.waiting_for ? ` (รอ ${fu.waiting_for})` : ""}${fu.deadline ? ` deadline ${fmtThaiDate(fu.deadline, settings.timezone)}` : ""}`;
    }

    case "followup_list": {
      const { listOpenFollowUps } = await import("@/lib/followup/repo");
      const list = await listOpenFollowUps(input.userId);
      if (list.length === 0) return "ไม่มีอะไรต้องติดตาม 🎉";
      return "รอติดตาม:\n" +
        list.map((f, i) => {
          const days = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86_400_000);
          return `${i + 1}. ${f.subject}${f.waiting_for ? ` (รอ ${f.waiting_for})` : ""} — ${days} วันแล้ว`;
        }).join("\n");
    }

    case "followup_close": {
      const { closeFollowUpByIndex, listOpenFollowUps, closeFollowUp } = await import("@/lib/followup/repo");
      const idx = intent.index;
      if (idx) {
        const fu = await closeFollowUpByIndex(input.userId, idx);
        if (!fu) return `ไม่เจอเรื่องติดตามที่ ${idx}`;
        return `ปิดแล้ว ✅ "${fu.subject}"`;
      }
      // no index — try to match by subject text, else close the single one if only one exists
      const list = await listOpenFollowUps(input.userId);
      if (list.length === 0) return "ไม่มีอะไรต้องติดตามอยู่แล้ว";
      const q = (intent.text || intent.raw || "").toLowerCase();
      const matched = list.find(
        (f) => q && (f.subject.toLowerCase().includes(q) || q.includes(f.subject.toLowerCase())),
      );
      const target = matched ?? (list.length === 1 ? list[0] : undefined);
      if (!target) {
        return "มีเรื่องติดตามหลายอัน ระบุให้ชัดเช่น 'ปิดเรื่องแรก' หรือบอกชื่อเรื่อง";
      }
      const ok = await closeFollowUp(input.userId, target.id);
      return ok ? `ปิดแล้ว ✅ "${target.subject}"` : "ปิดไม่สำเร็จ ลองใหม่อีกที";
    }

    case "people_ask": {
      const { askAboutPerson } = await import("@/lib/people/query");
      const result = await askAboutPerson(input.userId, intent.query || intent.text || intent.raw);
      return result;
    }

    case "expense_add": {
      const { parseExpense } = await import("@/lib/expense/parse");
      const { addExpense } = await import("@/lib/expense/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const parsed = await parseExpense(intent.raw);
      if (!parsed) return "ไม่เข้าใจจำนวนเงิน — ลอง 'ซื้อกาแฟ 85' หรือ 'ใช้ไป 500 บาท'";
      const exp = await addExpense({
        userId: input.userId,
        amount: parsed.amount,
        category: parsed.category,
        description: parsed.description,
        timeZone: settings.timezone,
      });
      return `จดแล้ว 💰 ${exp.amount} บาท${exp.category !== "other" ? ` [${exp.category}]` : ""}${exp.description ? ` — ${exp.description}` : ""}`;
    }

    case "expense_summary": {
      const { summarizeExpenses } = await import("@/lib/expense/repo");
      const summary = await summarizeExpenses(input.userId);
      if (summary.count === 0) return "ยังไม่มีค่าใช้จ่ายที่บันทึกไว้";
      const lines = [`📊 เดือนนี้ใช้ ${summary.total.toFixed(0)} บาท (${summary.count} รายการ)`];
      const sorted = Object.entries(summary.byCategory).sort((a, b) => b[1] - a[1]);
      for (const [cat, amt] of sorted.slice(0, 6)) {
        lines.push(`• ${cat}: ${amt.toFixed(0)} บาท`);
      }
      return lines.join("\n");
    }

    case "subscription_add": {
      const { parseSubscription } = await import("@/lib/expense/parse");
      const { addSubscription } = await import("@/lib/expense/repo");
      const parsed = await parseSubscription(intent.raw);
      if (!parsed) return "ไม่เข้าใจ — ลอง 'สมัคร Netflix 199/เดือน'";
      const sub = await addSubscription({
        userId: input.userId,
        name: parsed.name,
        amount: parsed.amount,
        billingCycle: parsed.billingCycle,
      });
      return `เพิ่มแล้ว 🔔 ${sub.name} — ${sub.amount} บาท/${sub.billing_cycle === "monthly" ? "เดือน" : sub.billing_cycle === "yearly" ? "ปี" : "สัปดาห์"}`;
    }

    case "subscription_list": {
      const { listSubscriptions } = await import("@/lib/expense/repo");
      const list = await listSubscriptions(input.userId);
      if (list.length === 0) return "ไม่มี subscription";
      // normalize all to monthly equivalent
      const monthlyTotal = list.reduce((s, x) => {
        const monthly = x.billing_cycle === "monthly" ? Number(x.amount) : x.billing_cycle === "yearly" ? Number(x.amount) / 12 : Number(x.amount) * 4.33;
        return s + monthly;
      }, 0);
      return "Subscription:\n" +
        list.map((s) => `• ${s.name} — ${s.amount} บาท/${s.billing_cycle === "monthly" ? "ด." : s.billing_cycle === "yearly" ? "ปี" : "ส."}`).join("\n") +
        `\n≈ ${monthlyTotal.toFixed(0)} บาท/เดือน`;
    }

    case "journal_show": {
      const { getJournalEntry } = await import("@/lib/journal/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const entry = await getJournalEntry(input.userId, new Date(), settings.timezone);
      if (!entry) return "ยังไม่มี journal วันนี้ จะสร้างให้ตอน 22:00 อัตโนมัติ หรือพิมพ์ 'สร้าง journal วันนี้'";
      return `📓 Journal ${entry.entry_date}\n\n${entry.content}`;
    }

    case "goal_add": {
      const { parseGoal } = await import("@/lib/goal/parse");
      const { addGoal } = await import("@/lib/goal/repo");
      const parsed = await parseGoal(intent.raw);
      if (!parsed) return "ไม่เข้าใจ — ลอง 'ตั้งเป้า เรียนภาษา 45 นาที/วัน'";
      const g = await addGoal({
        userId: input.userId,
        title: parsed.title,
        targetValue: parsed.target,
        unit: parsed.unit,
        period: parsed.period,
      });
      return `ตั้งเป้าแล้ว 🎯 "${g.title}"${parsed.target ? ` ${parsed.target}${parsed.unit ?? ""}/${g.period}` : ""}`;
    }

    case "goal_log": {
      const { parseGoalLog } = await import("@/lib/goal/parse");
      const { logGoalProgress, getGoals } = await import("@/lib/goal/repo");
      const parsed = await parseGoalLog(intent.raw);
      if (!parsed) return "ไม่เข้าใจ — ลอง 'วันนี้เรียนภาษา 30 นาที'";
      const goals = await getGoals(input.userId, "active");
      if (goals.length === 0) return "ยังไม่มีเป้าหมาย — พิมพ์ 'ตั้งเป้า ...'";
      const goal = parsed.titleHint
        ? goals.find((g) => g.title.toLowerCase().includes(parsed.titleHint!.toLowerCase()))
        : goals.length === 1
          ? goals[0]
          : undefined;
      if (!goal) {
        return `มีเป้าหมาย ${goals.length} อัน — ระบุชื่อให้ชัด เช่น 'วันนี้เรียนภาษา 30 นาที'`;
      }
      await logGoalProgress({
        userId: input.userId,
        goalId: goal.id,
        value: parsed.value,
        note: parsed.note,
      });
      return `บันทึกแล้ว ✅ "${goal.title}" +${parsed.value}${goal.unit ?? ""}`;
    }

    case "goal_progress": {
      const { getGoals, getProgressMapForGoals } = await import("@/lib/goal/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const goals = await getGoals(input.userId, "active");
      if (goals.length === 0) return "ยังไม่มีเป้าหมาย";
      const progressMap = await getProgressMapForGoals(goals, settings.timezone);
      const lines: string[] = ["🎯 เป้าหมาย"];
      for (const g of goals) {
        const progress = progressMap.get(g.id) ?? 0;
        const targetStr = g.target_value ? `/${g.target_value}` : "";
        const pct = g.target_value ? Math.round((progress / g.target_value) * 100) : 0;
        const status = pct >= 100 ? "✅" : pct >= 70 ? "🔥" : pct < 50 ? "⚠️" : "📈";
        lines.push(`${status} ${g.title}: ${progress}${targetStr} ${g.unit ?? ""} (${pct}%)`);
      }
      return lines.join("\n");
    }

    case "decision_recall": {
      const q = intent.query || intent.text || intent.raw;
      const results = await recall(input.userId, q, 5, { tag: "decision" });
      if (results.length === 0) {
        // fallback: unfiltered search
        const fallback = await recall(input.userId, q, 3);
        if (fallback.length === 0) return `ไม่เจอบันทึกการตัดสินใจเรื่อง "${q}" 🤔`;
        return "เจอในความจำ (ไม่ได้แท็ก decision):\n" + formatRecall(fallback);
      }
      return `🧠 การตัดสินใจเรื่อง "${q}"\n` + formatRecall(results);
    }

    case "meeting_prep": {
      const { generateMeetingBrief, getEventsStartingSoon } = await import("@/lib/meeting/prep");
      // find next upcoming event
      const upcoming = await getEventsStartingSoon(input.userId, 1440); // next 24h
      if (upcoming.length === 0) return "ไม่มีนัดใน 24 ชม.ข้างหน้า — ไม่ต้องเตรียมอะไร";
      // pick the soonest, or match by text
      const target = intent.text
        ? upcoming.find((e) => e.summary.toLowerCase().includes(intent.text.toLowerCase()))
        : upcoming[0];
      const event = target ?? upcoming[0];
      return await generateMeetingBrief(input.userId, event);
    }

    case "meeting_list": {
      // List recent meeting notes (tag=meeting). If user gave a topic query,
      // narrow by semantic search within meeting-tagged memories.
      const q = intent.query || intent.text || "ประชุม meeting";
      const results = await recall(input.userId, q, 10, { tag: "meeting" });
      if (results.length === 0) {
        return "ยังไม่มีบันทึกการประชุมเลย 📋\nส่งสรุปประชุม/บันทึกการประชุมมาได้เลย โฮชิจะจดแท็ก #meeting ให้อัตโนมัติ";
      }
      return `📋 สรุปประชุมล่าสุด (${results.length})\n` + formatRecall(results);
    }

    case "travel_checklist": {
      const { generateTravelChecklist } = await import("@/lib/travel/checklist");
      const dest = intent.text || intent.raw;
      return await generateTravelChecklist(input.userId, dest);
    }

    case "email_summary": {
      const { summarizeInbox } = await import("@/lib/gmail");
      try {
        return await summarizeInbox(input.userId);
      } catch (e) {
        const msg = (e as Error).message;
        if (msg.includes("ยังไม่ได้เชื่อม") || msg.includes("invalid_grant") || msg.includes("unauthorized") || msg.includes("No tokens")) {
          return "ยังไม่ได้เชื่อม Google พิมพ์ 'เชื่อม calendar' เพื่ออนุญาต Gmail";
        }
        console.error("[agent] email summary", msg);
        return "ดึงเมลไม่ได้ ลองใหม่ภายหลัง";
      }
    }

    case "email_reply": {
      const { draftEmailReply } = await import("@/lib/gmail");
      const context = intent.text || intent.raw;
      return await draftEmailReply(input.userId, context);
    }

    case "web_search": {
      const { hasWebSearch } = await import("@/lib/env");
      if (!hasWebSearch()) {
        return "ยังไม่ได้เชื่อมระบบค้นเว็บ (ต้องตั้งค่า TAVILY_API_KEY)";
      }
      const { webSearch } = await import("@/lib/search/web");
      const q = intent.query || intent.text || intent.raw;
      const result = await webSearch(q, 5);
      if (!result || (!result.answer && result.results.length === 0)) {
        return `ค้นเว็บไม่เจอผลลัพธ์เรื่อง "${q}" 🤔`;
      }
      // ประกอบ context จาก answer + snippets แล้วให้ LLM ตอบเป็นไทย
      const snippets = result.results
        .slice(0, 5)
        .map((r, i) => `(${i + 1}) ${r.title}\n${r.content.slice(0, 600)}`)
        .join("\n\n");
      const context = [
        result.answer ? `Tavily answer: ${result.answer}` : "",
        snippets,
      ]
        .filter(Boolean)
        .join("\n\n");
      const { chat } = await import("@/lib/llm/pool");
      const llmRes = await chat({
        messages: [
          {
            role: "system",
            content:
              "คุณคือ 'โฮชิ' เลขาส่วนตัว. ตอบคำถามของผู้ใช้เป็นภาษาไทย กระชับ เข้าใจง่าย โดยอ้างอิงจากข้อมูลค้นเว็บที่ให้มา. ถ้าข้อมูลไม่พอ บอกตรงๆ ว่าไม่แน่ใจ. อย่าแปลวลีทางเทคนิค/ชื่อเฉพาะถ้าเรียกกันเป็นภาษาอังกฤษในไทย. ตอบ 2-5 บรรทัด.",
          },
          {
            role: "user",
            content: `คำถาม: ${q}\n\nข้อมูลค้นเว็บ:\n${context}`,
          },
        ],
        options: { temperature: 0.4, maxOutputTokens: 400, timeoutMs: 30_000 },
      });
      const answer = llmRes.text?.trim() || result.answer || "ไม่พบข้อมูล";
      const topResults = result.results.slice(0, 3);
      const lines = [answer];
      if (topResults.length > 0) {
        lines.push("", "แหล่งอ้างอิง:");
        for (const r of topResults) lines.push(`- ${r.title}: ${r.url}`);
      }
      return lines.join("\n");
    }

    case "chat":
    default:
      return await chatReply(input, history);
  }
}

async function doRemember(input: HandleInput): Promise<string> {
  let content = input.text;
  let storagePath: string | undefined;

  if (input.attachment && input.attachment.buffer) {
    const { kind, buffer, contentType, messageId } = input.attachment;
    // upload to storage
    try {
      const { uploadAttachment } = await import("@/lib/storage");
      storagePath = await uploadAttachment(input.userId, messageId, buffer, contentType);
    } catch (e) {
      console.warn("[agent] storage upload failed", (e as Error).message);
    }

    // process content based on type
    try {
      if (kind === "audio") {
        const { transcribeAudio } = await import("@/lib/multimodal");
        const transcription = await transcribeAudio(buffer, contentType);
        content = input.text ? `${input.text}\n— "${transcription}"` : transcription;
      } else if (kind === "image") {
        const { describeImage } = await import("@/lib/multimodal");
        const desc = await describeImage(buffer, contentType, input.text);
        content = input.text ? `${input.text}\n— (${desc})` : desc;
      } else if (kind === "file") {
        content = input.text || `ไฟล์ ${contentType}`;
      }
    } catch (e) {
      console.warn("[agent] multimodal failed", (e as Error).message);
      // fallback to text
      if (kind === "audio") content = input.text || "(ข้อความเสียง)";
      else if (kind === "image") content = input.text || "(รูปภาพ)";
      else content = input.text || `ไฟล์ ${contentType}`;
    }
  } else if (input.attachment) {
    // no buffer — metadata only
    if (input.attachment.kind === "file") content = input.text || `ไฟล์ ${input.attachment.contentType}`;
    else if (input.attachment.kind === "image") content = input.text || "(รูปภาพ)";
    else if (input.attachment.kind === "audio") content = input.text || "(ข้อความเสียง)";
  }

  if (!content.trim()) content = "(empty)";

  const summary = await summarizeForStorage(content);

  // Auto-detect tags (decision, expense, receipt, travel, project, meeting)
  const { detectDecisionTag, detectExpenseTag, detectReceiptTag, detectTravelTag, detectMeetingTag, detectProjectTag, extractProjectName } = await import("@/lib/memory/tags");
  const tags: string[] = [];
  if (detectDecisionTag(content)) tags.push("decision");
  if (detectExpenseTag(content)) tags.push("expense");
  if (detectReceiptTag(content)) tags.push("receipt");
  if (detectTravelTag(content)) tags.push("travel");
  if (detectMeetingTag(content)) tags.push("meeting");
  const projectName = detectProjectTag(content) ? extractProjectName(content) : undefined;
  if (projectName) tags.push("project", `project:${projectName}`);

  const mem = await remember({
    userId: input.userId,
    kind: input.attachment ? input.attachment.kind : content.match(/^https?:\/\//) ? "link" : "text",
    content: summary,
    storagePath,
    tags: tags.length > 0 ? tags : undefined,
    raw: input.attachment
      ? { line_message_id: input.attachment.messageId, mime: input.attachment.contentType }
      : { original: content },
  });

  // Sync expense-tagged remembers into expenses table (BUG-1 fix)
  if (tags.includes("expense")) {
    try {
      const { parseExpense } = await import("@/lib/expense/parse");
      const { addExpense } = await import("@/lib/expense/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const parsed = await parseExpense(content);
      if (parsed) {
        await addExpense({
          userId: input.userId,
          amount: parsed.amount,
          category: parsed.category,
          description: parsed.description,
          relatedMemoryId: mem.id,
          timeZone: settings.timezone,
        });
      }
    } catch (e) {
      console.warn("[agent] expense auto-record failed", (e as Error).message);
    }
  }

  // Auto-extract people + link to memory (background, non-blocking)
  extractPeopleAndLink(input.userId, mem.id, summary).catch((e) =>
    console.warn("[agent] people extract failed", (e as Error).message),
  );

  const tagStr = tags.length > 0 ? ` ${tags.map((t) => `#${t}`).join(" ")}` : "";
  return `จดแล้ว 📌${tagStr}`;
}

/** Extract person names from content and upsert + link to memory. */
async function extractPeopleAndLink(userId: string, memoryId: string, content: string): Promise<void> {
  try {
    const { extractPeopleFromText, upsertPerson, linkMemoryToPerson } = await import("@/lib/people/repo");
    const names = await extractPeopleFromText(content);
    if (names.length === 0) return;
    for (const name of names.slice(0, 5)) {
      const person = await upsertPerson({ userId, name });
      await linkMemoryToPerson({ peopleId: person.id, memoryId, userId });
    }
  } catch {
    // silent — people extraction is best-effort
  }
}

async function chatReply(input: HandleInput, history: ChatTurn[]): Promise<string> {
  // ดึง memory ล่าสุด + upcoming reminders แบบขนาน
  const [recent, upcoming, tz] = await Promise.all([
    listRecent(input.userId, 3),
    listUpcoming(input.userId, 3),
    userTimezone(input.userId),
  ]);

  const memCtx = recent.length
    ? "บริบทล่าสุดที่จำได้:\n" +
      recent.map((m) => `- [${m.kind}] ${m.content}`).join("\n")
    : "";

  const remindCtx = upcoming.length
    ? "เตือนที่ตั้งไว้:\n" +
      upcoming.map((r) => `- ${fmtThaiDate(r.fire_at, tz)}: ${r.message}`).join("\n")
    : "";

  const systemMsg = [PERSONA, memCtx, remindCtx].filter(Boolean).join("\n\n");

  // history รวมข้อความ user ปัจจุบัน (log แล้ว) — ตัดอันสุดท้ายออกก่อน slice
  // เพื่อไม่ให้ user message ซ้ำสองครั้งใน context
  const messages: ChatTurn[] = [
    { role: "system", content: systemMsg },
    ...history.slice(0, -1).slice(-8),
    { role: "user", content: input.text },
  ];

  const res = await chat({
    messages,
    options: { temperature: 0.6, maxOutputTokens: 600, timeoutMs: 30_000 },
  });
  return res.text || "ไม่แน่ใจจะตอบยังไง";
}

/** โครงสร้าง section สำหรับ buildHelpFlex() — คู่กับ helpText() ด้านล่าง (เนื้อหาต้องตรงกัน) */
const HELP_SECTIONS: Array<{ title: string; lines: string[] }> = [
  {
    title: "📝 จด/ค้น/เตือน",
    lines: [
      "พิมพ์/ส่งอะไรก็ได้ → จดให้อัตโนมัติ",
      "'เคยบอกอะไรเรื่อง X' → ค้นความจำ",
      "'เตือน X พรุ่งนี้ 9 โมง' → ตั้งเตือน",
    ],
  },
  {
    title: "📋 งาน/ปฏิทิน",
    lines: [
      "'จดงาน: ...' / 'มีงานค้างไหม' → to-do",
      "'นัด X พรุ่งนี้ 2 โมงเย็น' → ลงปฏิทิน",
      "'เชื่อม calendar' → เชื่อม Google Calendar",
    ],
  },
  {
    title: "☀️ สรุปรายวัน",
    lines: ["'สรุปวันนี้' → Daily Briefing", "'สรุปวันนี้ก่อนนอน' → Evening Review"],
  },
  {
    title: "🔁 ติดตาม",
    lines: ["'ส่งเมลหา X แล้ว' / 'รอ A ส่งไฟล์' → ติดตามอัตโนมัติ", "'มีอะไรรอติดตามไหม'"],
  },
  {
    title: "👥 คน/ความจำ",
    lines: ["'John เป็นใคร' → ข้อมูลคนที่เคยจด"],
  },
  {
    title: "💰 การเงิน",
    lines: [
      "'ซื้อกาแฟ 85' → บันทึกค่าใช้จ่าย",
      "'เดือนนี้ใช้เท่าไร' → สรุปค่าใช้จ่าย",
      "'สมัคร Netflix 199/เดือน' → subscription",
    ],
  },
  {
    title: "🎯 เป้าหมาย/ไดอารี่",
    lines: [
      "'ตั้งเป้า เรียนภาษา 45 นาที/วัน'",
      "'วันนี้เรียนภาษา 30 นาที' → บันทึกความคืบหน้า",
      "'เป้าคืบหน้ายัง'",
      "'journal วันนี้'",
    ],
  },
  {
    title: "📋 ประชุม/เดินทาง/อีเมล",
    lines: [
      "'สรุปประชุม...' → จดแท็ก #meeting อัตโนมัติ",
      "'ประชุมล่าสุดเรื่องอะไร' → ดึงบันทึกประชุม",
      "'เตรียมประชุม' → brief ก่อนนัด",
      "'บินพรุ่งนี้' → checklist เดินทาง",
      "'สรุปเมล' → Inbox Zero",
      "'ตอบเมล ...' → ร่างคำตอบ",
    ],
  },
  {
    title: "🗑 อื่นๆ",
    lines: ["'ลบที่พึ่งส่ง' → ลบความจำล่าสุด"],
  },
];

function helpText() {
  const lines = ["โฮชิพร้อมช่วย 🙋", ""];
  for (const section of HELP_SECTIONS) {
    lines.push(section.title);
    for (const line of section.lines) lines.push(`• ${line}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

function formatRecall(results: { memory: { kind: string; content: string; created_at: string; tags?: string[] }; similarity: number }[], header = ""): string {
  const lines = results.map((r) => {
    const date = new Date(r.memory.created_at);
    const tagStr = (r.memory.tags ?? []).length > 0 ? ` ${r.memory.tags!.map((t) => `#${t}`).join("")}` : "";
    return `• ${date.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: BANGKOK })} — ${r.memory.content}${tagStr}`;
  });
  return (header ? `${header}\n` : "") + lines.join("\n");
}

function fmtThaiDate(iso: string, timeZone = BANGKOK) {
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

async function userTimezone(userId: string): Promise<string> {
  const { getSettings } = await import("@/lib/settings/repo");
  const settings = await getSettings(userId);
  return settings.timezone || BANGKOK;
}
