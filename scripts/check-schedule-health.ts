/**
 * Schedule health check — intended CRON_ROUTES vs QStash + GitHub Actions coverage.
 * Usage: npx tsx scripts/check-schedule-health.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { CRON_ROUTES } from "../src/lib/cron/routes";

async function main() {
  console.log("Intended cron routes:");
  for (const r of CRON_ROUTES) {
    console.log(`  ${r.id.padEnd(18)} ${r.cron.padEnd(14)} ${r.path}  — ${r.description}`);
  }

  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    console.log("\nQStash: SKIPPED (QSTASH_TOKEN unset)");
    console.log(`INTENDED_COUNT=${CRON_ROUTES.length}`);
    console.log("GitHub Actions .github/workflows/cron.yml should curl all paths above.");
    process.exit(0);
  }

  const res = await fetch("https://qstash.upstash.io/v2/schedules", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`QStash list failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  const schedules = (await res.json()) as Array<{
    scheduleId?: string;
    destination?: string;
    cron?: string;
  }>;

  console.log(`\nQStash schedules (${schedules.length}):`);
  for (const s of schedules) {
    console.log(`  ${(s.scheduleId ?? "?").padEnd(18)} ${(s.cron ?? "").padEnd(14)} ${s.destination ?? ""}`);
  }

  const dests = new Set(schedules.map((s) => s.destination ?? ""));
  const missing: string[] = [];
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  for (const r of CRON_ROUTES) {
    const full = base ? `${base}${r.path}` : r.path;
    const found =
      [...dests].some((d) => d.endsWith(r.path)) ||
      dests.has(full) ||
      schedules.some((s) => s.scheduleId === r.id);
    if (!found) missing.push(r.path);
  }

  if (missing.length) {
    console.error("\nMISSING schedules for:", missing.join(", "));
    console.error("Fix: POST /api/admin/setup-schedules with Authorization: Bearer $CRON_SECRET");
    process.exit(1);
  }
  console.log("\nHEALTH OK — all intended routes present in QStash");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
