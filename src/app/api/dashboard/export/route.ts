/**
 * GET /api/dashboard/export — download owner data as JSON (no secrets/embeddings).
 */
import { requireSessionUser } from "@/lib/auth/require-session";
import { exportUserData } from "@/lib/privacy/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;

  const payload = await exportUserData(userId);
  const body = JSON.stringify(payload, null, 2);
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="lekha-export-${userId.slice(0, 8)}.json"`,
    },
  });
}
