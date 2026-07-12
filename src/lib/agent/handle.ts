/**
 * Main agent — รับ LINE event → จัดการ → ส่งคำตอบกลับ
 */
import { chat } from "@/lib/llm/pool";
import { classify } from "@/lib/intent/router";
import { parseTimes } from "@/lib/intent/time";
import { remember, recall, listRecent, summarizeForStorage, deleteMemory } from "@/lib/memory/store";
import { logMessage, recentHistory } from "@/lib/memory/conversation";
import { addTodo, listTodos, completeByIndex, cancelByIndex, updateByIndex, deleteByIndex, updateTodo } from "@/lib/todo/repo";
import { scheduleReminder, cancelReminder } from "@/lib/remind/schedule";
import { createEvent, listEvents, findConflicts } from "@/lib/calendar/events";
import { touchUser } from "@/lib/db/client";
import { BANGKOK } from "@/lib/tz";
import type { ChatTurn } from "@/lib/llm/types";
import type { LineMessage } from "@/lib/line";
import { buildTodoListFlex, buildCalendarFlex, buildTextCardFlex, buildHelpFlex, FLEX_COLORS } from "@/lib/flex/builder";
import { buildHelpSections } from "@/lib/agent/registry";

/**
 * Reply จาก handle() — ปกติเป็น plain string, แต่สำหรับ reply ที่มีค่าสูง
 * (todo_list, calendar_add/list, briefing/evening_review, help) จะแนบ Flex
 * message มาด้วย. `text` ใช้ log/fallback เสมอ, `messages` (ถ้ามี) คือสิ่งที่จะส่งจริง.
 */
export type Reply = string | { text: string; messages: LineMessage[] };

export interface HandleInput {
  userId: string;
  displayName?: string;
  text: string;
  hasAttachment?: boolean;
  /** LINE webhookEventId — used for mutation idempotency keys */
  webhookEventId?: string;
  /** Trace ID for end-to-end correlation across messages, LLM usage, logs */
  traceId?: string;
  attachment?: {
    kind: "image" | "audio" | "file";
    messageId: string;
    contentType: string;
    buffer?: ArrayBuffer;
  };
}

export async function handle(input: HandleInput): Promise<Reply> {
  const { createDeadline, DeadlineExceededError } = await import("@/lib/deadline");
  const deadline = createDeadline();

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
  await logMessage(userId, "user", userTextForLog, undefined, undefined, input.traceId);

  deadline.throwIfExpired("classify");

  // ── C1: Durable plan confirmation resume + correction ──
  const trimmedText = input.text.trim().toLowerCase();
  if (trimmedText === "ยืนยัน" || trimmedText === '"ยืนยัน"' || trimmedText === "confirm") {
    const { getPendingAction, consumePendingAction, expireStalePendingActions } =
      await import("@/lib/agent/pending");
    await expireStalePendingActions(userId);
    const pending = await getPendingAction(userId);
    if (pending) {
      const consumed = await consumePendingAction(pending.id);
      if (consumed) {
        const { validatePlan } = await import("@/lib/agent/planner");
        const rawPlan = consumed.payload as unknown as { steps?: unknown[] };
        // Re-validate the stored plan to guard against DB payload corruption
        const plan = rawPlan.steps ? validatePlan(rawPlan.steps) : null;
        if (!plan) {
          return "แผนที่บันทึกไว้ไม่ถูกต้อง — ลองสั่งใหม่อีกที";
        }
        const { executePlan } = await import("@/lib/agent/plan-exec");
        const confirmHistory = await recentHistory(userId, 12);
        const result = await executePlan(plan, canonicalInput, confirmHistory);
        const lines = [result.summary];
        for (const r of result.receipts) {
          if (r.status === "success") lines.push(`✅ ${r.action}: ${r.result ?? ""}`);
          else if (r.status === "failed") lines.push(`❌ ${r.action}: ${r.error ?? "ล้มเหลว"}`);
          else lines.push(`⏭️ ${r.action}: ข้าม`);
        }
        return lines.join("\n");
      }
    }
    return "ไม่มีคำขอที่รอยืนยัน หรือหมดเวลาแล้ว (5 นาที) — ลองสั่งใหม่อีกที";
  }

  // Plan correction: cancel pending plan
  if (trimmedText === "ยกเลิกแผน" || trimmedText === "cancel plan") {
    const { cancelPendingActions } = await import("@/lib/agent/pending");
    const cancelled = await cancelPendingActions(userId);
    return cancelled > 0
      ? `ยกเลิกแผนที่รอยืนยันแล้ว (${cancelled} แผน)`
      : "ไม่มีแผนที่รอยืนยันอยู่";
  }

  // classify
  const history = await recentHistory(userId, 12);
  const intent = await classify(
    input.text || "",
    history.slice(0, -1),
    input.hasAttachment,
  );

  // Mutation idempotency: event + action + target → one business effect
  const { claimMutation } = await import("@/lib/idempotency/mutation");
  const target = intent.query ?? intent.text ?? input.text ?? "";
  const claim = await claimMutation({
    userId,
    webhookEventId: input.webhookEventId,
    action: intent.action,
    target,
  });
  if (claim === "duplicate") {
    return "คำขอนี้ทำไปแล้วค่ะ (ไม่ทำซ้ำ)";
  }

  let reply: Reply = "";
  try {
    deadline.throwIfExpired("dispatch");
    reply = await dispatch(intent, canonicalInput, history);
  } catch (err) {
    if (err instanceof DeadlineExceededError) {
      console.warn("[agent] deadline exceeded", err.message);
      reply = "ขออภัยค่ะ ใช้เวลานานเกินไป ลองใหม่อีกทีนะ";
    } else {
      console.error("[agent] dispatch error", err);
      reply = "อุ๊ป มีข้อผิดพลาดภายใน ลองใหม่อีกทีนะ";
    }
  }

  // Assistant message is logged by the webhook route AFTER delivery so the
  // `delivered` column reflects actual LINE delivery status.
  return reply;
}

