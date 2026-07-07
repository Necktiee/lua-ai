/**
 * Expense repo — CRUD for expenses table + monthly summary.
 */
import { requireDb, touchUser } from "@/lib/db/client";
import { bangkokDateStr, bangkokMonthBounds, localDateStr } from "@/lib/tz";
import type { Expense } from "@/lib/types";

export async function addExpense(args: {
  userId: string;
  amount: number;
  category: string;
  description?: string;
  currency?: string;
  relatedMemoryId?: string;
  timeZone?: string;
}): Promise<Expense> {
  const db = requireDb();
  await touchUser(args.userId);
  const { data, error } = await db
    .from("expenses")
    .insert({
      user_id: args.userId,
      amount: args.amount,
      currency: args.currency ?? "THB",
      category: args.category,
      description: args.description ?? null,
      expense_date: args.timeZone ? localDateStr(new Date(), args.timeZone) : bangkokDateStr(),
      related_memory_id: args.relatedMemoryId ?? null,
    })
    .select()
    .single();
  if (error) throw new Error(`expense insert: ${error.message}`);
  return data as Expense;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  byCategory: Record<string, number>;
}

export async function summarizeExpenses(
  userId: string,
  opts?: { startDate?: string; endDate?: string },
): Promise<ExpenseSummary> {
  const db = requireDb();
  const month = bangkokMonthBounds();
  const start = opts?.startDate?.slice(0, 10) ?? month.start;
  const end = opts?.endDate?.slice(0, 10) ?? month.end;

  const { data, error } = await db
    .from("expenses")
    .select("amount, category")
    .eq("user_id", userId)
    .gte("expense_date", start)
    .lte("expense_date", end);
  if (error) console.warn("[expense] summary", error.message);

  const items = data ?? [];
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const e of items) {
    const amt = Number(e.amount);
    total += amt;
    const cat = e.category ?? "other";
    byCategory[cat] = (byCategory[cat] ?? 0) + amt;
  }
  return { total, count: items.length, byCategory };
}

export async function listExpenses(userId: string, limit = 20): Promise<Expense[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("expenses")
    .select("*")
    .eq("user_id", userId)
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) console.warn("[expense] list", error.message);
  return (data ?? []) as Expense[];
}

/** Delete an expense row. Returns false if not found. count exact, warn-not-throw. */
export async function deleteExpense(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  const { error, count } = await db
    .from("expenses")
    .delete({ count: "exact" })
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[expense] delete", error.message);
  return (count ?? 0) > 0;
}

// ============================================================
// Subscriptions
// ============================================================
import type { Subscription } from "@/lib/types";

export async function addSubscription(args: {
  userId: string;
  name: string;
  amount: number;
  billingCycle: "monthly" | "yearly" | "weekly";
  nextBilling?: string;
}): Promise<Subscription> {
  const db = requireDb();
  await touchUser(args.userId);
  // compute next billing date
  let nextBilling = args.nextBilling;
  if (!nextBilling) {
    const d = new Date();
    if (args.billingCycle === "monthly") d.setMonth(d.getMonth() + 1);
    else if (args.billingCycle === "yearly") d.setFullYear(d.getFullYear() + 1);
    else d.setDate(d.getDate() + 7);
    nextBilling = d.toISOString().slice(0, 10);
  }
  const { data, error } = await db
    .from("subscriptions")
    .insert({
      user_id: args.userId,
      name: args.name,
      amount: args.amount,
      billing_cycle: args.billingCycle,
      next_billing: nextBilling,
    })
    .select()
    .single();
  if (error) throw new Error(`subscription insert: ${error.message}`);
  return data as Subscription;
}

export async function listSubscriptions(userId: string): Promise<Subscription[]> {
  const db = requireDb();
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .order("amount", { ascending: false });
  if (error) console.warn("[subscription] list", error.message);
  return (data ?? []) as Subscription[];
}

/** Subscriptions due in next 7 days (for briefing). */
export async function getUpcomingSubscriptions(userId: string, daysAhead = 7): Promise<Subscription[]> {
  const db = requireDb();
  const cutoff = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .eq("active", true)
    .lte("next_billing", cutoff)
    .order("next_billing", { ascending: true });
  if (error) console.warn("[subscription] upcoming", error.message);
  return (data ?? []) as Subscription[];
}

/**
 * Deactivate a subscription (soft-delete: sets active=false). Hard delete would
 * break historical expense summaries, so we keep the row. Returns false if not
 * found. count exact, warn-not-throw.
 */
export async function cancelSubscription(userId: string, id: string): Promise<boolean> {
  const db = requireDb();
  const { data, error } = await db
    .from("subscriptions")
    .update({ active: false })
    .eq("user_id", userId)
    .eq("id", id)
    .eq("active", true)
    .select()
    .maybeSingle();
  if (error) {
    console.warn("[subscription] cancel", error.message);
    return false;
  }
  return data != null;
}
