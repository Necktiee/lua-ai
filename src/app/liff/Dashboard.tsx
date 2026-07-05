"use client";

import { useEffect, useState, useCallback } from "react";
import {
  CheckCircle,
  Circle,
  Plus,
  ListChecks,
  CalendarBlank,
  Wallet,
  Target,
  Clock,
  BookOpen,
  ChatCircleDots,
  GoogleLogo,
  Gear,
  ChartBar,
} from "@phosphor-icons/react";

interface Profile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

interface StatusData {
  status: {
    hasLine: boolean;
    hasSupabase: boolean;
    hasQStash: boolean;
    hasGoogleCalendar: boolean;
    hasWebSearch: boolean;
    hasLiff: boolean;
  };
  google: { connected: boolean; scope: string | null; hasCalendar: boolean; hasGmail: boolean };
}

interface Todo {
  id: string;
  title: string;
  due_at?: string | null;
  priority: 1 | 2 | 3;
  status: "pending" | "done" | "cancelled";
}

interface CalEvent {
  id: string;
  summary: string;
  start?: string;
  end?: string;
  location?: string | null;
}

interface Expense {
  id: string;
  amount: number;
  currency: string;
  category: string;
  description?: string | null;
  expense_date: string;
}

interface Subscription {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  next_billing?: string | null;
}

interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: Record<string, number>;
}

interface Goal {
  id: string;
  title: string;
  target_value?: number | null;
  current_value: number;
  unit?: string | null;
  period: string;
}

interface JournalEntry {
  id: string;
  content: string;
  entry_date: string;
}

interface FollowUp {
  id: string;
  subject: string;
  waiting_for?: string | null;
  deadline?: string | null;
  status: string;
  created_at: string;
}

interface Msg {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface UsageData {
  summary: {
    totalCalls: number;
    totalTokens: number;
    byProvider: Record<string, { calls: number; totalTokens: number; avgElapsedMs: number }>;
  };
  recent: Array<{ provider: string; model: string; total_tokens: number; created_at: string }>;
  error?: string;
}

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-400"}`} />
      {label}
    </span>
  );
}

