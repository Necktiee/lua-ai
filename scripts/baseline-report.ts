/**
 * Phase 0 baseline metrics — queries Supabase when configured, always writes a report stub.
 * Usage: npx tsx scripts/baseline-report.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { CRON_ROUTES } from "../src/lib/cron/routes";

const root = join(import.meta.dirname, "..");

function git(cmd: string): string {
  const r = spawnSync("git", cmd.split(" "), { cwd: root, encoding: "utf8", shell: true });
  return (r.stdout ?? "").trim();
}

async function headCount(
  db: SupabaseClient,
  table: string,
  filter?: { column: string; value: string | boolean | null; operator?: "eq" | "is" },
): Promise<number | null> {
  try {
    const q = db.from(table).select("*", { count: "exact", head: true });
    const result = filter
      ? filter.operator === "is"
        ? q.is(filter.column, filter.value)
        : q.eq(filter.column, filter.value)
      : q;
    const { count, error } = await result;
    if (error) {
      console.warn(`[baseline] ${table}`, error.message);
      return null;
    }
    return count ?? 0;
  } catch (e) {
    console.warn(`[baseline] ${table}`, (e as Error).message);
    return null;
  }
}

async function main() {
  const head = git("rev-parse HEAD");
  const headMsg = git("log -1 --oneline");
  const branch = git("rev-parse --abbrev-ref HEAD");
  const migCount = readdirSync(join(root, "supabase", "migrations")).filter((f) =>
    f.endsWith(".sql"),
  ).length;

  const metrics: Record<string, number | null | string> = {
    measured_at: new Date().toISOString(),
    git_sha: head,
    git_branch: branch,
    git_head: headMsg,
    local_migrations: migCount,
    intended_cron_routes: CRON_ROUTES.length,
  };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    metrics.users = await headCount(db, "users");
    metrics.memory_total = await headCount(db, "memory");
    metrics.memory_null_embedding = await headCount(db, "memory", {
      column: "embedding",
      value: null,
      operator: "is",
    });
    metrics.webhook_events = await headCount(db, "webhook_events");
    metrics.webhook_dead_letter = await headCount(db, "webhook_events", {
      column: "status",
      value: "dead_letter",
    });
    metrics.webhook_failed = await headCount(db, "webhook_events", {
      column: "status",
      value: "failed",
    });
    metrics.reminders_pending = await headCount(db, "reminders", {
      column: "fired",
      value: false,
    });
    metrics.google_token_rows = await headCount(db, "google_tokens");
  } else {
    metrics.db = "skipped (SUPABASE_URL / SERVICE_ROLE_KEY unset)";
  }

  const lines = [
    "# Hoshi Baseline Report",
    "",
    `Generated: ${metrics.measured_at}`,
    "",
    "## Freeze",
    "",
    "| Field | Value |",
    "|-------|-------|",
    `| Branch | \`${branch}\` |`,
    `| HEAD | \`${head}\` |`,
    `| Message | ${headMsg} |`,
    `| Local migrations | ${migCount} |`,
    `| Intended cron routes | ${CRON_ROUTES.length} |`,
    "",
    "## Phase-complete commit range (roadmap scaffolding)",
    "",
    "- Phase 0 start: `7ca2a04`",
    "- Phase 9 end: `4eaa104`",
    "- Phase 3 retention migration: `20260711100000_phase3_retention.sql`",
    "",
    "## DB metrics",
    "",
    "| Metric | Count |",
    "|--------|------:|",
  ];

  for (const [k, v] of Object.entries(metrics)) {
    if (
      [
        "measured_at",
        "git_sha",
        "git_branch",
        "git_head",
        "local_migrations",
        "intended_cron_routes",
        "db",
      ].includes(k)
    ) {
      continue;
    }
    lines.push(`| ${k} | ${v ?? "n/a"} |`);
  }
  if (metrics.db) lines.push(`| note | ${metrics.db} |`);

  lines.push(
    "",
    "## Latency / duplicate / orphan (manual or future probes)",
    "",
    "| Signal | Status | How to measure |",
    "|--------|--------|----------------|",
    "| p95 routine reply latency | Not measured | Sample LINE→reply timestamps from `messages` + logs |",
    "| Duplicate webhook effects | Partial | `webhook_events` unique on `webhook_event_id`; check dead_letter |",
    "| Null embeddings | See `memory_null_embedding` above | `embedding IS NULL` |",
    "| Orphan Storage objects | Not measured | List `attachments/` vs `memory.storage_path` |",
    "",
    "## External state checklist",
    "",
    "- [ ] BLOCKED: Vercel deployment = this SHA (or later)",
    "- [ ] BLOCKED until verified: `npx tsx scripts/check-migration-parity.ts` → PARITY OK",
    "- [ ] BLOCKED until verified: `npx tsx scripts/check-schedule-health.ts` → HEALTH OK",
    "- [ ] BLOCKED: LINE webhook URL = `APP_BASE_URL/api/line`",
    `- [ ] BLOCKED: QStash and GitHub Actions coverage for ${CRON_ROUTES.length} intended cron routes`,
    "",
    "## Cron routes",
    "",
  );
  for (const r of CRON_ROUTES) {
    lines.push(`- \`${r.path}\` (\`${r.cron}\`) — ${r.description}`);
  }
  lines.push("");

  const outPath = join(root, "docs", "BASELINE-REPORT.md");
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(metrics, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
