"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowClockwise,
  BookOpen,
  Brain,
  CalendarBlank,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  ClipboardText,
  Clock,
  Gear,
  GoogleLogo,
  House,
  ListChecks,
  NotePencil,
  Plus,
  Sparkle,
  Scales,
  Target,
  Trash,
  Users,
  Wallet,
  WarningCircle,
  X,
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

interface Reminder {
  id: string;
  message: string;
  fire_at: string;
}

interface Commitment {
  id: string;
  title: string;
  responsible_party: "owner" | "other";
  counterparty: string | null;
  due_at: string | null;
  review_at: string | null;
  status: "open" | "fulfilled" | "cancelled";
}

interface Decision {
  id: string;
  title: string;
  options: string[];
  rationale: string | null;
  assumptions: string[];
  review_at: string | null;
  outcome: string | null;
  status: "open" | "reviewed" | "superseded";
  created_at: string;
}

interface FocusWindow {
  id: string;
  label: string;
  day_of_week: number;
  start_minute: number;
  end_minute: number;
  priority_threshold: number;
  enabled: boolean;
}

interface CorrectionTally {
  feature: string;
  n: number;
}

interface Msg {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

interface Meeting {
  id: string;
  title: string;
  occurred_at: string;
  participants: string[];
  summary: string | null;
  source: "manual" | "transcript" | "calendar" | "agent";
  created_at: string;
}

interface MemoryNote {
  id: string;
  kind: string;
  content: string;
  tags?: string[];
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

interface Knowledge {
  id: string;
  category: "profile" | "preference" | "sop" | "relationship" | "context";
  key: string;
  value: string;
  priority: 1 | 2 | 3;
  source: "user" | "inferred" | "system";
  updated_at: string;
}

interface PersonView {
  id: string;
  name: string;
  aliases: string[];
  notes: Record<string, unknown>;
  tier?: 1 | 2 | 3 | 4 | null;
  last_seen?: string | null;
  updated_at: string;
}

type PageId = "overview" | "tasks" | "calendar" | "finance" | "goals" | "memory" | "knowledge" | "people" | "system";
type Destination = "today" | "work" | "life" | "jaew";

const NAV_ITEMS: Array<{
  id: PageId;
  label: string;
  short: string;
  icon: (className: string) => React.ReactNode;
}> = [
  { id: "overview", label: "ภาพรวม", short: "รวม", icon: (c) => <House weight="fill" className={c} /> },
  { id: "tasks", label: "งาน", short: "งาน", icon: (c) => <ListChecks weight="fill" className={c} /> },
  { id: "calendar", label: "เวลา", short: "เวลา", icon: (c) => <CalendarBlank weight="fill" className={c} /> },
  { id: "finance", label: "เงิน", short: "เงิน", icon: (c) => <Wallet weight="fill" className={c} /> },
  { id: "goals", label: "เป้าหมาย", short: "เป้า", icon: (c) => <Target weight="fill" className={c} /> },
  { id: "memory", label: "บันทึก", short: "จำ", icon: (c) => <NotePencil weight="fill" className={c} /> },
  { id: "knowledge", label: "ตัวตน", short: "ตัวตน", icon: (c) => <Brain weight="fill" className={c} /> },
  { id: "people", label: "คน", short: "คน", icon: (c) => <Users weight="fill" className={c} /> },
  { id: "system", label: "ระบบ", short: "ระบบ", icon: (c) => <Gear weight="fill" className={c} /> },
];

const NAV_BY_ID = new Map(NAV_ITEMS.map((item) => [item.id, item]));

/** Four destinations group the nine pages to keep the bottom bar uncluttered. */
const DESTINATIONS: Array<{
  id: Destination;
  label: string;
  short: string;
  icon: (className: string) => React.ReactNode;
  tabs: PageId[];
}> = [
  { id: "today", label: "วันนี้", short: "วันนี้", icon: (c) => <House weight="fill" className={c} />, tabs: ["overview"] },
  { id: "work", label: "งาน", short: "งาน", icon: (c) => <ListChecks weight="fill" className={c} />, tabs: ["tasks", "goals"] },
  { id: "life", label: "ชีวิต", short: "ชีวิต", icon: (c) => <CalendarBlank weight="fill" className={c} />, tabs: ["calendar", "finance", "people"] },
  { id: "jaew", label: "แจ๋ว", short: "แจ๋ว", icon: (c) => <Sparkle weight="fill" className={c} />, tabs: ["memory", "knowledge", "system"] },
];

function destOfPage(page: PageId): Destination {
  return DESTINATIONS.find((d) => d.tabs.includes(page))?.id ?? "today";
}

interface UserSettingsView {
  briefing_time: string;
  evening_time: string;
  briefing_enabled: boolean;
  evening_enabled: boolean;
  timezone: string;
  retention_days: number;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

const money = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("th-TH", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Bangkok",
    });
  } catch {
    return iso;
  }
}

function fmtDay(iso?: string | null) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("th-TH", {
      weekday: "short",
      day: "numeric",
      month: "short",
      timeZone: "Asia/Bangkok",
    });
  } catch {
    return iso;
  }
}

function goalPct(goal: Goal) {
  if (!goal.target_value) return 0;
  return Math.min(100, Math.round((goal.current_value / goal.target_value) * 100));
}

function pageFromHash(): PageId {
  if (typeof window === "undefined") return "overview";
  const value = window.location.hash.replace("#", "") as PageId;
  return NAV_ITEMS.some((item) => item.id === value) ? value : "overview";
}

function PriorityDot({ p }: { p: 1 | 2 | 3 }) {
  const cls = p === 1 ? "bg-red-500" : p === 3 ? "bg-zinc-300 dark:bg-zinc-600" : "bg-amber-500";
  const label = p === 1 ? "ด่วน" : p === 3 ? "ไม่รีบ" : "ปกติ";
  return <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${cls}`} title={label} aria-label={label} />;
}

const KB_CATEGORY_ROWS: ReadonlyArray<readonly [Knowledge["category"], string]> = [
  ["sop", "คำสั่งประจำ"],
  ["profile", "โปรไฟล์เจ้าของ"],
  ["relationship", "คนสำคัญ"],
  ["preference", "ความชอบ"],
  ["context", "บริบท"],
];

const TIER_ROWS: ReadonlyArray<readonly [1 | 2 | 3 | 4, string]> = [
  [1, "P1 · สำคัญที่สุด"],
  [2, "P2 · สัมพันธ์สำคัญ"],
  [3, "P3 · ทั่วไป"],
  [4, "P4 · ภายนอก/เย็น"],
];

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
        ok
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
          : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-500" : "bg-zinc-400"}`} />
      {label}
    </span>
  );
}

