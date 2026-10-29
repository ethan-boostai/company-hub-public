// Sign-ons page and crew page check. Needs the app running (BASE_URL, default http://localhost:3100)
// on the local dev database with the local seed (Test Office One, PIN 1234), test job 12 at Approved,
// and TEAM_LINK_KEY set. Signing itself is checked with RAMS (safety-rams.mjs) and in the unit tests.
// Usage: node tests/e2e/safety-sign-ons.mjs [screenshot-dir]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "en-GB" })).newPage();
let popups = 0;
page.on("dialog", async (d) => { popups++; await d.dismiss(); });

try {
  await page.goto(`${BASE}/sign-in?next=/jobs/12/sign-ons`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/jobs/12/sign-ons`);
  await page.getByRole("heading", { name: "Sign-ons", level: 1 }).waitFor();
  check("Job > Sign-ons opens on job 12", true);
  check("job menu highlights Sign-ons", (await page.getByRole("navigation", { name: "Job 12 menu" }).getByRole("link", { name: "Sign-ons" }).getAttribute("aria-current")) === "page");
  check("Needs attention panel on the page", await page.getByRole("complementary", { name: "Needs attention" }).isVisible());

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Crew page link/ }).click();
  const link = await page.getByLabel("Crew page link").inputValue();
  check("crew page link is shown for job 12", /\/crew\/12\?t=[0-9a-f]{32}$/.test(link), link.replace(/t=.*/, "t=…"));
  await shot(page, "01-sign-ons");

  // The crew page opens with no sign-in, only with the right token, and only for its own job.
  const crew = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await crew.goto(link);
  await crew.getByRole("heading", { name: /^Job 12/ }).waitFor();
  check("crew page opens without signing in", true);
  check("crew page lists what to sign", await crew.getByRole("region", { name: "To sign" }).isVisible());
  await shot(crew, "02-crew");
  await crew.goto(link.replace(/t=([0-9a-f])/, (_m, c) => `t=${c === "a" ? "b" : "a"}`));
  check("a wrong token is refused", (await crew.getByText("This link isn't valid.").count()) === 1);
  await crew.goto(link.replace("/crew/12?", "/crew/13?"));
  check("job 12's token doesn't open another job", (await crew.getByText("This link isn't valid.").count()) === 1);
  const api = await crew.request.get(`${BASE}/api/crew/12/file/1?t=nope`);
  check("crew file route refuses a wrong token", api.status() === 404);

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n").slice(0, 3).join(" "));
  await shot(page, "99-error");
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
