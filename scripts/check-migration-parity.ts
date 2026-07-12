/**
 * Compare local supabase/migrations/*.sql to cloud migration history.
 * Usage: npx tsx scripts/check-migration-parity.ts
 */
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = join(import.meta.dirname, "..");
const migDir = join(root, "supabase", "migrations");

function localMigrations(): string[] {
  if (!existsSync(migDir)) {
    console.error("missing supabase/migrations");
    process.exit(1);
  }
  return readdirSync(migDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

/** Parse `supabase migration list` table rows into { local?, remote? } versions. */
function parseListRows(stdout: string): Array<{ local: string | null; remote: string | null }> {
  const rows: Array<{ local: string | null; remote: string | null }> = [];
  for (const line of stdout.split("\n")) {
    // e.g. "   20260711100000 |                | 2026-07-11 10:00:00 "
    // or   "   20260706180000 | 20260706180000 | 2026-07-06 18:00:00 "
    if (!/\d{14}/.test(line) || !line.includes("|")) continue;
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 2) continue;
    const local = /^\d{14}$/.test(cols[0]!) ? cols[0]! : null;
    const remote = /^\d{14}$/.test(cols[1]!) ? cols[1]! : null;
    if (!local && !remote) continue;
    rows.push({ local, remote });
  }
  return rows;
}

function main() {
  const localFiles = localMigrations();
  console.log(`Local migrations (${localFiles.length}):`);
  for (const f of localFiles) console.log(`  ${f}`);

  const sb = spawnSync("npx", ["supabase", "migration", "list"], {
    cwd: root,
    encoding: "utf8",
    shell: true,
    timeout: 60_000,
  });

  if (sb.status !== 0 || !sb.stdout) {
    console.log("\nCloud check: SKIPPED (supabase CLI not linked or failed)");
    if (sb.stderr) console.log(sb.stderr.slice(0, 400));
    console.log(
      "\nTo verify parity: supabase link --project-ref <ref> && npx tsx scripts/check-migration-parity.ts",
    );
    console.log(`LOCAL_COUNT=${localFiles.length}`);
    process.exit(0);
  }

  console.log("\nsupabase migration list:\n" + sb.stdout);

  const rows = parseListRows(sb.stdout);
  const localVersions = localFiles.map((f) => f.slice(0, 14));
  const remoteOnly = rows.filter((r) => r.remote && !r.local).map((r) => r.remote!);
  const localOnly = rows.filter((r) => r.local && !r.remote).map((r) => r.local!);
  const missingFiles = localVersions.filter((v) => !rows.some((r) => r.local === v));

  if (localOnly.length || remoteOnly.length || missingFiles.length) {
    console.error("\nPARITY FAIL");
    if (localOnly.length) {
      console.error("  on local filesystem but NOT applied on remote:", localOnly.join(", "));
      console.error("  → run: supabase db push");
    }
    if (remoteOnly.length) {
      console.error("  on remote but missing locally:", remoteOnly.join(", "));
    }
    if (missingFiles.length) {
      console.error("  local files not shown in list:", missingFiles.join(", "));
    }
    process.exit(1);
  }

  console.log(`\nPARITY OK — ${localFiles.length} migrations match cloud`);
}

main();
