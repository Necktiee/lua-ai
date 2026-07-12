/**
 * POST /api/dashboard/account/delete — irreversible account wipe.
 * Body: { confirm: "DELETE" }
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { deleteAccount } from "@/lib/privacy/delete-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (body.confirm !== "DELETE") {
    return Response.json(
      { error: 'confirm must be the string "DELETE"' },
      { status: 400 },
    );
  }

  const result = await deleteAccount(userId);
  if (!result.ok) {
    return Response.json({ error: "delete failed", ...result }, { status: 500 });
  }
  return Response.json(result);
}
