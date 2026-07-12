/**
 * Read-only smoke gate for a Vercel preview/canary deployment.
 * Usage: CANARY_URL=https://preview.example.vercel.app npx tsx scripts/canary-smoke.ts
 */
const base = (process.env.CANARY_URL ?? "").replace(/\/$/, "");
if (!base) throw new Error("CANARY_URL is required");

const checks = [
  { path: "/", contentType: "text/html" },
  { path: "/liff", contentType: "text/html" },
  { path: "/api/health", contentType: "application/json" },
];

async function main() {
  for (const check of checks) {
    const url = `${base}${check.path}`;
    const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes(check.contentType)) {
      throw new Error(`${check.path}: expected 2xx ${check.contentType}, got ${response.status} ${contentType}`);
    }
    console.log(`PASS ${check.path} ${response.status}`);
  }
}

main().catch((error) => {
  console.error("CANARY SMOKE FAILED", error);
  process.exit(1);
});
