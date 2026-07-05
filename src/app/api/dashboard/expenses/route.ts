/**
 * Dashboard: expenses list + monthly summary + subscriptions.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { listExpenses, summarizeExpenses, listSubscriptions } from "@/lib/expense/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const [expenses, summary, subscriptions] = await Promise.all([
    listExpenses(userId, 30),
    summarizeExpenses(userId),
    listSubscriptions(userId),
  ]);

  return Response.json({ expenses, summary, subscriptions });
}
