#!/usr/bin/env node
// Opens a Vercel preview the way every session checks one before merging: through Vercel
// Authentication with the automation bypass, signed in as Preview Admin. Takes a screenshot.
//
// Usage: node scripts/preview-open.mjs <preview url> [path, default /jobs/12] [screenshot.png]
// Needs VERCEL_AUTOMATION_BYPASS_SECRET and PREVIEW_ADMIN_PIN in the environment (never printed).
// Previews use the dev database and the SharePoint test folder; use job 12 and fake ZZ data only.
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const [base, path = "/jobs/12", out = "preview.png"] = process.argv.slice(2);
if (!base) { console.error("Usage: node scripts/preview-open.mjs <preview url> [path] [screenshot.png]"); process.exit(1); }
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const pin = process.env.PREVIEW_ADMIN_PIN;
if (!secret || !pin) { console.error(`Missing ${!secret ? "VERCEL_AUTOMATION_BYPASS_SECRET" : "PREVIEW_ADMIN_PIN"} (set it in the environment, then start a new session).`); process.exit(1); }

const bypassHeaders = { "x-vercel-protection-bypass": secret, "x-vercel-set-bypass-cookie": "true" };

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, locale: "en-GB", extraHTTPHeaders: bypassHeaders })).newPage();
try {
  const res = await page.goto(`${base.replace(/\/+$/, "")}/sign-in?next=${encodeURIComponent(path)}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (!res || res.status() >= 400) throw new Error(`the preview answered ${res?.status()} (bypass refused or preview not ready)`);
  await page.getByRole("button", { name: "Preview Admin" }).click({ timeout: 30000 });
  await page.locator("#pin").fill(pin);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === path.split("?")[0], { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
  console.log(`Opened ${path} on the preview as Preview Admin. Screenshot: ${out}`);
} catch (e) {
  console.error(`Preview check failed: ${e.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
