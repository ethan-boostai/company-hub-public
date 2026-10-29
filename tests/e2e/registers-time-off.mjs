// Time off end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100) on the
// local dev database with the local seed (Test Office One, PIN 1234, on the crew list, without the
// Time off tick) and TEAM_LINK_KEY set (TEAM_KEY below must match it).
// Gives Test Office One the Time off tick for the test and takes it away again; fake ZZ notes only.
// Usage: TEAM_KEY=<key> node tests/e2e/registers-time-off.mjs [screenshot-dir]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const KEY = process.env.TEAM_KEY || "local-test-team-key-0123456789";
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const plus = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + n * 86_400_000));
const RUN = String(Date.now()).slice(-5);
const NOTE = `ZZ test leave ${RUN}`;

const browser = await chromium.launch();
const office = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
const team = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
for (const p of [office, team]) p.on("dialog", async (d) => { popups++; await d.dismiss(); });
const drawer = office.getByRole("dialog").first();
const list = office.getByTestId("time-off-list");
const attention = office.getByRole("complementary", { name: "Needs attention" });

async function setTick(on) {
  await office.goto(`${BASE}/people`);
  await office.getByLabel("Search the team").fill("Test Office One");
  await office.getByRole("table", { name: "Team" }).getByText("Test Office One").click();
  const box = drawer.getByLabel(/^Time off \(/);
  if ((await box.isChecked()) !== on) {
    await box.setChecked(on);
    await drawer.getByRole("button", { name: "Save" }).click();
    await office.waitForTimeout(800);
  }
  await office.getByRole("button", { name: "Close" }).first().click();
}

try {
  await office.goto(`${BASE}/sign-in?next=/people/time-off`);
  await office.getByRole("button", { name: "Test Office One" }).click();
  await office.locator("#pin").fill("1234");
  await office.getByRole("button", { name: "Sign in" }).click();
  await office.waitForURL(`${BASE}/people/time-off`);
  await setTick(false);
  await office.goto(`${BASE}/people/time-off`);
  check("without the Time off tick the tab is locked", await office.getByTestId("time-off-locked").waitFor().then(() => true, () => false));
  check("locked tab shows no time off", (await office.getByTestId("time-off-list").count()) === 0);
  const blocked = await office.request.get(`${BASE}/people/time-off/report?from=2026-01-01&to=2026-12-31`);
  check("report refused without the tick", blocked.status() === 403, String(blocked.status()));

  // Team app: ask for time off.
  await team.goto(`${BASE}/team?k=${encodeURIComponent(KEY)}`);
  await team.getByRole("button", { name: /Ask for time off/ }).click();
  await team.getByLabel("Your name").selectOption("Test Office One");
  await team.getByLabel("Type of time off").selectOption("Annual leave");
  await team.getByLabel("First day off").fill(plus(3));
  await team.getByLabel("Last day off (leave blank for one day)").fill(plus(5));
  await team.getByLabel("Notes for the office (optional)").fill(NOTE);
  await team.getByRole("button", { name: "Send request" }).dblclick();
  await team.getByRole("status").filter({ hasText: "Time off request sent to the office." }).waitFor();
  check("team app sends a time off request", true);

  // Office, with the tick.
  await setTick(true);
  await office.goto(`${BASE}/people/time-off`);
  await list.waitFor();
  check("with the tick the tab opens", true);
  check("Time off tab is current", (await office.getByRole("link", { name: "Time off" }).getAttribute("aria-current")) === "page");
  await office.getByLabel("Search time off").fill(NOTE);
  check("double tap sent it once, from the team app", (await list.locator("tbody tr").count()) === 1 && (await list.getByText("Team app").count()) === 1);
  check("starting within 7 days, it's overdue in Needs attention",
    (await attention.getByRole("region", { name: "Overdue" }).getByText("Test Office One · Annual leave").count()) >= 1);
  await shot(office, "01-waiting");

  await list.locator("tbody tr").first().click();
  await drawer.getByText(/Worked out: [\d.]+ day/).waitFor();
  check("working days worked out from the dates", true);
  await drawer.getByText("Approved", { exact: true }).click();
  await drawer.getByLabel("Office response").fill("ZZ test: fine");
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText(/Test Office One, \d/).waitFor();
  check("approving records who decided", true);
  await office.getByRole("button", { name: "Close" }).first().click();
  await office.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Who's off/ }).click();
  check("approved time off shows under Who's off", (await list.getByText("Test Office One").count()) >= 1);

  // Office adds time off over Christmas 2026: Thu 24 to Tue 29 Dec has two bank holidays (25 and 28).
  await office.getByRole("button", { name: "+ New time off", exact: true }).click();
  await drawer.getByLabel("Person").selectOption({ label: "Test Office One" });
  await drawer.getByLabel("First day off").fill("2026-12-24");
  await drawer.getByLabel("Last day off").fill("2026-12-29");
  check("bank holidays are skipped", await drawer.getByText("Worked out: 2 days (skips 2 bank holidays)").isVisible());
  await drawer.getByLabel("Notes from the team member").fill(`${NOTE} xmas`);
  await drawer.getByRole("button", { name: "Add time off" }).click();
  await drawer.getByText("Worked out (Mon–Fri, no bank holidays)").waitFor();
  check("saved with the worked-out count", await drawer.getByText("2 days", { exact: true }).first().isVisible());
  await drawer.getByLabel("Working days").fill("3");
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText("Typed by the office").waitFor();
  check("the office can change the count", true);
  await office.getByRole("button", { name: "Close" }).first().click();

  // Report.
  await office.getByRole("button", { name: "Reports", exact: true }).click();
  await office.getByRole("menuitem", { name: /^Create report/ }).click();
  await office.getByLabel("Include notes and office responses").check();
  await office.getByRole("dialog").getByRole("button", { name: "Create report" }).click();
  await office.getByRole("link", { name: "Open full screen" }).waitFor();
  const res = await office.request.get(`${BASE}${await office.getByRole("link", { name: "Open full screen" }).getAttribute("href")}`);
  check("report is a PDF", res.ok() && (res.headers()["content-type"] ?? "").includes("pdf"));
  await shot(office, "02-report");
  await office.getByRole("button", { name: "Close" }).last().click();

  // Clean up (in-app are-you-sure), then take the tick away again.
  await office.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  await office.getByLabel("Search time off").fill(NOTE);
  for (let i = 0; i < 2; i++) {
    await list.locator("tbody tr").first().click();
    await drawer.getByRole("button", { name: "Delete this time off" }).click();
    await office.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  check("time off deleted", (await list.locator("tbody tr").filter({ hasText: "Test Office One" }).count()) === 0);
  await setTick(false);
  await office.goto(`${BASE}/people/time-off`);
  check("taking the tick away locks the tab again", await office.getByTestId("time-off-locked").waitFor().then(() => true, () => false));
  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(office, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
