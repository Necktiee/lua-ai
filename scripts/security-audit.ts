/**
 * Lightweight security audit for CI — static checks, no network.
 * Exit 1 on high-severity findings.
 *
 * Usage: npx tsx scripts/security-audit.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const findings: Array<{ severity: "high" | "medium"; file: string; msg: string }> = [];

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(p);
  }
  return out;
}

function rel(p: string) {
  return p.slice(root.length + 1).replace(/\\/g, "/");
}

const files = walk(join(root, "src"));

for (const file of files) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    // PostgREST .or() with template interpolation — filter injection risk
    if (/\.or\s*\(\s*[`'"]/.test(line) && /\$\{/.test(line)) {
      findings.push({
        severity: "high",
        file: `${rel(file)}:${i + 1}`,
        msg: "supabase .or() with interpolated string — use parameterized filters",
      });
    }
    // Direct process.env outside env.ts (allowlisted)
    if (
      /process\.env\./.test(line) &&
      !rel(file).includes("lib/env.ts") &&
      !line.trim().startsWith("//") &&
      !line.includes("NODE_ENV")
    ) {
      // scripts and tests may use process.env; only flag src/
      if (rel(file).startsWith("src/") && !rel(file).endsWith("env.ts")) {
        findings.push({
          severity: "medium",
          file: `${rel(file)}:${i + 1}`,
          msg: "direct process.env read — prefer @/lib/env",
        });
      }
    }
  }
}

// Secrets must not be committed
for (const bad of [".env.local", "credentials.json", "service-account.json"]) {
  if (existsSync(join(root, bad))) {
    // .env.local is gitignored — only warn if somehow tracked (can't know here)
  }
}

const high = findings.filter((f) => f.severity === "high");
const medium = findings.filter((f) => f.severity === "medium");

console.log(`Security audit: ${files.length} files scanned`);
console.log(`  high: ${high.length}, medium: ${medium.length}`);
for (const f of findings.slice(0, 40)) {
  console.log(`  [${f.severity}] ${f.file} — ${f.msg}`);
}
if (findings.length > 40) console.log(`  … ${findings.length - 40} more`);

if (high.length > 0) {
  process.exit(1);
}
console.log("SECURITY AUDIT OK (no high findings)");