function Card({ title, icon, children, className = "" }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[1.6rem] border border-zinc-200/70 bg-white/85 p-5 shadow-sm shadow-zinc-200/50 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80 dark:shadow-black/20 ${className}`}>
      {title && (
        <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {icon}
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

function StatTile({ label, value, hint, tone = "zinc" }: { label: string; value: string; hint: string; tone?: "zinc" | "emerald" | "amber" | "red" }) {
  const toneClass = {
    zinc: "text-zinc-900 dark:text-zinc-50",
    emerald: "text-emerald-700 dark:text-emerald-300",
    amber: "text-amber-700 dark:text-amber-300",
    red: "text-red-700 dark:text-red-300",
  }[tone];
  return (
    <div className="rounded-2xl border border-zinc-200/70 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/40">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-1 text-xs text-zinc-400">{hint}</p>
    </div>
  );
}

function EmptyState({ title, hint, icon }: { title: string; hint: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 p-6 text-center dark:border-zinc-800 dark:bg-zinc-950/40">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-400 shadow-sm dark:bg-zinc-900">{icon}</div>
      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</p>
      <p className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{hint}</p>
    </div>
  );
}

function CommandHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50/70 p-4 text-sm text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/25 dark:text-emerald-200">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-300">
        <Sparkle weight="fill" className="h-3.5 w-3.5" />
        สั่งผ่าน LINE ได้
      </p>
      <p className="leading-6">{children}</p>
    </div>
  );
}

function CardSkeleton() {
  return (
    <section className="rounded-[1.6rem] border border-zinc-200/70 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="h-3.5 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="mt-4 h-3 w-full animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
      <div className="mt-2 h-3 w-4/5 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
    </section>
  );
}

async function safeFetch<T>(url: string, fallback: T, onFailure?: () => void): Promise<T> {
  try {
    const r = await fetch(url);
    if (!r.ok) {
      onFailure?.();
      return fallback;
    }
    return (await r.json()) as T;
  } catch {
    onFailure?.();
    return fallback;
  }
}

export default function Dashboard({ profile }: { profile: Profile }) {
  const [activePage, setActivePage] = useState<PageId>(() => pageFromHash());
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
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [focusWindows, setFocusWindows] = useState<FocusWindow[]>([]);
  const [correctionTally, setCorrectionTally] = useState<CorrectionTally[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [memories, setMemories] = useState<MemoryNote[]>([]);
  const [knowledge, setKnowledge] = useState<Knowledge[]>([]);
  const [people, setPeople] = useState<PersonView[]>([]);
  const [newTodo, setNewTodo] = useState("");
  const [newPersonName, setNewPersonName] = useState("");
  const [newPersonTier, setNewPersonTier] = useState<1 | 2 | 3 | 4>(3);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editAliases, setEditAliases] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [newKbCategory, setNewKbCategory] = useState<Knowledge["category"]>("profile");
  const [newKbKey, setNewKbKey] = useState("");
  const [newKbValue, setNewKbValue] = useState("");
  const [newKbPriority, setNewKbPriority] = useState<1 | 2 | 3>(2);
  const [editingKbId, setEditingKbId] = useState<string | null>(null);
  const [editKbKey, setEditKbKey] = useState("");
  const [editKbValue, setEditKbValue] = useState("");
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newGoalTarget, setNewGoalTarget] = useState("");
  const [newGoalUnit, setNewGoalUnit] = useState("");
  const [newGoalPeriod, setNewGoalPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [editingTodoId, setEditingTodoId] = useState<string | null>(null);
  const [editTodoTitle, setEditTodoTitle] = useState("");
  const [editTodoDue, setEditTodoDue] = useState("");
  const [editTodoPriority, setEditTodoPriority] = useState<1 | 2 | 3>(2);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [flash, setFlash] = useState<{ message: string; undoId?: string } | null>(null);
  const [settings, setSettings] = useState<UserSettingsView | null>(null);
  const [online, setOnline] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);

  const loadTodos = useCallback(async () => {
    const res = await safeFetch<{ todos: Todo[] }>("/api/dashboard/todos?filter=pending", { todos: [] });
    setTodos(res.todos ?? []);
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    const fetchDashboard = <T,>(url: string, fallback: T) =>
      safeFetch(url, fallback, () => setLoadError(true));
    const [statusRes, todosRes, calRes, expRes, goalsRes, journalRes, fuRes, remindersRes, commitmentsRes, decisionsRes, focusRes, correctionRes, msgRes, usageRes, meetingsRes, memoriesRes, knowledgeRes, peopleRes, settingsRes] = await Promise.all([
      fetchDashboard<StatusData | null>("/api/dashboard/status", null),
      fetchDashboard<{ todos: Todo[] }>("/api/dashboard/todos?filter=pending", { todos: [] }),
      fetchDashboard<{ events?: CalEvent[]; error?: string | null }>("/api/dashboard/calendar?days=14", {}),
      fetchDashboard<{ expenses?: Expense[]; summary?: ExpenseSummary | null; subscriptions?: Subscription[] }>("/api/dashboard/expenses", {}),
      fetchDashboard<{ goals: Goal[] }>("/api/dashboard/goals", { goals: [] }),
      fetchDashboard<{ entries: JournalEntry[] }>("/api/dashboard/journal?limit=14", { entries: [] }),
      fetchDashboard<{ followUps: FollowUp[] }>("/api/dashboard/followups", { followUps: [] }),
      fetchDashboard<{ reminders: Reminder[] }>("/api/dashboard/reminders", { reminders: [] }),
      fetchDashboard<{ commitments: Commitment[] }>("/api/dashboard/commitments", { commitments: [] }),
      fetchDashboard<{ decisions: Decision[] }>("/api/dashboard/decisions", { decisions: [] }),
      fetchDashboard<{ focusWindows: FocusWindow[] }>("/api/dashboard/focus-windows", { focusWindows: [] }),
      fetchDashboard<{ counts: CorrectionTally[] }>("/api/dashboard/corrections", { counts: [] }),
      fetchDashboard<{ messages: Msg[] }>("/api/dashboard/messages?limit=40", { messages: [] }),
      fetchDashboard<UsageData | null>("/api/dashboard/usage", null),
      fetchDashboard<{ meetings: Meeting[] }>("/api/dashboard/meetings", { meetings: [] }),
      fetchDashboard<{ memories: MemoryNote[] }>("/api/dashboard/memories?limit=40", { memories: [] }),
      fetchDashboard<{ knowledge: Knowledge[] }>("/api/dashboard/knowledge", { knowledge: [] }),
      fetchDashboard<{ people: PersonView[] }>("/api/dashboard/people?limit=60", { people: [] }),
      fetchDashboard<{ settings: UserSettingsView | null }>("/api/dashboard/settings", { settings: null }),
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
    setReminders(remindersRes.reminders ?? []);
    setCommitments(commitmentsRes.commitments ?? []);
    setDecisions(decisionsRes.decisions ?? []);
    setFocusWindows(focusRes.focusWindows ?? []);
    setCorrectionTally(correctionRes.counts ?? []);
    setMessages(msgRes.messages ?? []);
    setUsage(usageRes);
    setMeetings(meetingsRes.meetings ?? []);
    setMemories(memoriesRes.memories ?? []);
    setKnowledge(knowledgeRes.knowledge ?? []);
    setPeople(peopleRes.people ?? []);
    setSettings(settingsRes.settings ?? null);
    setLoaded(true);
  }, []);

  useEffect(() => {
    const onHash = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      load().catch((e) => console.error("[dashboard] load failed", e));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadTodos().catch((e) => console.error("[dashboard] todo sync failed", e));
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [loadTodos]);

  useEffect(() => {
    const syncOnlineState = () => setOnline(navigator.onLine);
    syncOnlineState();
    window.addEventListener("online", syncOnlineState);
    window.addEventListener("offline", syncOnlineState);
    return () => {
      window.removeEventListener("online", syncOnlineState);
      window.removeEventListener("offline", syncOnlineState);
    };
  }, []);

  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function go(page: PageId) {
    setActivePage(page);
    window.history.replaceState(null, "", `#${page}`);
  }

  async function addTodo() {
    if (!newTodo.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/dashboard/todos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: newTodo.trim() }),
      });
      if (!r.ok) throw new Error("add todo failed");
      setNewTodo("");
      await loadTodos();
    } catch {
      // Keep input on failure so user can retry
    } finally {
      setBusy(false);
    }
  }

  async function completeTodo(id: string) {
    const previous = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      const r = await fetch("/api/dashboard/todos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "done" }),
      });
      if (!r.ok) throw new Error("complete failed");
    } catch {
      setTodos(previous);
    }
  }

  async function deleteTodo(id: string) {
    const target = todos.find((t) => t.id === id);
    if (!target || !window.confirm(`ลบงาน "${target.title}" ถาวร?`)) return;

    const previous = todos;
    setTodos((prev) => prev.filter((t) => t.id !== id));
    try {
      const r = await fetch(`/api/dashboard/todos?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete failed");
      const data = (await r.json()) as { undo?: { id: string } | null };
      setFlash({
        message: `ลบงาน "${target.title}" แล้ว`,
        undoId: data.undo?.id,
      });
    } catch {
      setTodos(previous);
      setFlash({ message: "ลบงานไม่สำเร็จ ลองใหม่" });
    }
  }

  async function undoLast() {
    if (!flash?.undoId) return;
    try {
      const r = await fetch("/api/dashboard/undo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: flash.undoId }),
      });
      if (!r.ok) throw new Error("undo failed");
      setFlash({ message: "กู้คืนแล้ว" });
      await load();
    } catch {
      setFlash({ message: "กู้คืนไม่สำเร็จ (หมดเวลาหรือใช้ไปแล้ว)" });
    }
  }

  async function saveTodoEdit(id: string) {
    const patch = {
      title: editTodoTitle.trim() || undefined,
      dueAt: editTodoDue.trim() || null,
      priority: editTodoPriority,
    };
    const previous = todos;
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, title: patch.title ?? t.title, due_at: patch.dueAt ?? t.due_at ?? null, priority: patch.priority } : t)));
    try {
      const r = await fetch("/api/dashboard/todos", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!r.ok) throw new Error("edit todo failed");
      setEditingTodoId(null);
    } catch {
      setTodos(previous);
    }
  }

  async function deleteKnowledgeItem(id: string) {
    const target = knowledge.find((k) => k.id === id);
    if (!target || !window.confirm(`ลบ "${target.key}" ถาวร?`)) return;
    const previous = knowledge;
    setKnowledge((prev) => prev.filter((k) => k.id !== id));
    try {
      const r = await fetch(`/api/dashboard/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete knowledge failed");
    } catch {
      setKnowledge(previous);
    }
  }

  async function setKnowledgePriority(id: string, priority: 1 | 2 | 3) {
    const previous = knowledge;
    setKnowledge((prev) => prev.map((k) => (k.id === id ? { ...k, priority } : k)));
    try {
      const r = await fetch("/api/dashboard/knowledge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, priority }),
      });
      if (!r.ok) throw new Error("patch knowledge failed");
    } catch {
      setKnowledge(previous);
    }
  }

  async function createKnowledge(input: { category: Knowledge["category"]; key: string; value: string; priority: 1 | 2 | 3 }) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/dashboard/knowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error("create knowledge failed");
      const { knowledge: item } = (await r.json()) as { knowledge: Knowledge };
      setKnowledge((prev) => [item, ...prev]);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveKnowledgeEdit(id: string, patch: { key: string; value: string }) {
    const previous = knowledge;
    setKnowledge((prev) => prev.map((k) => (k.id === id ? { ...k, key: patch.key, value: patch.value } : k)));
    try {
      const r = await fetch("/api/dashboard/knowledge", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, key: patch.key, value: patch.value }),
      });
      if (!r.ok) throw new Error("patch knowledge failed");
    } catch {
      setKnowledge(previous);
    }
  }

  async function createPerson(input: { name: string; tier?: 1 | 2 | 3 | 4; aliases?: string[]; notesText?: string }) {
    if (busy) return;
    setBusy(true);
    try {
      const notes: Record<string, unknown> = {};
      if (input.notesText?.trim()) notes.note = input.notesText.trim();
      const r = await fetch("/api/dashboard/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: input.name.trim(), tier: input.tier, aliases: input.aliases, notes }),
      });
      if (!r.ok) throw new Error("create person failed");
      const { person } = (await r.json()) as { person: PersonView };
      setPeople((prev) => [person, ...prev]);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function savePersonEdit(id: string, patch: Partial<Pick<PersonView, "name" | "aliases" | "tier">> & { notesText?: string }) {
    const previous = people;
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch, aliases: patch.aliases ?? p.aliases, tier: patch.tier ?? p.tier } : p)));
    const body: Record<string, unknown> = { id };
    if (patch.name !== undefined) body.name = patch.name;
    if (patch.aliases !== undefined) body.aliases = patch.aliases;
    if (patch.tier !== undefined) body.tier = patch.tier;
    if (patch.notesText !== undefined) body.notes = patch.notesText.trim() ? { note: patch.notesText.trim() } : {};
    try {
      const r = await fetch("/api/dashboard/people", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error("patch person failed");
    } catch {
      setPeople(previous);
    }
  }

  async function cyclePersonTier(id: string) {
    const target = people.find((p) => p.id === id);
    if (!target) return;
    const current = target.tier ?? 3;
    const next = ((current % 4) + 1) as 1 | 2 | 3 | 4;
    await savePersonEdit(id, { tier: next });
  }

  async function deletePersonItem(id: string) {
    const target = people.find((p) => p.id === id);
    if (!target || !window.confirm(`ลบ "${target.name}" ถาวร?`)) return;
    const previous = people;
    setPeople((prev) => prev.filter((p) => p.id !== id));
    try {
      const r = await fetch(`/api/dashboard/people?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete person failed");
    } catch {
      setPeople(previous);
    }
  }

  async function deleteExpenseItem(id: string) {
    const previous = expenses;
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    try {
      const r = await fetch(`/api/dashboard/expenses?id=${encodeURIComponent(id)}&kind=expense`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete expense failed");
    } catch {
      setExpenses(previous);
    }
  }

  async function cancelSubscriptionItem(id: string) {
    const target = subs.find((s) => s.id === id);
    if (!target || !window.confirm(`ยกเลิก "${target.name}"?`)) return;
    const previous = subs;
    setSubs((prev) => prev.filter((s) => s.id !== id));
    try {
      const r = await fetch(`/api/dashboard/expenses?id=${encodeURIComponent(id)}&kind=subscription`, { method: "DELETE" });
      if (!r.ok) throw new Error("cancel subscription failed");
    } catch {
      setSubs(previous);
    }
  }

  async function deleteGoalItem(id: string) {
    const target = goals.find((g) => g.id === id);
    if (!target || !window.confirm(`ลบเป้าหมาย "${target.title}"?`)) return;
    const previous = goals;
    setGoals((prev) => prev.filter((g) => g.id !== id));
    try {
      const r = await fetch(`/api/dashboard/goals?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!r.ok) throw new Error("delete goal failed");
    } catch {
      setGoals(previous);
    }
  }

  async function createGoal(input: { title: string; period: "daily" | "weekly" | "monthly"; targetValue?: number; unit?: string }) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/dashboard/goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!r.ok) throw new Error("create goal failed");
      const { goal } = (await r.json()) as { goal: Goal };
      setGoals((prev) => [goal, ...prev]);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function deleteMemoryItem(id: string) {
    const previous = memories;
    const target = memories.find((m) => m.id === id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
    try {
      const r = await fetch("/api/dashboard/memories", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("delete memory failed");
      const data = (await r.json()) as { undo?: { id: string } | null };
      setFlash({
        message: `ลบบันทึกแล้ว${target ? `: ${target.content.slice(0, 40)}` : ""}`,
        undoId: data.undo?.id,
      });
    } catch {
      setMemories(previous);
      setFlash({ message: "ลบบันทึกไม่สำเร็จ" });
    }
  }

  async function closeFollowUp(id: string) {
    const previous = followUps;
    setFollowUps((prev) => prev.filter((f) => f.id !== id));
    try {
      const r = await fetch("/api/dashboard/followups", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error("close follow-up failed");
    } catch {
      setFollowUps(previous);
    }
  }

  async function cancelReminderItem(id: string) {
    const previous = reminders;
    setReminders((current) => current.filter((reminder) => reminder.id !== id));
    try {
      const response = await fetch(`/api/dashboard/reminders?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("cancel reminder failed");
      setFlash({ message: "ยกเลิกการเตือนแล้ว" });
    } catch {
      setReminders(previous);
      setFlash({ message: "ยกเลิกการเตือนไม่สำเร็จ ลองใหม่" });
    }
  }

  async function recordRecommendation(id: string, action: "accepted" | "dismissed") {
    try {
      const response = await fetch("/api/dashboard/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ feature: "commitment_ledger", recommendationKey: id, action }),
      });
      if (!response.ok) throw new Error("recommendation feedback failed");
      setFlash({ message: action === "accepted" ? "บันทึกว่าเห็นด้วยแล้ว" : "จะไม่แนะนำรายการนี้ในตอนนี้" });
    } catch {
      setFlash({ message: "บันทึกความเห็นไม่สำเร็จ ลองใหม่" });
    }
  }

  const connectGoogle = () => {
    window.location.href = "/api/dashboard/google/connect";
  };

  const urgentTodos = todos.filter((t) => t.priority === 1);
  const normalTodos = todos.filter((t) => t.priority === 2);
  const lowTodos = todos.filter((t) => t.priority === 3);
  const nextEvent = events[0];
  const nextAction = urgentTodos[0]
    ? { label: urgentTodos[0].title, reason: "งานด่วนจึงถูกจัดไว้ก่อน", evidence: "ข้อมูลสนับสนุน: งานนี้มีระดับความสำคัญด่วน (P1) ในรายการงานของคุณ", due: urgentTodos[0].due_at }
    : normalTodos[0]
      ? { label: normalTodos[0].title, reason: "งานที่รออยู่จึงเป็นลำดับถัดไป", evidence: "ข้อมูลสนับสนุน: งานนี้ยังค้างอยู่ในรายการงานปกติของคุณ", due: normalTodos[0].due_at }
      : followUps[0]
        ? { label: followUps[0].subject, reason: "มีรายการที่รอคำตอบ", evidence: "ข้อมูลสนับสนุน: รายการนี้อยู่ใน follow-up ที่กำลังรอคำตอบ", due: followUps[0].deadline }
        : null;
  const categoryRows = Object.entries(expSummary?.byCategory ?? {}).sort((a, b) => b[1] - a[1]);
  const maxCategory = Math.max(1, ...categoryRows.map(([, value]) => value));
  const avgGoal = goals.length ? Math.round(goals.reduce((sum, goal) => sum + goalPct(goal), 0) / goals.length) : 0;
  const providerRows = Object.entries(usage?.summary.byProvider ?? {}).sort((a, b) => b[1].totalTokens - a[1].totalTokens);
  const maxProviderTokens = Math.max(1, ...providerRows.map(([, value]) => value.totalTokens));

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 pb-20 md:p-6">
        <div className="flex items-center gap-3 py-2">
          <div className="h-11 w-11 animate-pulse rounded-full bg-zinc-100 dark:bg-zinc-800" />
          <div className="space-y-1.5">
            <div className="h-3.5 w-32 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
            <div className="h-3 w-24 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          <CardSkeleton />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_34rem),linear-gradient(180deg,#fafafa,transparent_20rem)] dark:bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_32rem),linear-gradient(180deg,#09090b,transparent_22rem)]">
      <div className="mx-auto w-full max-w-6xl px-4 py-4 pb-24 md:px-6 lg:pb-10">
        {!online && (
          <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <span>ออฟไลน์อยู่ ข้อมูลที่เห็นอาจไม่ใช่ข้อมูลล่าสุด และยังไม่ควรบันทึกการเปลี่ยนแปลง</span>
            <button onClick={refresh} disabled={refreshing} className="min-h-11 rounded-full bg-amber-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-amber-100 dark:text-amber-950">
              ลองเชื่อมใหม่
            </button>
          </div>
        )}
        {online && loadError && (
          <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            <span>บางข้อมูลโหลดไม่สำเร็จ ข้อมูลว่างอาจไม่ได้หมายความว่ายังไม่มีรายการ</span>
            <button onClick={refresh} disabled={refreshing} className="min-h-11 rounded-full bg-amber-900 px-3 text-xs font-medium text-white disabled:opacity-50 dark:bg-amber-100 dark:text-amber-950">ลองใหม่</button>
          </div>
        )}
        <header className="mb-4 flex items-center justify-between gap-3 rounded-[1.6rem] border border-zinc-200/70 bg-white/80 p-3 shadow-sm shadow-zinc-200/50 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/75 dark:shadow-black/20">
          <div className="flex min-w-0 items-center gap-3">
            {profile.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.pictureUrl} alt={profile.displayName} className="h-11 w-11 rounded-full object-cover" />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <Sparkle weight="fill" className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">{profile.displayName}</p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">แจ๋ว · {DESTINATIONS.find((d) => d.id === destOfPage(activePage))?.label}{destOfPage(activePage) !== "today" && NAV_BY_ID.get(activePage) ? ` · ${NAV_BY_ID.get(activePage)!.label}` : ""}</p>
            </div>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-sm transition active:scale-[0.98] disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
          >
            <ArrowClockwise className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            รีเฟรช
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[224px_1fr] lg:items-start">
          <aside className="hidden lg:sticky lg:top-4 lg:block">
            <nav className="rounded-[1.6rem] border border-zinc-200/70 bg-white/80 p-2 shadow-sm shadow-zinc-200/50 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/75 dark:shadow-black/20">
              {DESTINATIONS.map((d) => {
                const active = d.id === destOfPage(activePage);
                return (
                  <div key={d.id}>
                    <button
                      onClick={() => go(d.tabs[0])}
                      className={`mb-1 flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left text-sm font-medium transition active:scale-[0.99] ${
                        active
                          ? "bg-zinc-950 text-white shadow-sm dark:bg-zinc-50 dark:text-zinc-950"
                          : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      }`}
                    >
                      {d.icon("h-4 w-4")}
                      {d.label}
                    </button>
                    {active && d.tabs.length > 1 && (
                      <div className="mb-1 ml-6 flex flex-col gap-0.5 border-l border-zinc-200 pl-3 dark:border-zinc-700">
                        {d.tabs.map((tabId) => {
                          const tab = NAV_BY_ID.get(tabId)!;
                          const tabActive = tabId === activePage;
                          return (
                            <button
                              key={tabId}
                              onClick={() => go(tabId)}
                              className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs font-medium transition ${
                                tabActive ? "text-emerald-600 dark:text-emerald-300" : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
                              }`}
                            >
                              {tab.icon("h-3.5 w-3.5")}
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>
          </aside>

          <main className="space-y-4">
            {(() => {
              const dest = DESTINATIONS.find((d) => d.id === destOfPage(activePage));
              if (dest && dest.tabs.length > 1) {
                return (
                  <div className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200/70 bg-white/80 p-1 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/75 lg:hidden">
                    {dest.tabs.map((tabId) => {
                      const tab = NAV_BY_ID.get(tabId)!;
                      const tabActive = tabId === activePage;
                      return (
                        <button
                          key={tabId}
                          onClick={() => go(tabId)}
                          className={`flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-2 text-xs font-medium transition active:scale-[0.98] ${
                            tabActive
                              ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950"
                              : "text-zinc-500 dark:text-zinc-400"
                          }`}
                        >
                          {tab.icon("h-3.5 w-3.5")}
                          {tab.label}
                        </button>
                      );
                    })}
                  </div>
                );
              }
              return null;
            })()}
            {activePage === "overview" && (
              <>
                <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
                  <Card className="overflow-hidden bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                    <div className="flex h-full flex-col justify-between gap-8">
                      <div>
                        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 dark:text-emerald-700">Command center</p>
                        <h1 className="max-w-xl text-3xl font-semibold leading-tight tracking-tight md:text-5xl">วันนี้ต้องเคลียร์อะไร ดูได้ในหน้าเดียว</h1>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-zinc-300 dark:text-zinc-600">รวมงานด่วน นัดถัดไป เงินเดือนนี้ เป้าหมาย และสิ่งที่รอคนอื่นตอบ เพื่อให้เริ่มวันได้เร็วขึ้น</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <button onClick={() => go("tasks")} className="rounded-2xl bg-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/15 active:scale-[0.98] dark:bg-zinc-950/10 dark:hover:bg-zinc-950/15">
                          งานค้าง <span className="block text-2xl font-semibold">{todos.length}</span>
                        </button>
                        <button onClick={() => go("calendar")} className="rounded-2xl bg-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/15 active:scale-[0.98] dark:bg-zinc-950/10 dark:hover:bg-zinc-950/15">
                          นัดถัดไป <span className="block truncate text-2xl font-semibold">{nextEvent ? fmtDay(nextEvent.start) : "ว่าง"}</span>
                        </button>
                        <button onClick={() => go("goals")} className="rounded-2xl bg-white/10 px-4 py-3 text-left text-sm transition hover:bg-white/15 active:scale-[0.98] dark:bg-zinc-950/10 dark:hover:bg-zinc-950/15">
                          เป้าหมาย <span className="block text-2xl font-semibold">{avgGoal}%</span>
                        </button>
                      </div>
                    </div>
                  </Card>
                  <Card title="สุขภาพวันนี้" icon={<Sparkle weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    <div className="space-y-3">
                      <StatTile label="งานด่วน" value={String(urgentTodos.length)} hint="ควรจัดก่อนอย่างอื่น" tone={urgentTodos.length ? "red" : "emerald"} />
                      <StatTile label="รอคำตอบ" value={String(followUps.length)} hint="ของที่ไม่ควรหลุดมือ" tone={followUps.length ? "amber" : "emerald"} />
                      <StatTile label="ใช้ AI 7 วัน" value={(usage?.summary.totalCalls ?? 0).toLocaleString("th-TH")} hint={`${money.format(usage?.summary.totalTokens ?? 0)} tokens`} />
                    </div>
                  </Card>
                </section>

                <section className="grid gap-4 xl:grid-cols-3">
                  <Card title="คิวโฟกัส" icon={<ListChecks weight="fill" className="h-4 w-4 text-emerald-500" />} className="xl:col-span-2">
                    {todos.length === 0 && followUps.length === 0 && reminders.length === 0 ? (
                      <EmptyState title="วันนี้ดูโล่ง" hint="ถ้ามีงานใหม่ พิมพ์ใน LINE หรือเพิ่มจากหน้างานได้เลย" icon={<CheckCircle weight="fill" className="h-5 w-5" />} />
                    ) : (
                      <div className="space-y-3">
                        {[...urgentTodos, ...normalTodos].slice(0, 5).map((todo) => (
                          <div key={todo.id} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                            <button onClick={() => completeTodo(todo.id)} className="flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-zinc-400 transition hover:border-emerald-400 hover:text-emerald-500 dark:border-zinc-700" aria-label="complete todo">
                              <CheckCircle className="h-4 w-4" />
                            </button>
                            <PriorityDot p={todo.priority} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{todo.title}</p>
                              {todo.due_at && <p className="text-xs text-zinc-400">ครบกำหนด {fmtDate(todo.due_at)}</p>}
                            </div>
                          </div>
                        ))}
                        {followUps.slice(0, 3).map((item) => (
                          <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                            <Clock weight="fill" className="h-4 w-4 flex-shrink-0 text-amber-600" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{item.subject}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">{item.waiting_for ? `รอ ${item.waiting_for}` : "รอคำตอบ"}</p>
                            </div>
                          </div>
                        ))}
                        {reminders.slice(0, 3).map((reminder) => (
                          <div key={reminder.id} className="flex items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50/80 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
                            <Clock weight="fill" className="h-4 w-4 flex-shrink-0 text-sky-600" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">{reminder.message}</p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">เตือน {fmtDate(reminder.fire_at)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title="ถัดไปในเวลา" icon={<CalendarBlank weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {nextEvent ? (
                      <div className="space-y-3">
                        <p className="text-xs text-zinc-400">นัดถัดไป</p>
                        <p className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{nextEvent.summary}</p>
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">{fmtDate(nextEvent.start)}{nextEvent.location ? ` · ${nextEvent.location}` : ""}</p>
                        <button onClick={() => go("calendar")} className="rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-white transition active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-950">ดูตารางเวลา</button>
                      </div>
                    ) : (
                      <EmptyState title="ยังไม่มีนัด" hint="เชื่อม Google Calendar แล้วนัดจะขึ้นที่นี่" icon={<CalendarBlank className="h-5 w-5" />} />
                    )}
                  </Card>
                </section>
                {nextAction && (
                  <Card title="สิ่งที่ควรทำต่อ" icon={<Sparkle weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{nextAction.label}</p>
                        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{nextAction.reason}</p>
                      </div>
                      <button onClick={() => setEvidenceOpen(true)} className="min-h-11 rounded-full border border-zinc-200 px-4 text-xs font-medium text-zinc-700 dark:border-zinc-700 dark:text-zinc-200">ดูเหตุผล</button>
                    </div>
                  </Card>
                )}
                {commitments.length > 0 && (
                  <Card title={`ข้อผูกมัดที่ยังเปิดอยู่ (${commitments.length})`} icon={<ClipboardText weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">ข้อเสนออ่านอย่างเดียว: ตรวจสอบก่อนสร้างงาน เตือน หรือส่งข้อความ</p>
                    <ul className="space-y-2">
                      {commitments.slice(0, 3).map((commitment) => (
                        <li key={commitment.id} className="rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-zinc-950/45">
                          <p className="font-medium text-zinc-800 dark:text-zinc-100">{commitment.title}</p>
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{commitment.responsible_party === "owner" ? "คุณรับผิดชอบ" : `รอ ${commitment.counterparty || "อีกฝ่าย"}`}{commitment.due_at ? ` · ${fmtDate(commitment.due_at)}` : ""}</p>
                          <div className="mt-2 flex gap-2"><button type="button" onClick={() => recordRecommendation(commitment.id, "accepted")} className="min-h-11 rounded-xl px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400">รับทราบ</button><button type="button" onClick={() => recordRecommendation(commitment.id, "dismissed")} className="min-h-11 rounded-xl px-2 text-xs text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400">ไม่ใช่ตอนนี้</button></div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {decisions.length > 0 && (
                  <Card title={`การตัดสินใจที่ยังเปิดอยู่ (${decisions.length})`} icon={<Scales weight="fill" className="h-4 w-4 text-amber-500" />}>
                    <p className="mb-3 text-xs text-zinc-500 dark:text-zinc-400">ระบบบันทึกไว้เพื่อทบทวนผลลัพธ์ในภายหลัง — ไม่ส่งข้อความอัตโนมัติ</p>
                    <ul className="space-y-2">
                      {decisions.slice(0, 3).map((decision) => (
                        <li key={decision.id} className="rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-zinc-950/45">
                          <p className="font-medium text-zinc-800 dark:text-zinc-100">{decision.title}</p>
                          {decision.rationale && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{decision.rationale}</p>}
                          {decision.review_at && <p className="mt-1 text-xs text-zinc-400">ทบทวน {fmtDate(decision.review_at)}</p>}
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
                {(focusWindows.length > 0 || correctionTally.length > 0) && (
                  <Card title="ระบบปรับตัว" icon={<Sparkle weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {focusWindows.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">ช่วงโฟกัส ({focusWindows.length})</p>
                        <ul className="mt-1 space-y-1">
                          {focusWindows.slice(0, 3).map((w) => (
                            <li key={w.id} className="text-xs text-zinc-600 dark:text-zinc-300">{["อาทิตย์","จันทร์","อังคาร","พุธ","พฤหัส","ศุกร์","เสาร์"][w.day_of_week]} · {Math.floor(w.start_minute/60).toString().padStart(2,"0")}:{(w.start_minute%60).toString().padStart(2,"0")}–{Math.floor(w.end_minute/60).toString().padStart(2,"0")}:{(w.end_minute%60).toString().padStart(2,"0")} {w.enabled ? "· เปิด" : "· ปิด"}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {correctionTally.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">การแก้ของเจ้าของ ({correctionTally.reduce((s,c) => s+c.n, 0)})</p>
                        <ul className="mt-1 space-y-1">
                          {correctionTally.slice(0, 5).map((c) => (
                            <li key={c.feature} className="text-xs text-zinc-600 dark:text-zinc-300">{c.feature} · {c.n} ครั้ง</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </Card>
                )}
              </>
            )}

            {activePage === "tasks" && (
              <>
                <Card className="bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                  <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-end">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 dark:text-emerald-700">Task desk</p>
                      <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">งานต้องจัด ไม่ใช่แค่ลิสต์</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 dark:text-zinc-600">แยกด่วน ปกติ ไม่รีบ พร้อมปิดงาน ลบงาน และติดตามงานที่รอคนอื่นตอบจากหน้าเดียว</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <StatTile label="ด่วน" value={String(urgentTodos.length)} hint="priority 1" tone={urgentTodos.length ? "red" : "emerald"} />
                      <StatTile label="ปกติ" value={String(normalTodos.length)} hint="priority 2" />
                      <StatTile label="ไม่รีบ" value={String(lowTodos.length)} hint="priority 3" />
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <input
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addTodo()}
                      placeholder="เพิ่มงานใหม่ เช่น โทรหาแม่ พรุ่งนี้ 10 โมง"
                      className="min-h-12 flex-1 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-emerald-950"
                    />
                    <button onClick={addTodo} disabled={busy} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950">
                      <Plus weight="bold" className="h-4 w-4" />
                      เพิ่มงาน
                    </button>
                  </div>
                </Card>

                <div className="grid gap-4 xl:grid-cols-3">
                  {[
                    { title: "ด่วน", rows: urgentTodos, tone: "border-red-200 dark:border-red-900/60" },
                    { title: "ปกติ", rows: normalTodos, tone: "border-amber-200 dark:border-amber-900/60" },
                    { title: "ไม่รีบ", rows: lowTodos, tone: "border-zinc-200 dark:border-zinc-800" },
                  ].map((lane) => (
                    <Card key={lane.title} title={`${lane.title} (${lane.rows.length})`} className={lane.tone}>
                      {lane.rows.length === 0 ? (
                        <p className="text-sm text-zinc-400">ไม่มีงานในช่องนี้</p>
                      ) : (
                        <ul className="space-y-2">
                          {lane.rows.map((todo) => {
                            const isEditingTodo = editingTodoId === todo.id;
                            return (
                              <li key={todo.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                                {isEditingTodo ? (
                                  <div className="space-y-2">
                                    <input
                                      value={editTodoTitle}
                                      onChange={(e) => setEditTodoTitle(e.target.value)}
                                      placeholder="ชื่องาน"
                                      className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                    />
                                    <div className="flex flex-wrap gap-2">
                                      <input
                                        value={editTodoDue}
                                        onChange={(e) => setEditTodoDue(e.target.value)}
                                        placeholder="กำหนด (เช่น พรุ่งนี้ 9 โมง)"
                                        className="min-w-[160px] flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <select
                                        value={editTodoPriority}
                                        onChange={(e) => setEditTodoPriority(Number(e.target.value) as 1 | 2 | 3)}
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      >
                                        <option value={1}>ด่วน</option>
                                        <option value={2}>ปกติ</option>
                                        <option value={3}>ไม่รีบ</option>
                                      </select>
                                    </div>
                                    <div className="flex gap-2">
                                      <button onClick={() => saveTodoEdit(todo.id)} className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white active:scale-[0.98]">บันทึก</button>
                                      <button onClick={() => setEditingTodoId(null)} className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">ยกเลิก</button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-3">
                                    <button onClick={() => completeTodo(todo.id)} className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-zinc-300 text-zinc-400 transition hover:border-emerald-400 hover:text-emerald-500 dark:border-zinc-700" aria-label="complete todo">
                                      <CheckCircle className="h-4 w-4" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium leading-5 text-zinc-800 dark:text-zinc-100">{todo.title}</p>
                                      {todo.due_at && <p className="mt-1 text-xs text-zinc-400">{fmtDate(todo.due_at)}</p>}
                                    </div>
                                    <button
                                      onClick={() => {
                                        setEditingTodoId(todo.id);
                                        setEditTodoTitle(todo.title);
                                        setEditTodoDue(todo.due_at ?? "");
                                        setEditTodoPriority(todo.priority);
                                      }}
                                      className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300"
                                    >
                                      แก้
                                    </button>
                                    <button onClick={() => deleteTodo(todo.id)} className="rounded-full p-1.5 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete todo">
                                      <Trash className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </Card>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
                  <Card title={`งานรอคำตอบ (${followUps.length})`} icon={<Clock weight="fill" className="h-4 w-4 text-amber-500" />}>
                    {followUps.length === 0 ? (
                      <EmptyState title="ไม่มีงานค้างฝั่งคนอื่น" hint="ถ้าต้องรอใคร ส่งว่า 'รอคุณ A ส่งไฟล์ศุกร์นี้'" icon={<Clock className="h-5 w-5" />} />
                    ) : (
                      <ul className="space-y-2">
                        {followUps.map((item) => (
                          <li key={item.id} className="flex items-start gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                            <button onClick={() => closeFollowUp(item.id)} className="rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300">ปิด</button>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{item.subject}</p>
                              <p className="text-xs text-zinc-400">{item.waiting_for ? `รอ: ${item.waiting_for}` : "รอคำตอบ"}{item.deadline ? ` · ${fmtDate(item.deadline)}` : ""}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <CommandHint>เพิ่มงาน: “เตือนทำรายงานพรุ่งนี้ 9 โมง” · แก้: “แก้งานที่ 2 เป็น...” · ลบ: “ลบงานที่ 2” · ติดตาม: “รอคุณ A ส่งไฟล์ศุกร์นี้”</CommandHint>
                </div>
                <Card title={`การเตือนที่ตั้งไว้ (${reminders.length})`} icon={<Clock weight="fill" className="h-4 w-4 text-sky-500" />}>
                  {reminders.length === 0 ? (
                    <EmptyState title="ยังไม่มีการเตือนที่รออยู่" hint="พิมพ์ใน LINE เช่น “เตือนโทรหาลูกค้าพรุ่งนี้ 10 โมง”" icon={<Clock className="h-5 w-5" />} />
                  ) : (
                    <ul className="space-y-2">
                      {reminders.map((reminder) => (
                        <li key={reminder.id} className="flex items-center gap-3 rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{reminder.message}</p>
                            <p className="mt-1 text-xs text-zinc-400">{fmtDate(reminder.fire_at)}</p>
                          </div>
                          <button onClick={() => cancelReminderItem(reminder.id)} className="min-h-11 rounded-full border border-red-200 px-3 text-xs font-medium text-red-600 dark:border-red-900 dark:text-red-300">ยกเลิก</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {activePage === "calendar" && (
              <>
                <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/25 dark:to-zinc-900">
                  <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Time map</p>
                      <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-4xl">ตารางเวลา 14 วัน</h1>
                      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">ดูนัดที่กำลังจะมา สถานะ Google และสรุปประชุมล่าสุด เพื่อเตรียมตัวก่อนถึงเวลา</p>
                    </div>
                    {statusData && !statusData.google.connected && (
                      <button onClick={connectGoogle} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-4 py-3 text-sm font-medium text-white transition active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-950">
                        <GoogleLogo weight="bold" className="h-4 w-4" />
                        เชื่อม Google
                      </button>
                    )}
                  </div>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <Card title="ไทม์ไลน์" icon={<CalendarBlank weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {calError ? (
                      <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/25 dark:text-amber-200">{calError}</div>
                    ) : events.length === 0 ? (
                      <EmptyState title="ยังไม่มีนัด" hint="นัดจาก Google Calendar จะขึ้นที่นี่อัตโนมัติ" icon={<CalendarBlank className="h-5 w-5" />} />
                    ) : (
                      <ol className="space-y-3">
                        {events.map((event) => (
                          <li key={event.id} className="grid gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950/45 sm:grid-cols-[120px_1fr]">
                            <div className="text-xs font-medium text-emerald-700 dark:text-emerald-300">{fmtDay(event.start)}<span className="block text-zinc-400">{fmtDate(event.start).split(" ").slice(-1)[0]}</span></div>
                            <div>
                              <p className="font-medium text-zinc-900 dark:text-zinc-100">{event.summary}</p>
                              <p className="mt-1 text-xs text-zinc-400">{event.location || "ไม่มีสถานที่"}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Card>
                  <div className="space-y-4">
                    <Card title={`สรุปประชุม (${meetings.length})`} icon={<ClipboardText weight="fill" className="h-4 w-4 text-emerald-500" />}>
                      {meetings.length === 0 ? (
                        <p className="text-sm text-zinc-400">ยังไม่มีบันทึกประชุม</p>
                      ) : (
                        <ul className="space-y-3">
                          {meetings.slice(0, 5).map((meeting) => (
                            <li key={meeting.id} className="text-sm">
                              <p className="font-medium text-zinc-800 dark:text-zinc-100">{meeting.title}</p>
                              <p className="mb-1 text-xs text-zinc-400">{fmtDate(meeting.occurred_at || meeting.created_at)}{meeting.participants?.length ? ` · ${meeting.participants.join(", ")}` : ""}</p>
                              {meeting.summary && <p className="line-clamp-4 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{meeting.summary}</p>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                    <CommandHint>ก่อนประชุมพิมพ์ “สรุปประชุมวันนี้” หรือส่งโน้ตประชุมมา แจ๋วจะจัดเก็บและดึงมาให้ในหน้าปฏิทิน</CommandHint>
                  </div>
                </div>
              </>
            )}

            {activePage === "finance" && (
              <>
                <Card className="bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                  <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 dark:text-emerald-700">Money room</p>
                      <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{money.format(expSummary?.total ?? 0)} บาท</h1>
                      <p className="mt-3 text-sm text-zinc-300 dark:text-zinc-600">ค่าใช้จ่ายเดือนนี้ · {expSummary?.count ?? 0} รายการ · subscription {subs.length} รายการ</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatTile label="รายการล่าสุด" value={String(expenses.length)} hint="แสดง 30 รายการ" />
                      <StatTile label="หมวดสูงสุด" value={categoryRows[0]?.[0] ?? "-"} hint={categoryRows[0] ? `${money.format(categoryRows[0][1])} บาท` : "ยังไม่มี"} />
                    </div>
                  </div>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <Card title="สัดส่วนหมวด" icon={<ChartBar weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {categoryRows.length === 0 ? (
                      <EmptyState title="ยังไม่มีค่าใช้จ่าย" hint="พิมพ์ใน LINE เช่น 'ซื้อกาแฟ 85' แล้วหมวดจะขึ้นที่นี่" icon={<Wallet className="h-5 w-5" />} />
                    ) : (
                      <div className="space-y-3">
                        {categoryRows.map(([cat, amount]) => (
                          <div key={cat}>
                            <div className="mb-1 flex justify-between text-sm">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">{cat}</span>
                              <span className="text-zinc-500">{money.format(amount)} บาท</span>
                            </div>
                            <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, Math.round((amount / maxCategory) * 100))}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>
                  <Card title="Subscriptions" icon={<Wallet weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {subs.length === 0 ? (
                      <p className="text-sm text-zinc-400">ยังไม่มี subscription</p>
                    ) : (
                      <ul className="space-y-2">
                        {subs.map((sub) => (
                          <li key={sub.id} className="flex items-center justify-between gap-3 rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-zinc-950/45">
                            <span className="font-medium text-zinc-800 dark:text-zinc-100">{sub.name}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-zinc-500">{money.format(sub.amount)} {sub.currency}/{sub.billing_cycle}</span>
                              <button onClick={() => cancelSubscriptionItem(sub.id)} className="rounded-full p-1 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="cancel subscription">
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                </div>

                <Card title="รายการล่าสุด" icon={<Wallet weight="fill" className="h-4 w-4 text-emerald-500" />}>
                  {expenses.length === 0 ? (
                    <p className="text-sm text-zinc-400">ยังไม่มีข้อมูล</p>
                  ) : (
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {expenses.map((expense) => (
                        <li key={expense.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-zinc-800 dark:text-zinc-100">{expense.description || expense.category}</p>
                            <p className="text-xs text-zinc-400">{expense.category} · {fmtDay(expense.expense_date)}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-zinc-950 dark:text-zinc-50">{money.format(expense.amount)} {expense.currency}</p>
                            <button onClick={() => deleteExpenseItem(expense.id)} className="rounded-full p-1 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete expense">
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </>
            )}

            {activePage === "goals" && (
              <>
                <Card className="bg-gradient-to-br from-zinc-950 to-emerald-950 text-white dark:from-zinc-100 dark:to-emerald-100 dark:text-zinc-950">
                  <div className="grid gap-4 md:grid-cols-[1fr_260px] md:items-end">
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300 dark:text-emerald-700">Goal board</p>
                      <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">{avgGoal}% เฉลี่ย</h1>
                      <p className="mt-3 max-w-2xl text-sm text-zinc-300 dark:text-zinc-600">ดูความคืบหน้ารายเป้าหมาย แยกตาม period และเห็นทันทีว่าอะไรยังไม่ขยับ</p>
                    </div>
                    <StatTile label="เป้าหมาย active" value={String(goals.length)} hint="จาก goal repo" />
                  </div>
                </Card>

                <Card title="ตั้งเป้าหมายใหม่" icon={<Plus weight="bold" className="h-4 w-4 text-emerald-500" />}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <input
                        value={newGoalTitle}
                        onChange={(e) => setNewGoalTitle(e.target.value)}
                        placeholder="เช่น อ่านหนังสือ, วิ่ง"
                        className="min-h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                    </div>
                    <input
                      value={newGoalTarget}
                      onChange={(e) => setNewGoalTarget(e.target.value)}
                      placeholder="เป้า"
                      className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:w-20"
                    />
                    <input
                      value={newGoalUnit}
                      onChange={(e) => setNewGoalUnit(e.target.value)}
                      placeholder="หน่วย"
                      className="h-11 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 sm:w-24"
                    />
                    <select
                      value={newGoalPeriod}
                      onChange={(e) => setNewGoalPeriod(e.target.value as "daily" | "weekly" | "monthly")}
                      className="h-11 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    >
                      <option value="daily">ทุกวัน</option>
                      <option value="weekly">ทุกสัปดาห์</option>
                      <option value="monthly">ทุกเดือน</option>
                    </select>
                    <button
                      onClick={() => {
                        const targetNum = Number(newGoalTarget);
                        if (newGoalTitle.trim()) {
                          createGoal({
                            title: newGoalTitle.trim(),
                            period: newGoalPeriod,
                            targetValue: Number.isFinite(targetNum) && targetNum > 0 ? targetNum : undefined,
                            unit: newGoalUnit.trim() || undefined,
                          }).then((ok) => {
                            if (ok) {
                              setNewGoalTitle("");
                              setNewGoalTarget("");
                              setNewGoalUnit("");
                            }
                          });
                        }
                      }}
                      disabled={busy || !newGoalTitle.trim()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                    >
                      <Plus weight="bold" className="h-4 w-4" />
                      เพิ่ม
                    </button>
                  </div>
                </Card>

                {goals.length === 0 ? (
                  <EmptyState title="ยังไม่มีเป้าหมาย" hint="เพิ่มเองด้านบน หรือพิมพ์ใน LINE เช่น 'ตั้งเป้าอ่านหนังสือ 20 หน้า/วัน'" icon={<Target className="h-5 w-5" />} />
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {goals.map((goal) => {
                      const pct = goalPct(goal);
                      return (
                        <Card key={goal.id}>
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <p className="text-lg font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">{goal.title}</p>
                              <p className="text-xs text-zinc-400">{goal.period}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">{pct}%</span>
                              <button onClick={() => deleteGoalItem(goal.id)} className="rounded-full p-1.5 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete goal">
                                <Trash className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <div className="mb-3 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(3, pct)}%` }} />
                          </div>
                          <div className="flex justify-between text-sm text-zinc-500 dark:text-zinc-400">
                            <span>{goal.current_value} {goal.unit ?? ""}</span>
                            <span>{goal.target_value ? `${goal.target_value} ${goal.unit ?? ""}` : "ไม่มี target"}</span>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
                <CommandHint>เพิ่มเป้า: “ตั้งเป้าวิ่ง 5 กม./วัน” · อัปเดต: “วันนี้วิ่ง 3 กม.” แจ๋วจะจับคู่กับเป้าหมายให้เอง</CommandHint>
              </>
            )}

            {activePage === "memory" && (
              <>
                <Card className="bg-zinc-950 text-white dark:bg-zinc-100 dark:text-zinc-950">
                  <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">สมองสำรองของแจ๋ว</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 dark:text-zinc-600">แยกความจำทั่วไป ประชุม journal และประวัติแชท เพื่อค้นภาพรวมชีวิตจากสิ่งที่ส่งเข้า LINE</p>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
                  <Card title={`บันทึกล่าสุด (${memories.length})`} icon={<NotePencil weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {memories.length === 0 ? (
                      <EmptyState title="ยังไม่มีบันทึก" hint="ส่งข้อความ รูป ลิงก์ หรือไฟล์ให้แจ๋วจำ แล้วจะขึ้นที่นี่" icon={<NotePencil className="h-5 w-5" />} />
                    ) : (
                      <ul className="space-y-3">
                        {memories.map((memory) => (
                          <li key={memory.id} className="rounded-2xl bg-zinc-50 p-3 text-sm dark:bg-zinc-950/45">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <span className="text-xs text-zinc-400">{fmtDate(memory.created_at)}</span>
                              {(memory.tags ?? []).slice(0, 4).map((tag) => (
                                <span key={tag} className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500 shadow-sm dark:bg-zinc-900">#{tag}</span>
                              ))}
                              <button onClick={() => deleteMemoryItem(memory.id)} className="ml-auto rounded-full p-1 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete memory">
                                <Trash className="h-3.5 w-3.5" />
                              </button>
                            </div>
                            <p className="line-clamp-4 whitespace-pre-line text-zinc-700 dark:text-zinc-300">{memory.content}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Card>
                  <div className="space-y-4">
                    <Card title="Journal" icon={<BookOpen weight="fill" className="h-4 w-4 text-emerald-500" />}>
                      {journal.length === 0 ? (
                        <p className="text-sm text-zinc-400">ยังไม่มี journal</p>
                      ) : (
                        <ul className="space-y-3">
                          {journal.map((entry) => (
                            <li key={entry.id} className="text-sm">
                              <p className="mb-1 text-xs text-zinc-400">{entry.entry_date}</p>
                              <p className="line-clamp-4 text-zinc-700 dark:text-zinc-300">{entry.content}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                    <Card title="แชทล่าสุด" icon={<ChatCircleDots weight="fill" className="h-4 w-4 text-emerald-500" />}>
                      {messages.length === 0 ? (
                        <p className="text-sm text-zinc-400">ยังไม่มีประวัติ</p>
                      ) : (
                        <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
                          {messages.slice().reverse().map((message) => (
                            <li key={message.id} className="rounded-2xl bg-zinc-50 p-3 text-xs dark:bg-zinc-950/45">
                              <span className={`font-semibold ${message.role === "user" ? "text-zinc-950 dark:text-zinc-50" : "text-emerald-600 dark:text-emerald-300"}`}>{message.role === "user" ? "คุณ" : "แจ๋ว"}: </span>
                              <span className="text-zinc-500">{message.content.slice(0, 180)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                </div>
              </>
            )}

            {activePage === "knowledge" && (
              <>
                <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/25 dark:to-zinc-900">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Knowledge base</p>
                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-4xl">สิ่งที่แจ๋วรู้จักคุณเป็นการถาวร</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">ข้อเท็จจริงที่ใส่เข้าทุกการตอบ (priority 1-2) หรือค้นเจอตอนเกี่ยวข้อง (priority 3) เช่น ชื่อ อาชีพ คนสำคัญ ความชอบ และคำสั่งประจำ</p>
                  </div>
                </Card>

                <Card title="เพิ่มข้อมูลถาวร" icon={<Plus weight="bold" className="h-4 w-4 text-emerald-500" />}>
                  <div className="flex flex-col gap-3">
                    <div className="grid gap-2 sm:grid-cols-[140px_1fr_100px]">
                      <select
                        value={newKbCategory}
                        onChange={(e) => setNewKbCategory(e.target.value as Knowledge["category"])}
                        className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        {KB_CATEGORY_ROWS.map(([cat, label]) => (
                          <option key={cat} value={cat}>{label}</option>
                        ))}
                      </select>
                      <input
                        value={newKbKey}
                        onChange={(e) => setNewKbKey(e.target.value)}
                        placeholder="หัวข้อ เช่น ชื่อ, อาชีพ, เวลานัด"
                        className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      />
                      <select
                        value={newKbPriority}
                        onChange={(e) => setNewKbPriority(Number(e.target.value) as 1 | 2 | 3)}
                        className="min-h-11 rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value={1}>ด่วน ใส่ทุกครั้ง</option>
                        <option value={2}>ปกติ</option>
                        <option value={3}>ค้นเท่านั้น</option>
                      </select>
                    </div>
                    <textarea
                      value={newKbValue}
                      onChange={(e) => setNewKbValue(e.target.value)}
                      placeholder="รายละเอียด"
                      rows={2}
                      className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                    />
                    <button
                      onClick={() => {
                        if (newKbKey.trim() && newKbValue.trim()) {
                          createKnowledge({ category: newKbCategory, key: newKbKey.trim(), value: newKbValue.trim(), priority: newKbPriority }).then((ok) => {
                            if (ok) {
                              setNewKbKey("");
                              setNewKbValue("");
                            }
                          });
                        }
                      }}
                      disabled={busy || !newKbKey.trim() || !newKbValue.trim()}
                      className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                    >
                      <Plus weight="bold" className="h-4 w-4" />
                      เพิ่ม
                    </button>
                  </div>
                </Card>

                {knowledge.length === 0 ? (
                  <Card title="ยังไม่มีข้อมูลถาวร" icon={<Brain weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    <EmptyState title="สอนให้แจ๋วรู้จักคุณ" hint="เพิ่มเองด้านบน หรือส่งใน LINE ว่า “จดไว้ว่าชื่อ...” “จำไว้ว่าฉันชอบ...” แล้วข้อมูลจะขึ้นที่นี่" icon={<Brain className="h-5 w-5" />} />
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {KB_CATEGORY_ROWS.map(([cat, label]) => {
                      const rows = knowledge.filter((k) => k.category === cat);
                      if (rows.length === 0) return null;
                      return (
                        <Card key={cat} title={`${label} (${rows.length})`} icon={<Brain weight="fill" className="h-4 w-4 text-emerald-500" />}>
                          <ul className="space-y-2">
                            {rows.map((k) => {
                              const isEditing = editingKbId === k.id;
                              return (
                                <li key={k.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <input
                                        value={editKbKey}
                                        onChange={(e) => setEditKbKey(e.target.value)}
                                        placeholder="หัวข้อ"
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <textarea
                                        value={editKbValue}
                                        onChange={(e) => setEditKbValue(e.target.value)}
                                        rows={2}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => {
                                            saveKnowledgeEdit(k.id, { key: editKbKey.trim() || k.key, value: editKbValue.trim() || k.value });
                                            setEditingKbId(null);
                                          }}
                                          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white active:scale-[0.98]"
                                        >
                                          บันทึก
                                        </button>
                                        <button onClick={() => setEditingKbId(null)} className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                                          ยกเลิก
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start gap-3">
                                      <PriorityDot p={k.priority} />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{k.key}</p>
                                          {k.source !== "user" && (
                                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">{k.source}</span>
                                          )}
                                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500 shadow-sm dark:bg-zinc-900">
                                            {k.priority === 1 ? "ใส่ทุกครั้ง" : k.priority === 3 ? "ค้นเท่านั้น" : "ปกติ"}
                                          </span>
                                        </div>
                                        <p className="mt-1 whitespace-pre-line text-sm text-zinc-600 dark:text-zinc-300">{k.value}</p>
                                        <p className="mt-1 text-[10px] text-zinc-400">อัปเดต {fmtDate(k.updated_at)}</p>
                                      </div>
                                      <div className="flex flex-shrink-0 flex-col gap-1">
                                        <button
                                          onClick={() => setKnowledgePriority(k.id, ((k.priority % 3) + 1) as 1 | 2 | 3)}
                                          className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300"
                                          title="สลับระดับ priority"
                                        >
                                          P{k.priority}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingKbId(k.id);
                                            setEditKbKey(k.key);
                                            setEditKbValue(k.value);
                                          }}
                                          className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300"
                                        >
                                          แก้
                                        </button>
                                        <button onClick={() => deleteKnowledgeItem(k.id)} className="rounded-full p-1.5 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete knowledge">
                                          <Trash className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </Card>
                      );
                    })}
                    <CommandHint>เพิ่ม: “จดไว้ว่าฉันชอบดื่มกาแฟดำ” · ถาม: “มีอะไรจำไว้บ้าง” · ลบ: “ลืมข้อ 2” หรือแก้ priority และลบได้ที่นี่</CommandHint>
                  </div>
                )}
              </>
            )}

            {activePage === "people" && (
              <>
                <Card className="bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-950/25 dark:to-zinc-900">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">Relationships</p>
                    <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50 md:text-4xl">คนที่แจ๋วรู้จัก</h1>
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">ระดับความสำคัญ (P1-P4) ใช้ตอนแจ๋วตัดสินใจจัดลำดับ follow-up, เตือน และเตรียมประชุม — ยิ่ง P ต่ำยิ่งสำคัญ</p>
                  </div>
                </Card>

                <Card title="เพิ่มคน" icon={<Plus weight="bold" className="h-4 w-4 text-emerald-500" />}>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-xs text-zinc-400">ชื่อ</label>
                      <input
                        value={newPersonName}
                        onChange={(e) => setNewPersonName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newPersonName.trim()) {
                            createPerson({ name: newPersonName, tier: newPersonTier });
                            setNewPersonName("");
                          }
                        }}
                        placeholder="เช่น คุณแม่, John, หัวหน้า"
                        className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-4 text-sm outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:ring-emerald-950"
                      />
                    </div>
                    <div className="sm:w-32">
                      <label className="mb-1 block text-xs text-zinc-400">ระดับ</label>
                      <select
                        value={newPersonTier}
                        onChange={(e) => setNewPersonTier(Number(e.target.value) as 1 | 2 | 3 | 4)}
                        className="min-h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        <option value={1}>P1 สำคัญที่สุด</option>
                        <option value={2}>P2 สัมพันธ์สำคัญ</option>
                        <option value={3}>P3 ทั่วไป</option>
                        <option value={4}>P4 ภายนอก/เย็น</option>
                      </select>
                    </div>
                    <button
                      onClick={() => {
                        if (newPersonName.trim()) {
                          createPerson({ name: newPersonName, tier: newPersonTier }).then((ok) => {
                            if (ok) setNewPersonName("");
                          });
                        }
                      }}
                      disabled={busy || !newPersonName.trim()}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-zinc-950 px-5 text-sm font-medium text-white transition active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950"
                    >
                      <Plus weight="bold" className="h-4 w-4" />
                      เพิ่ม
                    </button>
                  </div>
                </Card>

                {people.length === 0 ? (
                  <Card title="ยังไม่มีคนในระบบ" icon={<Users weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    <EmptyState title="แจ๋วยังไม่รู้จักใคร" hint="เพิ่มเองด้านบน หรือพูดคุยใน LINE แล้วแจ๋วจะจดชื่อคนให้" icon={<Users className="h-5 w-5" />} />
                  </Card>
                ) : (
                  <div className="grid gap-4">
                    {TIER_ROWS.map(([tier, label]) => {
                      const rows = people.filter((p) => (p.tier ?? 3) === tier);
                      if (rows.length === 0) return null;
                      return (
                        <Card key={tier} title={`${label} (${rows.length})`} icon={<Users weight="fill" className="h-4 w-4 text-emerald-500" />}>
                          <ul className="space-y-2">
                            {rows.map((p) => {
                              const isEditing = editingPersonId === p.id;
                              const noteText = typeof p.notes?.note === "string" ? (p.notes.note as string) : "";
                              return (
                                <li key={p.id} className="rounded-2xl bg-zinc-50 p-3 dark:bg-zinc-950/45">
                                  {isEditing ? (
                                    <div className="space-y-2">
                                      <input
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="ชื่อ"
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <input
                                        value={editAliases}
                                        onChange={(e) => setEditAliases(e.target.value)}
                                        placeholder="ชื่อเล่น/อีกชื่อ (คั่นด้วยจุลภาค)"
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <input
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        placeholder="โน้ต (เช่น เกิด 15 ม.ค., เป็น CEO บริษัท X)"
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => {
                                            savePersonEdit(p.id, {
                                              name: editName.trim() || p.name,
                                              aliases: editAliases.split(",").map((a) => a.trim()).filter(Boolean),
                                              notesText: editNotes,
                                            });
                                            setEditingPersonId(null);
                                          }}
                                          className="rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white active:scale-[0.98]"
                                        >
                                          บันทึก
                                        </button>
                                        <button onClick={() => setEditingPersonId(null)} className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-zinc-600 shadow-sm dark:bg-zinc-900 dark:text-zinc-300">
                                          ยกเลิก
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="flex items-start gap-3">
                                      <span className={`mt-1 inline-block h-2 w-2 flex-shrink-0 rounded-full ${tier === 1 ? "bg-red-500" : tier === 2 ? "bg-amber-500" : tier === 4 ? "bg-zinc-300 dark:bg-zinc-600" : "bg-emerald-500"}`} />
                                      <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{p.name}</p>
                                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-zinc-500 shadow-sm dark:bg-zinc-900">P{tier}</span>
                                        </div>
                                        {p.aliases && p.aliases.length > 0 && (
                                          <p className="mt-0.5 text-xs text-zinc-400">เรียก: {p.aliases.join(", ")}</p>
                                        )}
                                        {noteText && <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{noteText}</p>}
                                      </div>
                                      <div className="flex flex-shrink-0 flex-col gap-1">
                                        <button
                                          onClick={() => cyclePersonTier(p.id)}
                                          className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300"
                                          title="สลับระดับ"
                                        >
                                          P{tier}
                                        </button>
                                        <button
                                          onClick={() => {
                                            setEditingPersonId(p.id);
                                            setEditName(p.name);
                                            setEditAliases(p.aliases.join(", "));
                                            setEditNotes(noteText);
                                          }}
                                          className="rounded-full bg-white px-2 py-1 text-[10px] font-medium text-zinc-600 shadow-sm transition active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300"
                                        >
                                          แก้
                                        </button>
                                        <button onClick={() => deletePersonItem(p.id)} className="rounded-full p-1.5 text-zinc-300 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30" aria-label="delete person">
                                          <Trash className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </li>
                              );
                            })}
                          </ul>
                        </Card>
                      );
                    })}
                    <CommandHint>เพิ่ม/แก้/ลบได้ที่นี่ หรือใน LINE ว่า “ตั้ง คุณแม่ เป็น P1” · P1 สำคัญที่สุด-หัวหน้า/ครอบครัว · P4 ภายนอก/เย็น</CommandHint>
                  </div>
                )}
              </>
            )}

            {activePage === "system" && (
              <>
                <Card className="bg-gradient-to-br from-zinc-950 to-zinc-800 text-white dark:from-zinc-100 dark:to-white dark:text-zinc-950">
                  <h1 className="text-3xl font-semibold tracking-tight md:text-5xl">ระบบพร้อมแค่ไหน</h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-300 dark:text-zinc-600">ดู integration สำคัญ, Google scopes, usage provider และสัญญาณผิดปกติของ AI pool</p>
                </Card>

                <Card title="การตั้งค่า" icon={<Gear weight="fill" className="h-4 w-4 text-emerald-500" />}>
                  {settings ? (
                    <div className="space-y-4 text-sm">
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">เขตเวลา</span>
                        <input
                          className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                          value={settings.timezone}
                          onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Briefing</span>
                          <input
                            type="time"
                            className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                            value={settings.briefing_time.slice(0, 5)}
                            onChange={(e) => setSettings({ ...settings, briefing_time: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Evening</span>
                          <input
                            type="time"
                            className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                            value={settings.evening_time.slice(0, 5)}
                            onChange={(e) => setSettings({ ...settings, evening_time: e.target.value })}
                          />
                        </label>
                      </div>
                      <label className="flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={settings.quiet_hours_enabled}
                          onChange={(e) => setSettings({ ...settings, quiet_hours_enabled: e.target.checked })}
                        />
                        เปิด Quiet hours
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Quiet เริ่ม</span>
                          <input
                            type="time"
                            className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                            value={(settings.quiet_hours_start ?? "22:00").slice(0, 5)}
                            onChange={(e) => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                          />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-xs text-zinc-500">Quiet จบ</span>
                          <input
                            type="time"
                            className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                            value={(settings.quiet_hours_end ?? "07:00").slice(0, 5)}
                            onChange={(e) => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                          />
                        </label>
                      </div>
                      <label className="flex flex-col gap-1">
                        <span className="text-xs text-zinc-500">เก็บ memory/messages (วัน, 0=ตลอด)</span>
                        <input
                          type="number"
                          min={0}
                          max={3650}
                          className="min-h-11 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-700 dark:bg-zinc-950"
                          value={settings.retention_days}
                          onChange={(e) => setSettings({ ...settings, retention_days: Number(e.target.value) || 0 })}
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="min-h-11 rounded-full bg-zinc-950 px-4 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950"
                          onClick={async () => {
                            const r = await fetch("/api/dashboard/settings", {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify(settings),
                            });
                            if (r.ok) {
                              const data = (await r.json()) as { settings: UserSettingsView };
                              setSettings(data.settings);
                              setFlash({ message: "บันทึกการตั้งค่าแล้ว" });
                            } else {
                              setFlash({ message: "บันทึกการตั้งค่าไม่สำเร็จ" });
                            }
                          }}
                        >
                          บันทึก
                        </button>
                        <a
                          href="/api/dashboard/export"
                          className="inline-flex min-h-11 items-center rounded-full border border-zinc-200 px-4 text-xs font-medium dark:border-zinc-700"
                        >
                          ส่งออกข้อมูล
                        </a>
                        {statusData?.google.connected && (
                          <button
                            className="min-h-11 rounded-full border border-red-200 px-4 text-xs font-medium text-red-600 dark:border-red-900"
                            onClick={async () => {
                              if (!window.confirm("ยกเลิกการเชื่อม Google?")) return;
                              const r = await fetch("/api/dashboard/google/disconnect", { method: "POST" });
                              if (r.ok) {
                                setFlash({ message: "ยกเลิก Google แล้ว" });
                                await load();
                              }
                            }}
                          >
                            ตัดการเชื่อม Google
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-zinc-400">โหลดการตั้งค่าไม่สำเร็จ</p>
                  )}
                </Card>

                <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
                  <Card title="Integration" icon={<Gear weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {statusData ? (
                      <>
                        <div className="mb-4 flex flex-wrap gap-2">
                          <Pill ok={statusData.status.hasLine} label="LINE" />
                          <Pill ok={statusData.status.hasSupabase} label="Database" />
                          <Pill ok={statusData.status.hasQStash} label="QStash" />
                          <Pill ok={statusData.status.hasWebSearch} label="Web search" />
                          <Pill ok={statusData.status.hasLiff} label="LIFF" />
                        </div>
                        <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-950/45">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">Google Calendar + Gmail</p>
                              <p className="text-xs text-zinc-400">{statusData.google.connected ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อม"}</p>
                            </div>
                            {!statusData.google.connected && (
                              <button onClick={connectGoogle} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-zinc-950 px-3 py-2 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950">
                                <GoogleLogo weight="bold" className="h-3.5 w-3.5" />
                                เชื่อม
                              </button>
                            )}
                          </div>
                          {statusData.google.connected && (
                            <p className="mt-2 text-xs text-zinc-400">{statusData.google.hasCalendar ? "Calendar" : ""}{statusData.google.hasCalendar && statusData.google.hasGmail ? " · " : ""}{statusData.google.hasGmail ? "Gmail" : ""}</p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-zinc-400">โหลดสถานะไม่สำเร็จ</p>
                    )}
                  </Card>
                  <Card title="AI usage 7 วัน" icon={<ChartBar weight="fill" className="h-4 w-4 text-emerald-500" />}>
                    {!usage || usage.error || usage.summary.totalCalls === 0 ? (
                      <EmptyState title="ยังไม่มี usage" hint="เมื่อมีการเรียก LLM จะเห็น provider และ token ที่นี่" icon={<ChartBar className="h-5 w-5" />} />
                    ) : (
                      <div className="space-y-4">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <StatTile label="calls" value={usage.summary.totalCalls.toLocaleString("th-TH")} hint="7 วันล่าสุด" />
                          <StatTile label="tokens" value={money.format(usage.summary.totalTokens)} hint="รวมทุก provider" />
                        </div>
                        <div className="space-y-3">
                          {providerRows.map(([provider, stat]) => (
                            <div key={provider}>
                              <div className="mb-1 flex justify-between text-sm">
                                <span className="font-medium text-zinc-800 dark:text-zinc-100">{provider}</span>
                                <span className="text-zinc-500">{stat.calls} calls · ~{stat.avgElapsedMs}ms</span>
                              </div>
                              <div className="h-2 rounded-full bg-zinc-100 dark:bg-zinc-800">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(4, Math.round((stat.totalTokens / maxProviderTokens) * 100))}%` }} />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
                {usage?.recent && usage.recent.length > 0 && (
                  <Card title="Recent model calls" icon={<WarningCircle weight="fill" className="h-4 w-4 text-zinc-400" />}>
                    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {usage.recent.slice(0, 12).map((row, index) => (
                        <li key={`${row.provider}-${row.model}-${row.created_at}-${index}`} className="flex items-center justify-between gap-3 py-3 text-xs">
                          <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">{row.provider} · {row.model}</span>
                          <span className="flex-shrink-0 text-zinc-400">{money.format(row.total_tokens)} tokens · {fmtDate(row.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/90 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 lg:hidden" aria-label="เมนูหลัก">
        <div className="mx-auto grid max-w-2xl grid-cols-4 gap-1">
          {DESTINATIONS.map((d) => {
            const active = d.id === destOfPage(activePage);
            return (
              <button
                key={d.id}
                onClick={() => go(d.tabs[0])}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 py-2 text-[11px] font-medium transition active:scale-[0.96] ${active ? "bg-zinc-950 text-white dark:bg-zinc-50 dark:text-zinc-950" : "text-zinc-500"}`}
              >
                {d.icon("h-5 w-5")}
                {d.short}
              </button>
            );
          })}
        </div>
      </nav>

      {evidenceOpen && nextAction && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/35 p-3 sm:items-center sm:justify-center" role="presentation" onClick={() => setEvidenceOpen(false)}>
          <section className="w-full max-w-md rounded-[1.6rem] bg-white p-5 shadow-2xl dark:bg-zinc-900" role="dialog" aria-modal="true" aria-label="เหตุผลและข้อมูลสนับสนุน" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-300">Why this action</p>
                <h2 className="mt-1 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{nextAction.label}</h2>
              </div>
              <button onClick={() => setEvidenceOpen(false)} className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-zinc-500" aria-label="ปิดเหตุผล"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-4 rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-zinc-950/50 dark:text-zinc-300">
              <p>{nextAction.evidence}</p>
              {nextAction.due && <p className="mt-2 text-xs text-zinc-500">กำหนดเวลา: {fmtDate(nextAction.due)}</p>}
            </div>
            <button onClick={() => go("tasks")} className="mt-4 min-h-11 rounded-full bg-zinc-950 px-4 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950">เปิดรายการที่เกี่ยวข้อง</button>
          </section>
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-30 flex justify-center px-4 lg:bottom-6" aria-live="polite" aria-atomic="true">
        {flash && (
          <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
            <span className="text-zinc-800 dark:text-zinc-100">{flash.message}</span>
            {flash.undoId && (
              <button onClick={undoLast} className="min-h-11 rounded-full bg-zinc-950 px-3 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-950">
                เลิกทำ
              </button>
            )}
            <button onClick={() => setFlash(null)} className="min-h-11 px-2 text-xs text-zinc-400" aria-label="ปิดการแจ้งเตือน">
              ปิด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
