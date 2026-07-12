/**
 * Browser WCAG audit using axe-core. Start the app first, then run:
 *   WCAG_URL=http://127.0.0.1:3000 npm run audit:wcag
 * Set WCAG_STORAGE_STATE to a local Playwright storage-state file to audit the
 * authenticated LIFF dashboard as well.
 */
import { chromium } from "@playwright/test";
import axe from "axe-core";

const base = (process.env.WCAG_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const storageState = process.env.WCAG_STORAGE_STATE;
const paths = (process.env.WCAG_PATHS ?? "/,/liff").split(",").map((path) => path.trim()).filter(Boolean);
const viewports = [375, 390, 430].map((width) => ({ width, height: 844 }));

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures: string[] = [];
  try {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, storageState });
      const page = await context.newPage();
      for (const path of paths) {
        const response = await page.goto(`${base}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
        if (!response?.ok()) throw new Error(`${path} returned ${response?.status() ?? "no response"}`);
        await page.evaluate(axe.source);
        const result = await page.evaluate(async () =>
          // axe is injected by the previous evaluate call.
          (globalThis as typeof globalThis & { axe: typeof axe }).axe.run(document, {
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
          }),
        );
        const prefix = `${viewport.width}px ${path}`;
        for (const violation of result.violations) {
          for (const node of violation.nodes) {
            const target = node.target.join(" ");
            failures.push(`${prefix}: ${violation.id} — ${violation.help}; target: ${target}`);
          }
        }

        // Basic keyboard smoke: Tab must reach an interactive element when one exists.
        const interactive = await page.locator("button, a[href], input, select, textarea").count();
        if (interactive > 0) {
          await page.keyboard.press("Tab");
          const focused = await page.evaluate(() => document.activeElement?.tagName ?? "");
          if (!focused || focused === "BODY") failures.push(`${prefix}: keyboard focus did not reach an interactive element`);
        }
        console.log(`PASS ${prefix}`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  if (failures.length) {
    console.error("WCAG FAILURES:\n" + failures.join("\n"));
    process.exit(1);
  }
  console.log("WCAG AA automated audit passed");
}

main().catch((error) => {
  console.error("WCAG AUDIT FAILED", error);
  process.exit(1);
});
