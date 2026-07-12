/**
 * One-time/idempotent admin route — creates the QStash Schedules that drive
 * the recurring cron routes (poll/briefing/evening/daily/meeting/weekly/email).
 *
 * Protected by CRON_SECRET. Uses fixed scheduleId per route (idempotent).
 *   POST /api/admin/setup-schedules  Authorization: Bearer <CRON_SECRET>
 *   GET  /api/admin/setup-schedules  — list + health vs intended CRON_ROUTES
 */
import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { authorizeCron } from "@/lib/cron/auth";
import { CRON_ROUTES } from "@/lib/cron/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

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

  for (const r of CRON_ROUTES) {
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

  return Response.json({ results, intended: CRON_ROUTES.length });
}

/** GET = list existing schedules + intended routes (for verification). */
export async function GET(req: Request) {
  const denied = authorizeCron(req);
  if (denied) return denied;

  if (!env.QSTASH_TOKEN) {
    return Response.json(
      { intended: CRON_ROUTES, error: "QSTASH_TOKEN not configured" },
      { status: 503 },
    );
  }
  const client = new Client({ token: env.QSTASH_TOKEN });
  const schedules = await client.schedules.list();
  const dests = schedules.map((s) => s.destination ?? "");
  const missing = CRON_ROUTES.filter(
    (r) =>
      !schedules.some((s) => s.scheduleId === r.id) &&
      !dests.some((d) => d.endsWith(r.path)),
  ).map((r) => r.path);
  return Response.json({
    intended: CRON_ROUTES,
    schedules,
    missing,
    healthy: missing.length === 0,
  });
}