export async function dispatch(
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
          const escaped = projectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          cleanQuery = cleanQuery.replace(new RegExp(escaped, "i"), "").trim() || cleanQuery;
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
          const reminder = await scheduleReminder({
            userId: input.userId,
            message: `📌 งานใกล้ถึงกำหนด: "${title}" (${fmtThaiDate(startIso, tz)})`,
            fireAt: remindAt,
          });
          await updateTodo(input.userId, t.id, { reminderId: reminder.id });
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
      let idx = intent.index;
      if (!idx) {
        const pending = await listTodos(input.userId, "pending");
        if (pending.length === 0) return "ไม่มีงานค้างให้ทำเสร็จ";
        if (pending.length > 1) return "มีหลายงานค้าง ระบุเลขด้วย เช่น 'เสร็จแล้วงานที่ 2'";
        idx = 1;
      }
      const t = await completeByIndex(input.userId, idx);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      if (t.reminder_id) {
        try { await cancelReminder(t.reminder_id); } catch (e) { console.warn("[agent] cancel reminder on done", (e as Error).message); }
      }
      return `เสร็จแล้ว ✅ "${t.title}"`;
    }

    case "todo_cancel": {
      let idx = intent.index;
      if (!idx) {
        const pending = await listTodos(input.userId, "pending");
        if (pending.length === 0) return "ไม่มีงานค้างให้ยกเลิก";
        if (pending.length > 1) return "มีหลายงานค้าง ระบุเลขด้วย เช่น 'ยกเลิกงานที่ 2'";
        idx = 1;
      }
      const t = await cancelByIndex(input.userId, idx);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      if (t.reminder_id) {
        try { await cancelReminder(t.reminder_id); } catch (e) { console.warn("[agent] cancel reminder on cancel", (e as Error).message); }
      }
      return `ยกเลิกแล้ว "${t.title}"`;
    }

    case "todo_update": {
      let idx = intent.index;
      if (!idx) {
        const pending = await listTodos(input.userId, "pending");
        if (pending.length === 0) return "ไม่มีงานค้างให้แก้";
        if (pending.length > 1) return "มีหลายงานค้าง ระบุเลขด้วย เช่น 'แก้งานที่ 2 เป็น โทรหาแม่'";
        idx = 1;
      }

      const tz = await userTimezone(input.userId);
      const { startIso } = await parseTimes(intent.raw, new Date(), tz);
      const title = intent.text.trim();
      const patch = {
        ...(title ? { title } : {}),
        ...(startIso ? { dueAt: startIso } : {}),
        ...(intent.priority ? { priority: intent.priority } : {}),
      };
      if (Object.keys(patch).length === 0) {
        return "บอกสิ่งที่จะแก้หน่อย เช่น 'แก้งานที่ 2 เป็น โทรหาแม่', 'เลื่อนงานแรกไปพรุ่งนี้', หรือ 'ปรับงานแรกเป็นด่วน'";
      }

      const t = await updateByIndex(input.userId, idx, patch);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      // If due date changed, cancel old reminder and schedule a new one
      if (startIso) {
        if (t.reminder_id) {
          try { await cancelReminder(t.reminder_id); } catch (e) { console.warn("[agent] cancel old reminder on update", (e as Error).message); }
        }
        try {
          const dueMs = new Date(startIso).getTime();
          const remindMs = Math.min(dueMs - 60 * 60 * 1000, dueMs);
          const remindAt = new Date(Math.max(remindMs, Date.now() + 60_000)).toISOString();
          const reminder = await scheduleReminder({
            userId: input.userId,
            message: `📌 งานใกล้ถึงกำหนด: "${t.title}" (${fmtThaiDate(startIso, tz)})`,
            fireAt: remindAt,
          });
          await updateTodo(input.userId, t.id, { reminderId: reminder.id });
        } catch (e) {
          console.warn("[agent] reschedule reminder on update", (e as Error).message);
        }
      }
      const priTag = t.priority === 1 ? " 🔴ด่วน" : t.priority === 3 ? " 🟢ไม่รีบ" : "";
      return `แก้แล้ว ✅ งานที่ ${idx}: "${t.title}"${priTag}${t.due_at ? ` (${fmtThaiDate(t.due_at, tz)})` : ""}`;
    }

    case "todo_delete": {
      let idx = intent.index;
      if (!idx) {
        const pending = await listTodos(input.userId, "pending");
        if (pending.length === 0) return "ไม่มีงานค้างให้ลบ";
        if (pending.length > 1) return "มีหลายงานค้าง ระบุเลขด้วย เช่น 'ลบงานที่ 2'";
        idx = 1;
      }

      const t = await deleteByIndex(input.userId, idx);
      if (!t) return `ไม่เจองานที่ ${idx}`;
      if (t.reminder_id) {
        try { await cancelReminder(t.reminder_id); } catch (e) { console.warn("[agent] cancel reminder on delete", (e as Error).message); }
      }
      return `ลบถาวรแล้ว 🗑 "${t.title}"`;
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
      const text = "รอติดตาม:\n" +
        list.map((f, i) => {
          const days = Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86_400_000);
          return `${i + 1}. ${f.subject}${f.waiting_for ? ` (รอ ${f.waiting_for})` : ""} — ${days} วันแล้ว`;
        }).join("\n");
      const { buildFollowUpListFlex } = await import("@/lib/flex/builder");
      const flex = buildFollowUpListFlex(list.map((f) => ({
        id: f.id,
        subject: f.subject,
        waitingFor: f.waiting_for,
        ageDays: Math.floor((Date.now() - new Date(f.created_at).getTime()) / 86_400_000),
      })));
      return { text, messages: [flex] };
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

    case "people_set_tier": {
      const { findPeople, setPersonTier } = await import("@/lib/people/repo");
      const tier =
        intent.tier ??
        ([1, 2, 3, 4].find((n) => new RegExp(`\\b${n}\\b|P${n}\\b`, "i").test(intent.raw)) as
          | 1
          | 2
          | 3
          | 4
          | undefined);
      if (!tier) {
        return "ระบุระดับด้วยค่ะ — P1 (สำคัญที่สุด), P2 (สัมพันธ์สำคัญ), P3 (ทั่วไป), P4 (ภายนอก/เย็น)\nเช่น “ตั้ง คุณแม่ เป็น P1”";
      }
      const nameQuery = intent.query || intent.text || "";
      if (!nameQuery.trim()) {
        return "บอกชื่อคนที่จะปรับระดับด้วยค่ะ เช่น “ตั้ง คุณแม่ เป็น P1”";
      }
      const candidates = await findPeople(input.userId, nameQuery);
      if (candidates.length === 0) {
        return `ยังไม่รู้จักคนชื่อ "${nameQuery}" ค่ะ — ลองสะกดชื่อใหม่ หรือพูดถึงชื่อนี้ในบทสนทนาก่อนแล้วแจ๋วจะจำได้`;
      }
      // Ambiguity guard: never silently mutate the wrong person's tier. If the
      // query matches multiple people, ask the owner to disambiguate instead.
      let target = candidates[0];
      if (candidates.length > 1) {
        const exact = candidates.find(
          (p) => p.name.toLowerCase() === nameQuery.trim().toLowerCase(),
        );
        if (exact) {
          target = exact;
        } else {
          const list = candidates
            .slice(0, 6)
            .map((p) => `• ${p.name}`)
            .join("\n");
          return `ชื่อ "${nameQuery}" ตรงกับหลายคน โปรดระบุให้ชัดเจนขึ้นค่ะ:\n${list}\n\nเช่น "ตั้ง คุณสมชาย X เป็น P${tier}"`;
        }
      }
      const updated = await setPersonTier(input.userId, target.id, tier);
      if (!updated) return "ปรับระดับไม่สำเร็จค่ะ ลองอีกครั้ง";
      const label =
        tier === 1 ? "สำคัญที่สุด" : tier === 2 ? "สัมพันธ์สำคัญ" : tier === 4 ? "ภายนอก/เย็น" : "ทั่วไป";
      return `ตั้งให้แล้วค่ะ ⭐ P${tier} · ${target.name}\nระดับ: ${label}`;
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

    case "subscription_cancel": {
      const { listSubscriptions, cancelSubscription } = await import("@/lib/expense/repo");
      const list = await listSubscriptions(input.userId);
      if (list.length === 0) return "ไม่มี subscription ที่ active";
      const q = (intent.text || intent.raw || "").toLowerCase();
      const target = list.find((s) => s.name.toLowerCase().includes(q)) ??
        (intent.index ? list[intent.index - 1] : list.length === 1 ? list[0] : undefined);
      if (!target) {
        return "มีหลายตัว ระบุชื่อหรือเลข เช่น 'ยกเลิก Netflix' หรือ 'ยกเลิกอันแรก':\n" +
          list.map((s, i) => `${i + 1}. ${s.name}`).join("\n");
      }
      const ok = await cancelSubscription(input.userId, target.id);
      return ok ? `ยกเลิกแล้ว ❌ ${target.name}` : "ยกเลิกไม่สำเร็จ ลองอีกครั้ง";
    }

    case "remind_list": {
      const { listUpcoming } = await import("@/lib/remind/schedule");
      const tz = await userTimezone(input.userId);
      const list = await listUpcoming(input.userId, 10);
      if (list.length === 0) return "ไม่มีการเตือนที่รออยู่ ⏰";
      return "⏰ การเตือนที่ตั้งไว้:\n" +
        list.map((r, i) => `${i + 1}. ${fmtThaiDate(r.fire_at, tz)} — "${r.message}"`).join("\n");
    }

    case "remind_cancel": {
      const { cancelReminderByIndex, listUpcoming } = await import("@/lib/remind/schedule");
      const idx = intent.index;
      if (!idx) {
        const list = await listUpcoming(input.userId, 10);
        if (list.length === 0) return "ไม่มีการเตือนที่รออยู่";
        if (list.length === 1) {
          await cancelReminderByIndex(input.userId, 1);
          return `ยกเลิกแล้ว ❌ "${list[0].message}"`;
        }
        return "มีหลายตัว ระบุเลข:\n" +
          list.map((r, i) => `${i + 1}. ${r.message}`).join("\n");
      }
      const target = await cancelReminderByIndex(input.userId, idx);
      return target ? `ยกเลิกแล้ว ❌ "${target.message}"` : `ไม่เจอการเตือนที่ ${idx}`;
    }

    case "remind_snooze": {
      const { snoozeReminderByIndex, listUpcoming } = await import("@/lib/remind/schedule");
      const tz = await userTimezone(input.userId);
      const { startIso } = await parseTimes(intent.raw, new Date(), tz);
      if (!startIso) return "ไม่เข้าใจเวลาที่จะเลื่อน — ลอง 'เลื่อนการเตือนไปอีก 30 นาที'";
      const idx = intent.index ?? 1;
      const list = await listUpcoming(input.userId, 10);
      if (list.length === 0) return "ไม่มีการเตือนที่รออยู่";
      const snoozed = await snoozeReminderByIndex(input.userId, idx, startIso);
      return snoozed
        ? `เลื่อนแล้ว ⏰ "${snoozed.message}" → ${fmtThaiDate(snoozed.fire_at, tz)}`
        : "เลื่อนไม่สำเร็จ ลองอีกครั้ง";
    }

    case "expense_list": {
      const { listExpenses } = await import("@/lib/expense/repo");
      const list = await listExpenses(input.userId, 10);
      if (list.length === 0) return "ยังไม่มีค่าใช้จ่ายที่บันทึกไว้";
      return "💰 ค่าใช้จ่ายล่าสุด:\n" +
        list.map((e, i) => `${i + 1}. ${e.amount} บาท [${e.category}] ${e.description ?? ""} (${e.expense_date})`).join("\n");
    }

    case "expense_delete": {
      const { deleteExpenseByIndex, listExpenses } = await import("@/lib/expense/repo");
      const list = await listExpenses(input.userId, 10);
      if (list.length === 0) return "ไม่มีค่าใช้จ่ายให้ลบ";
      const idx = intent.index ?? (list.length === 1 ? 1 : undefined);
      if (!idx) {
        return "มีหลายรายการ ระบุเลข:\n" +
          list.map((e, i) => `${i + 1}. ${e.amount} บาท [${e.category}] ${e.description ?? ""}`).join("\n");
      }
      const target = await deleteExpenseByIndex(input.userId, idx);
      return target
        ? `ลบแล้ว 🗑️ ${target.amount} บาท [${target.category}]`
        : `ไม่เจอค่าใช้จ่ายที่ ${idx}`;
    }

    case "goal_manage": {
      const { setGoalStatus, getGoals } = await import("@/lib/goal/repo");
      const raw = (intent.text || intent.raw || "").toLowerCase();
      let action: "paused" | "active" | "archived" | "done";
      if (/พัก|หยุด|pause/.test(raw)) action = "paused";
      else if (/ทำต่อ|resume|เปิด/.test(raw)) action = "active";
      else if (/เก็บ|เลิก|archive|ยกเลิก/.test(raw)) action = "archived";
      else if (/เสร็จ|สำเร็จ|complete|done/.test(raw)) action = "done";
      else return "ระบุสิ่งที่จะทำ: 'พักเป้า', 'ทำต่อ', 'เก็บเป้า', หรือ 'ทำเสร็จ' — พร้อมเลขหรือชื่อเป้า";

      const goals = await getGoals(input.userId, action === "active" ? "paused" : "active");
      if (goals.length === 0) return action === "active" ? "ไม่มีเป้าที่พักอยู่" : "ไม่มีเป้าหมาย active";
      let goal = intent.index ? goals[intent.index - 1] : undefined;
      if (!goal) {
        const q = intent.text || "";
        goal = goals.find((g) => g.title.toLowerCase().includes(q.toLowerCase()));
      }
      if (!goal && goals.length === 1) goal = goals[0];
      if (!goal) {
        return `มี ${goals.length} เป้า — ระบุชื่อหรือเลข:\n` +
          goals.map((g, i) => `${i + 1}. ${g.title}`).join("\n");
      }
      const updated = await setGoalStatus(input.userId, goal.id, action);
      const labels: Record<string, string> = { paused: "พักแล้ว ⏸️", active: "ทำต่อ ▶️", archived: "เก็บแล้ว 📦", done: "เสร็จแล้ว ✅" };
      return updated ? `${labels[action]} "${updated.title}"` : "ไม่สำเร็จ ลองอีกครั้ง";
    }

    case "journal_add": {
      const { addJournalEntry } = await import("@/lib/journal/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const content = intent.text || intent.raw;
      if (!content.trim()) return "เขียนอะไรลงไดอารี่ก่อน — เช่น 'เขียนไดอารี่ วันนี้ดีมาก'";
      const entry = await addJournalEntry(input.userId, content, new Date(), settings.timezone);
      return entry ? `บันทึกไดอารี่แล้ว 📓 ${entry.entry_date}` : "บันทึกไม่สำเร็จ ลองอีกครั้ง";
    }

    case "followup_reopen": {
      const { reopenFollowUpByIndex } = await import("@/lib/followup/repo");
      const idx = intent.index;
      if (!idx) {
        const db = (await import("@/lib/db/client")).requireDb();
        const { data } = await db
          .from("follow_ups")
          .select("*")
          .eq("user_id", input.userId)
          .eq("status", "closed")
          .order("updated_at", { ascending: false })
          .limit(10);
        const closed = (data ?? []) as Array<{ id: string; subject: string }>;
        if (closed.length === 0) return "ไม่มีเรื่องที่ปิดไปแล้ว";
        if (closed.length === 1) {
          const target = await reopenFollowUpByIndex(input.userId, 1);
          return target ? `เปิดติดตามใหม่ 🔄 "${target.subject}"` : "เปิดใหม่ไม่สำเร็จ";
        }
        return "มีหลายเรื่อง ระบุเลข:\n" +
          closed.map((f, i) => `${i + 1}. ${f.subject}`).join("\n");
      }
      const target = await reopenFollowUpByIndex(input.userId, idx);
      return target
        ? `เปิดติดตามใหม่ 🔄 "${target.subject}"`
        : `ไม่เจอเรื่องที่ปิดไปที่ ${idx}`;
    }

    case "journal_show": {
      const { getJournalEntry } = await import("@/lib/journal/repo");
      const { getSettings } = await import("@/lib/settings/repo");
      const settings = await getSettings(input.userId);
      const entry = await getJournalEntry(input.userId, new Date(), settings.timezone);
      if (!entry) return "ยังไม่มี journal วันนี้ จะสร้างให้ตอน 22:00 อัตโนมัติ หรือพิมพ์ 'เขียนไดอารี่ ...' เพื่อเขียนเอง";
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
        return "ยังไม่มีบันทึกการประชุมเลย 📋\nส่งสรุปประชุม/บันทึกการประชุมมาได้เลย แจ๋วจะจดแท็ก #meeting ให้อัตโนมัติ";
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
      const { WEB_SEARCH_SYSTEM } = await import("@/lib/agent/prompts");
      const llmRes = await chat({
        messages: [
          {
            role: "system",
            content: WEB_SEARCH_SYSTEM,
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

    case "kb_add": {
      const { parseKnowledge } = await import("@/lib/kb/parse");
      const parsed = await parseKnowledge(intent.raw);
      if (!parsed) {
        return "อยากให้ผมจำเรื่องอะไรค่ะ? ลองบอกชัดๆ เช่น 'จำไว้ว่าผมชื่อ...', 'จำไว้ว่าเวลานัดประชุมให้เผื่อเวลาเดินทาง 30 นาที', หรือ 'จำไว้ว่าแฟนผมชื่อ...'";
      }
      const { upsertKnowledge } = await import("@/lib/kb/repo");
      const result = await upsertKnowledge({
        userId: input.userId,
        category: parsed.category,
        key: parsed.key,
        value: parsed.value,
        priority: parsed.priority,
      });
      const k = result.knowledge;
      if (result.previousValue !== undefined) {
        return `อัปเดตแล้ว 🧠 [${kbCategoryLabel(k.category)}]\n${k.key}: ${k.value}\n\n(เดิม: ${result.previousValue})`;
      }
      return `จำไว้แล้วค่ะ 🧠 [${kbCategoryLabel(k.category)}]\n${k.key}: ${k.value}`;
    }

    case "kb_ask": {
      const { listKnowledge } = await import("@/lib/kb/repo");
      const rows = await listKnowledge(input.userId);
      if (rows.length === 0) {
        return "ผมยังไม่รู้จักข้อมูลถาวรอะไรเกี่ยวกับคุณเลยค่ะ ลองสอนผมดู เช่น 'จำไว้ว่าผมชื่อ...' หรือ 'จำไว้ว่าเวลาตอบอีเมลให้เป็นทางการ'";
      }
      return formatKnowledgeList(rows);
    }

    case "kb_forget": {
      const { listKnowledge, deleteKnowledge } = await import("@/lib/kb/repo");
      const rows = await listKnowledge(input.userId);
      if (rows.length === 0) {
        return "ยังไม่มีข้อมูลถาวรอะไรให้ลบค่ะ";
      }
      const ordered = orderKnowledge(rows);
      const target = resolveKnowledgeTarget(ordered, intent.index, intent.query || intent.text);
      if (!target) {
        return `ไม่แน่ใจว่าจะให้ลบข้อไหนค่ะ ลองดูรายการก่อนด้วย 'รู้อะไรเกี่ยวกับผมบ้าง' แล้วบอกเลขข้อ เช่น 'ลืมข้อ 2'`;
      }
      const ok = await deleteKnowledge(input.userId, target.id);
      if (!ok) {
        return "ลบไม่สำเร็จค่ะ ลองใหม่อีกครั้ง";
      }
      return `ลบให้แล้วค่ะ 🗑️ [${kbCategoryLabel(target.category)}]\n${target.key}: ${target.value}`;
    }

    case "plan": {
      const { validatePlan } = await import("@/lib/agent/planner");
      const plan = validatePlan(intent.steps ?? []);
      if (!plan) {
        return "ไม่เข้าใจสิ่งที่ต้องทำหลายขั้นตอน — ลองบอกทีละอย่าง เช่น 'เพิ่มงาน X' ก่อน แล้วค่อย 'เตือนพรุ่งนี้ 9 โมง'";
      }
      // If any step is destructive (R2), ask for confirmation before executing
      if (plan.requiresConfirmation) {
        const { createPendingAction, expireStalePendingActions } = await import("@/lib/agent/pending");
        await expireStalePendingActions(input.userId);
        await createPendingAction({
          userId: input.userId,
          payload: plan,
          riskLevel: "R2",
          sourceEventId: input.webhookEventId,
        });
        const stepList = plan.steps.map((s, i) => `${i + 1}. ${s.action}: ${s.text}`).join("\n");
        return `ต้องทำ ${plan.steps.length} ขั้นตอน — มีบางขั้นที่ลบ/แก้ข้อมูลถาวร ยืนยันก่อนนะ:\n${stepList}\n\nพิมพ์ "ยืนยัน" เพื่อทำต่อ หรือ "ยกเลิกแผน" เพื่อยกเลิก (ภายใน 5 นาที)`;
      }
      // Execute plan with structured receipts
      const { executePlan } = await import("@/lib/agent/plan-exec");
      const result = await executePlan(plan, input, history);
      const lines = [result.summary];
      for (const r of result.receipts) {
        if (r.status === "success") lines.push(`✅ ${r.action}: ${r.result ?? ""}`);
        else if (r.status === "failed") lines.push(`❌ ${r.action}: ${r.error ?? "ล้มเหลว"}`);
        else lines.push(`⏭️ ${r.action}: ข้าม (เพราะขั้นก่อนหน้าล้มเหลว)`);
      }
      return lines.join("\n");
    }

    case "chat":
    default:
      return await chatReply(input, history, intent.action);
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

async function chatReply(input: HandleInput, history: ChatTurn[], action = "chat"): Promise<string> {
  const tz = await userTimezone(input.userId);

  // 6-layer context: IDENTITY + SOP + domain SOP + owner PROFILE (KB, always-on)
  // + live STATE + relevance-first MEMORY (RAG on THIS message).
  const { buildAgentContext } = await import("@/lib/agent/context");
  const systemMsg = await buildAgentContext({
    userId: input.userId,
    message: input.text,
    timeZone: tz,
    action,
  });

  // history รวมข้อความ user ปัจจุบัน (log แล้ว) — ตัดอันสุดท้ายออกก่อน slice
  // เพื่อไม่ให้ user message ซ้ำสองครั้งใน context
  const messages: ChatTurn[] = [
    { role: "system", content: systemMsg },
    ...history.slice(0, -1).slice(-8),
    { role: "user", content: input.text },
  ];

  const res = await chat({
    messages,
    options: { temperature: 0.6, maxOutputTokens: 600, timeoutMs: 30_000, traceId: input.traceId },
  });
  return res.text || "ไม่แน่ใจจะตอบยังไง";
}

/** โครงสร้าง section สำหรับ buildHelpFlex() — คู่กับ helpText() ด้านล่าง (เนื้อหาต้องตรงกัน) */
const HELP_SECTIONS: Array<{ title: string; lines: string[] }> = buildHelpSections();

function helpText() {
  const lines = ["แจ๋วพร้อมช่วย 🙋", ""];
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

const KB_CATEGORY_LABEL: Record<string, string> = {
  sop: "คำสั่งประจำ",
  profile: "โปรไฟล์เจ้าของ",
  relationship: "คนสำคัญ",
  preference: "ความชอบ",
  context: "บริบท",
};

function kbCategoryLabel(category: string): string {
  return KB_CATEGORY_LABEL[category] || category;
}

const KB_CATEGORY_ORDER = ["sop", "profile", "relationship", "preference", "context"];

/**
 * Canonical display order for a user's knowledge rows: grouped by category
 * (sop→profile→relationship→preference→context), preserving each group's
 * incoming order. Shared by formatKnowledgeList (numbered display) and the
 * kb_forget resolver so "ลืมข้อ N" always maps to the item shown as #N.
 */
function orderKnowledge<T extends { category: string }>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const arr = groups.get(r.category) ?? [];
    arr.push(r);
    groups.set(r.category, arr);
  }
  const ordered: T[] = [];
  for (const cat of KB_CATEGORY_ORDER) {
    const arr = groups.get(cat);
    if (arr) ordered.push(...arr);
  }
  // include any unknown category not in KB_CATEGORY_ORDER, appended last
  for (const [cat, arr] of groups) {
    if (!KB_CATEGORY_ORDER.includes(cat)) ordered.push(...arr);
  }
  return ordered;
}

/**
 * Resolve which knowledge row the owner means to forget. Prefers an explicit
 * 1-based index ("ลืมข้อ 2") against the canonical `orderKnowledge` ordering;
 * otherwise does a case-insensitive substring match on key+value, returning a
 * unique hit only (ambiguous multi-match → null so we ask instead of guessing).
 */
function resolveKnowledgeTarget<T extends { key: string; value: string }>(
  ordered: T[],
  index?: number,
  query?: string,
): T | null {
  if (typeof index === "number" && index >= 1 && index <= ordered.length) {
    return ordered[index - 1];
  }
  const q = (query ?? "").trim().toLowerCase();
  if (!q) return null;
  const matches = ordered.filter(
    (r) =>
      r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q),
  );
  return matches.length === 1 ? matches[0] : null;
}

function formatKnowledgeList(
  rows: { category: string; key: string; value: string; priority: number }[],
): string {
  const ordered = orderKnowledge(rows);
  const lines: string[] = ["ผมจำเรื่องพวกนี้เกี่ยวกับคุณไว้ค่ะ 🧠", ""];
  let lastCat = "";
  let n = 0;
  for (const r of ordered) {
    if (r.category !== lastCat) {
      if (lastCat) lines.push("");
      lines.push(`【${kbCategoryLabel(r.category)}】`);
      lastCat = r.category;
    }
    n += 1;
    lines.push(`${n}. ${r.key}: ${r.value}`);
  }
  lines.push("", "ถ้าจำผิดบอกได้ค่ะ เช่น 'ลืมข้อ 2' หรือ 'ลบที่จำว่า...'");
  return lines.join("\n").trimEnd();
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

const tzCache = new Map<string, Promise<string>>();

async function userTimezone(userId: string): Promise<string> {
  const cached = tzCache.get(userId);
  if (cached) return cached;
  const promise = (async () => {
    const { getSettings } = await import("@/lib/settings/repo");
    const settings = await getSettings(userId);
    return settings.timezone || BANGKOK;
  })();
  tzCache.set(userId, promise);
  setTimeout(() => tzCache.delete(userId), 30_000);
  promise.catch(() => tzCache.delete(userId));
  return promise;
}
