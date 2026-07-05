/**
 * Dashboard: recent meeting notes (memories tagged "meeting").
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { requireDb } from "@/lib/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  try {
    const db = requireDb();
    const { data, error } = await db
      .from("memory")
      .select("id, content, created_at, tags")
      .eq("user_id", userId)
      .contains("tags", ["meeting"])
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return Response.json({ meetings: data ?? [] });
  } catch (e) {
    return Response.json({ meetings: [], error: (e as Error).message });
  }
}