function Card({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-5">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function PriorityDot({ p }: { p: 1 | 2 | 3 }) {
  const cls = p === 1 ? "bg-red-500" : p === 3 ? "bg-zinc-300 dark:bg-zinc-600" : "bg-amber-500";
  const label = p === 1 ? "ด่วน" : p === 3 ? "ไม่รีบ" : "ปกติ";
  return <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${cls}`} title={label} aria-label={label} />;
}

function CardSkeleton() {
  return (
    <section className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 p-5 space-y-3">
      <div className="h-3.5 w-24 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      <div className="h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
      <div className="h-3 w-4/5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
    </section>
  );
}

export default function Dashboard({ profile }: { profile: Profile }) {
  const [statusData, setStatusData] = useState<StatusData | null>(null);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [calError, setCalError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expSummary, setExpSummary] = useState<ExpenseSummary | null>(null);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [newTodo, setNewTodo] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [statusRes, todosRes, calRes, expRes, goalsRes, journalRes, fuRes, msgRes, usageRes] = await Promise.all([
      fetch("/api/dashboard/status").then((r) => r.json()),
      fetch("/api/dashboard/todos?filter=pending").then((r) => r.json()),
      fetch("/api/dashboard/calendar?days=7").then((r) => r.json()),
      fetch("/api/dashboard/expenses").then((r) => r.json()),
      fetch("/api/dashboard/goals").then((r) => r.json()),
      fetch("/api/dashboard/journal?limit=5").then((r) => r.json()),
      fetch("/api/dashboard/followups").then((r) => r.json()),
      fetch("/api/dashboard/messages?limit=20").then((r) => r.json()),
      fetch("/api/dashboard/usage").then((r) => r.json()),
    ]);
    setStatusData(statusRes);
    setTodos(todosRes.todos ?? []);
    setEvents(calRes.events ?? []);
    setCalError(calRes.error ?? null);
    setExpenses(expRes.expenses ?? []);
    setExpSummary(expRes.summary ?? null);
    setSubs(expRes.subscriptions ?? []);
    setGoals(goalsRes.goals ?? []);
    setJournal(journalRes.entries ?? []);
    setFollowUps(fuRes.followUps ?? []);
    setMessages(msgRes.messages ?? []);
    setUsage(usageRes ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load().catch((e) => console.error("[dashboard] load failed", e));
  }, [load]);

  async function addTodo() {
    if (!newTodo.trim() || busy) return;
    setBusy(true);
    try {
      await fetch("/api/dashboard/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTodo.trim() }),
      });
      setNewTodo("");
      const r = await fetch("/api/dashboard/todos?filter=pending").then((x) => x.json());
      setTodos(r.todos ?? []);
    } finally {
      setBusy(false);
    }
  }

  async function completeTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    await fetch("/api/dashboard/todos", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: "done" }),
    });
  }

  async function closeFollowUp(id: string) {
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    await fetch("/api/dashboard/followups", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
  }

  const connectGoogle = () => {
    window.location.href = "/api/dashboard/google/connect";
  };

  if (!loaded) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-4 p-4 pb-16">
        <div className="flex items-center gap-3 py-2">
          <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-28 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
            <div className="h-3 w-20 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          </div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4 p-4 pb-16">
      <div className="flex items-center gap-3 py-2">
        {profile.pictureUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={profile.pictureUrl} alt={profile.displayName} className="w-10 h-10 rounded-full" />
        )}
        <div>
          <p className="font-semibold text-zinc-900 dark:text-zinc-100">{profile.displayName}</p>
          <p className="text-xs text-zinc-400">โฮชิ Dashboard</p>
        </div>
      </div>

      {statusData && (
        <Card title="สถานะระบบ" icon={<Gear weight="fill" className="w-4 h-4 text-zinc-400" />}>
          <div className="flex flex-wrap gap-2 mb-3">
            <Pill ok={statusData.status.hasLine} label="LINE" />
            <Pill ok={statusData.status.hasSupabase} label="Database" />
            <Pill ok={statusData.status.hasQStash} label="QStash" />
            <Pill ok={statusData.status.hasWebSearch} label="Web search" />
            <Pill ok={statusData.status.hasLiff} label="LIFF" />
          </div>
          <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 pt-3">
            <div className="text-sm">
              <p className="text-zinc-700 dark:text-zinc-300">
                Google Calendar + Gmail:{" "}
                <span className={statusData.google.connected ? "text-emerald-600" : "text-zinc-400"}>
                  {statusData.google.connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}
                </span>
              </p>
              {statusData.google.connected && (
                <p className="text-xs text-zinc-400 mt-0.5">
                  {statusData.google.hasCalendar ? "✓ Calendar" : ""}{" "}
                  {statusData.google.hasGmail ? "✓ Gmail" : ""}
                </p>
              )}
            </div>
            {!statusData.google.connected && (
              <button
                onClick={connectGoogle}
                className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 whitespace-nowrap"
              >
                <GoogleLogo weight="bold" className="w-3.5 h-3.5" />
                เชื่อม Google
              </button>
            )}
          </div>
        </Card>
      )}

      <Card
        title={`งานค้าง (${todos.length})`}
        icon={<ListChecks weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        <div className="flex gap-2 mb-3">
          <input
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTodo()}
            placeholder="เพิ่มงานใหม่..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-transparent"
          />
          <button
            onClick={addTodo}
            disabled={busy}
            className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-lg bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 disabled:opacity-50"
          >
            <Plus weight="bold" className="w-3.5 h-3.5" />
            เพิ่ม
          </button>
        </div>
        {todos.length === 0 ? (
          <p className="text-sm text-zinc-400">ไม่มีงานค้าง</p>
        ) : (
          <ul className="space-y-1.5">
            {todos.map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <button
                  onClick={() => completeTodo(t.id)}
                  className="w-4 h-4 rounded border border-zinc-300 dark:border-zinc-600 flex-shrink-0"
                  aria-label="complete"
                />
                <PriorityDot p={t.priority} />
                <span className="flex-1 text-zinc-700 dark:text-zinc-300">{t.title}</span>
                {t.due_at && <span className="text-xs text-zinc-400">{fmtDate(t.due_at)}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="ปฏิทิน 7 วันข้างหน้า"
        icon={<CalendarBlank weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {calError ? (
          <p className="text-sm text-zinc-400">{calError}</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-zinc-400">ไม่มีนัด</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="text-zinc-700 dark:text-zinc-300">{e.summary}</p>
                <p className="text-xs text-zinc-400">
                  {fmtDate(e.start)}
                  {e.location ? ` · ${e.location}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="ค่าใช้จ่ายเดือนนี้"
        icon={<Wallet weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {expSummary && (
          <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
            {expSummary.total.toLocaleString()} บาท
            <span className="text-sm text-zinc-400 font-normal ml-2">{expSummary.count} รายการ</span>
          </p>
        )}
        {expSummary && Object.keys(expSummary.byCategory).length > 0 && (
          <div className="space-y-1 mb-3">
            {Object.entries(expSummary.byCategory).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-xs text-zinc-500">
                <span>{cat}</span>
                <span>{amt.toLocaleString()} บาท</span>
              </div>
            ))}
          </div>
        )}
        {expenses.length > 0 && (
          <ul className="border-t border-zinc-100 dark:border-zinc-800 pt-2 space-y-1">
            {expenses.slice(0, 5).map((e) => (
              <li key={e.id} className="flex justify-between text-xs text-zinc-500">
                <span>{e.description || e.category}</span>
                <span>{e.amount.toLocaleString()} {e.currency}</span>
              </li>
            ))}
          </ul>
        )}
        {subs.length > 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-2 mt-2 space-y-1">
            <p className="text-xs text-zinc-400 mb-1">Subscriptions</p>
            {subs.map((s) => (
              <div key={s.id} className="flex justify-between text-xs text-zinc-500">
                <span>{s.name}</span>
                <span>{s.amount.toLocaleString()} {s.currency}/{s.billing_cycle}</span>
              </div>
            ))}
          </div>
        )}
        {expenses.length === 0 && subs.length === 0 && (!expSummary || expSummary.count === 0) && (
          <p className="text-sm text-zinc-400">ยังไม่มีข้อมูล</p>
        )}
      </Card>

      <Card title="เป้าหมาย" icon={<Target weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}>
        {goals.length === 0 ? (
          <p className="text-sm text-zinc-400">ยังไม่มีเป้าหมาย</p>
        ) : (
          <ul className="space-y-3">
            {goals.map((g) => {
              const pct = g.target_value ? Math.min(100, Math.round((g.current_value / g.target_value) * 100)) : 0;
              return (
                <li key={g.id}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-zinc-700 dark:text-zinc-300">{g.title}</span>
                    <span className="text-xs text-zinc-400">
                      {g.current_value}{g.target_value ? `/${g.target_value}` : ""} {g.unit ?? ""}
                    </span>
                  </div>
                  {g.target_value && (
                    <div className="h-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-zinc-900 dark:bg-zinc-100" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="งานรอคำตอบ (Follow-up)"
        icon={<Clock weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {followUps.length === 0 ? (
          <p className="text-sm text-zinc-400">ไม่มีงานรอคำตอบ</p>
        ) : (
          <ul className="space-y-2">
            {followUps.map((f) => (
              <li key={f.id} className="flex items-start gap-2 text-sm">
                <button
                  onClick={() => closeFollowUp(f.id)}
                  className="text-xs px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-500 flex-shrink-0"
                >
                  ปิด
                </button>
                <div className="flex-1">
                  <p className="text-zinc-700 dark:text-zinc-300">{f.subject}</p>
                  {f.waiting_for && <p className="text-xs text-zinc-400">รอ: {f.waiting_for}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="บันทึกประจำวันล่าสุด"
        icon={<BookOpen weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {journal.length === 0 ? (
          <p className="text-sm text-zinc-400">ยังไม่มีบันทึก</p>
        ) : (
          <ul className="space-y-2">
            {journal.map((j) => (
              <li key={j.id} className="text-sm">
                <p className="text-xs text-zinc-400 mb-0.5">{j.entry_date}</p>
                <p className="text-zinc-700 dark:text-zinc-300 line-clamp-3">{j.content}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="ประวัติแชทล่าสุด"
        icon={<ChatCircleDots weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
      >
        {messages.length === 0 ? (
          <p className="text-sm text-zinc-400">ยังไม่มีประวัติ</p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {messages
              .slice()
              .reverse()
              .map((m) => (
                <li key={m.id} className="text-xs">
                  <span
                    className={`font-medium mr-1 ${
                      m.role === "user" ? "text-zinc-900 dark:text-zinc-100" : "text-emerald-600 dark:text-emerald-400"
                    }`}
                  >
                    {m.role === "user" ? "คุณ" : "โฮชิ"}:
                  </span>
                  <span className="text-zinc-500">{m.content.slice(0, 120)}</span>
                </li>
              ))}
          </ul>
        )}
      </Card>

      {usage && (
        <Card
          title="การใช้งาน AI (7 วัน)"
          icon={<ChartBar weight="fill" className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />}
        >
          {usage.error || usage.summary.totalCalls === 0 ? (
            <p className="text-sm text-zinc-400">ยังไม่มีข้อมูลการใช้งาน</p>
          ) : (
            <>
              <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                {usage.summary.totalTokens.toLocaleString()} tokens
                <span className="text-sm text-zinc-400 font-normal ml-2">{usage.summary.totalCalls} calls</span>
              </p>
              <div className="space-y-1">
                {Object.entries(usage.summary.byProvider).map(([provider, stats]) => (
                  <div key={provider} className="flex justify-between text-xs text-zinc-500">
                    <span>{provider}</span>
                    <span>
                      {stats.calls} calls · {stats.totalTokens.toLocaleString()} tokens · ~{stats.avgElapsedMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
