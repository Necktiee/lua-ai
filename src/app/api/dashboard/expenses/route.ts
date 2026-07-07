/**
 * Dashboard: expenses list + monthly summary + subscriptions.
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import {
  listExpenses,
  summarizeExpenses,
  listSubscriptions,
  deleteExpense,
  cancelSubscription,
} from "@/lib/expense/repo";

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

export async function DELETE(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind"); // "expense" (default) | "subscription"
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  const ok = kind === "subscription"
    ? await cancelSubscription(userId, id)
    : await deleteExpense(userId, id);
  if (!ok) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ ok });
}

