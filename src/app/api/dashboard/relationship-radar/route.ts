import { requireSessionUser } from "@/lib/auth/require-session";
import { listRelationshipSignals } from "@/lib/relationship/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const signals = await listRelationshipSignals(userId);
  return Response.json({ signals });
}
