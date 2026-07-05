/**
 * One-time/idempotent admin route — creates the QStash Schedules that drive
 * the 5 recurring cron routes (poll/briefing/evening/daily/meeting).
 *
 * Why this exists: Vercel Hobby plan's native Cron caps at once/day, which is
 * useless for per-user local-time briefings and reminder polling. QStash
 * Schedules give us real interval crons on the free tier (1000 msg/day cap).
 * At a 10-min tick × 5 routes × 144 ticks/day = 720 msgs/day, within budget.
 *
 * Protected by the same CRON_SECRET as other cron routes — call once after
 * deploy (or whenever the schedule set needs to change) via:
 *   POST /api/admin/setup-schedules  with header Authorization: Bearer <CRON_SECRET>
 *
 * Uses a fixed `scheduleId` per route so re-running this is idempotent
 * (QStash updates the existing schedule rather than creating duplicates).
 */
import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { authorizeCron } from "@/lib/cron/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ROUTES: Array<{ id: string; path: string; cron: string }> = [
  // Reminder poll fallback — every 5 min (catches anything QStash callback missed)
  { id: "lua-ai-poll", path: "/api/cron/poll", cron: "*/5 * * * *" },
  // Per-user local-time briefing/evening/journal/nudge — 10-min tick window
  { id: "lua-ai-briefing", path: "/api/cron/briefing", cron: "*/10 * * * *" },
  { id: "lua-ai-evening", path: "/api/cron/evening", cron: "*/10 * * * *" },
  { id: "lua-ai-daily", path: "/api/cron/daily", cron: "*/10 * * * *" },
  // Meeting prep — needs finer granularity to hit the 15-35min pre-event window
  { id: "lua-ai-meeting", path: "/api/cron/meeting", cron: "*/10 * * * *" },
];

export async function POST(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  if (!env.QSTASH_TOKEN) {
    return Response.json({ error: "QSTASH_TOKEN not configured" }, { status: 503 });
  }
  if (!env.APP_BASE_URL) {
    return Response.json({ error: "APP_BASE_URL not configured" }, { status: 503 });
  }
  if (!env.CRON_SECRET) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  const client = new Client({ token: env.QSTASH_TOKEN });
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const results: Array<{ id: string; path: string; scheduleId?: string; error?: string }> = [];

  for (const r of ROUTES) {
    try {
      const res = await client.schedules.create({
        scheduleId: r.id,
        destination: `${base}${r.path}`,
        cron: r.cron,
        method: "GET",
        headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
        retries: 2,
      });
      results.push({ id: r.id, path: r.path, scheduleId: res.scheduleId });
    } catch (e) {
      results.push({ id: r.id, path: r.path, error: (e as Error).message });
    }
  }

  return Response.json({ results });
}

/** GET = list existing schedules (for verification). */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  if (!env.QSTASH_TOKEN) {
    return Response.json({ error: "QSTASH_TOKEN not configured" }, { status: 503 });
  }
  const client = new Client({ token: env.QSTASH_TOKEN });
  const schedules = await client.schedules.list();
  return Response.json({ schedules });
}
