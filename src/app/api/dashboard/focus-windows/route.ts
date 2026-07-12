import { requireSessionUser } from "@/lib/auth/require-session";
import { addFocusWindow, listFocusWindows, setFocusWindowEnabled } from "@/lib/focus/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  return Response.json({ focusWindows: await listFocusWindows(userId) });
}

export async function POST(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    typeof body.dayOfWeek !== "number" ||
    body.dayOfWeek < 0 ||
    body.dayOfWeek > 6 ||
    typeof body.startMinute !== "number" ||
    typeof body.endMinute !== "number" ||
    body.endMinute <= body.startMinute
  ) {
    return Response.json({ error: "dayOfWeek, startMinute, endMinute required" }, { status: 400 });
  }
  const window = await addFocusWindow({
    user_id: userId,
    day_of_week: body.dayOfWeek,
    start_minute: body.startMinute,
    end_minute: body.endMinute,
    label: typeof body.label === "string" ? body.label.trim() || undefined : undefined,
    priority_threshold:
      typeof body.priorityThreshold === "number" ? body.priorityThreshold : undefined,
    enabled: body.enabled === false ? false : undefined,
  });
  return Response.json({ focusWindow: window }, { status: 201 });
}

export async function PATCH(req: Request) {
  const userId = await requireSessionUser();
  if (userId instanceof Response) return userId;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.id !== "string" || typeof body.enabled !== "boolean") {
    return Response.json({ error: "id and enabled required" }, { status: 400 });
  }
  const ok = await setFocusWindowEnabled(userId, body.id, body.enabled);
  return ok ? Response.json({ ok: true }) : Response.json({ error: "not found" }, { status: 404 });
}
