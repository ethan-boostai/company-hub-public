// Load-up sheets end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100) on
// the local dev database with the local seed (Test Office One, PIN 1234), FILE_STORAGE=local and test
// job 12 at Approved. Creates a fake van (reg ZZ…U), a breaker and a material, prepares a sheet on
// job 12, sends it to the crew, loads it with a problem, then removes what it can (a loaded sheet
// stays, like any loaded sheet; the local clean-up script removes ZZ sheets).
// Usage: node tests/e2e/registers-load-up.mjs [screenshot-dir]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
// On a preview: through Vercel Authentication (bypass header) and signed in as Preview Admin.
const PREVIEW = !/localhost|127\.0\.0\.1/.test(BASE);
const ME = PREVIEW ? "Preview Admin" : "Test Office One";
const PIN = PREVIEW ? process.env.PREVIEW_ADMIN_PIN : "1234";
const HEADERS = PREVIEW ? { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "", "x-vercel-set-bypass-cookie": "true" } : {};
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const seen = (loc, ms = 8000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);

const STAMP = String(Date.now()).slice(-5);
const REG = `ZZ${STAMP}U`;
const TAG = `ZZU${STAMP}`;
const KIT = `ZZ Test Breaker ${STAMP}`;
const SAND = `ZZ Test Sand ${STAMP}`;
const BUY = `ZZ Test Screws ${STAMP}`;
const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const browser = await chromium.launch();
let popups = 0;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London", extraHTTPHeaders: HEADERS });
const page = await ctx.newPage();
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const drawer = page.getByRole("dialog").first();
const rows = page.locator("tbody tr");
const attention = page.getByRole("complementary", { name: "Needs attention" });

async function closeDrawer() {
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await drawer.waitFor({ state: "detached" });
}
async function menu(button, item) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
}
async function pickOption(scope, label, option) {
  const sel = scope.getByLabel(label, { exact: true });
  const value = await sel.evaluate((el, re) => [...el.options].find((o) => new RegExp(re).test(o.textContent))?.value ?? "", option.source ?? option);
  await sel.selectOption(value);
}
async function openSheet(text) {
  await page.getByLabel("Search load-up sheets").fill(text);
  await rows.filter({ hasText: text }).first().click();
}

try {
  await page.goto(`${BASE}/sign-in?next=/fleet`);
  await page.getByRole("button", { name: ME }).click();
  await page.locator("#pin").fill(PIN);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/fleet`);
  await page.getByRole("button", { name: "+ New vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(REG);
  await drawer.getByLabel("Make and model").fill("Ford Transit");
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  await closeDrawer();

  await page.goto(`${BASE}/equipment`);
  await menu("+ New", "Equipment");
  await drawer.getByLabel("Name").fill(KIT);
  await drawer.getByLabel("Asset tag").fill(TAG);
  await pickOption(drawer, "Where it is kept", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add equipment" }).click();
  await drawer.getByRole("heading", { name: new RegExp(TAG) }).waitFor();
  await closeDrawer();
  await menu("+ New", "Material");
  await drawer.getByLabel("Name").fill(SAND);
  await drawer.getByLabel("Unit").selectOption("bag");
  await drawer.getByLabel("Opening stock (optional)").fill("10");
  await pickOption(drawer, "Opening stock is at", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add material" }).click();
  await drawer.getByText("Stock by location").waitFor();
  await closeDrawer();

  // Job 12 > Load-up > + New load-up sheet.
  await page.goto(`${BASE}/jobs/12`);
  await page.getByRole("link", { name: "Load-up", exact: true }).click();
  await page.waitForURL(`${BASE}/jobs/12/load-up`);
  await page.getByRole("heading", { name: "Load-up sheets", level: 1 }).waitFor();
  check("Job > Load-up opens from the job menu", true);
  await page.getByRole("button", { name: "+ New load-up sheet", exact: true }).click();
  check("the date starts as today", (await drawer.getByLabel("Date", { exact: true }).inputValue()) === today);
  await pickOption(drawer, "Van", new RegExp(`\\(${REG}\\)`));
  await drawer.getByRole("button", { name: "Add equipment", exact: true }).click();
  await drawer.getByLabel("Search equipment to add").fill(TAG);
  await drawer.getByTestId("equipment-picker").getByRole("button", { name: `Add ${KIT}` }).click();
  check("added equipment shows on the sheet", (await drawer.getByTestId("sheet-equipment").getByText(`${TAG} ${KIT}`).count()) === 1);
  await drawer.getByRole("button", { name: "Add material", exact: true }).click();
  await pickOption(drawer, "Material 1", new RegExp(SAND));
  await drawer.getByLabel("Quantity 1").fill("4");
  check("stock hint: leaves 6 at the warehouse", await seen(drawer.getByText("Leaves 6 bag here.")));
  await drawer.getByLabel("Quantity 1").fill("14");
  check("stock hint: short", await seen(drawer.getByText(/Only 10 bag here \(4 short\)/)));
  await drawer.getByLabel("Quantity 1").fill("4");
  await drawer.getByRole("button", { name: "Add something to buy" }).click();
  await drawer.getByLabel("What to buy").fill(BUY);
  await drawer.getByLabel("Quantity to buy").fill("1");
  await drawer.getByLabel("Unit to buy").fill("box");
  check("PPE starts with boots, hi-vis, gloves and glasses", (await drawer.getByRole("checkbox", { name: "Safety boots" }).isChecked()) && !(await drawer.getByRole("checkbox", { name: "Harness" }).isChecked()));
  await drawer.getByLabel("Notes for the crew").fill(`ZZ test sheet ${STAMP}`);
  await shot(page, "01-new-sheet");
  await drawer.getByRole("button", { name: "Create load-up sheet" }).dblclick();
  await drawer.getByTestId("sheet-status").waitFor();
  check("a new sheet is a Draft", (await drawer.getByTestId("sheet-status").getByText("Draft", { exact: true }).count()) === 1);
  await closeDrawer();
  await page.getByLabel("Search load-up sheets").fill(TAG);
  check("double click created one sheet", (await rows.filter({ hasText: REG }).count()) === 1, String(await rows.filter({ hasText: REG }).count()));
  check("a draft for today shows under Needs attention", (await attention.getByRole("listitem").filter({ hasText: "Not sent to crew" }).count()) >= 1);

  // Send to crew: Ready to load, with a PDF.
  await openSheet(REG);
  await drawer.getByRole("button", { name: "Send to crew (ready to load)" }).click();
  check("sent to the crew", await seen(drawer.getByText("Sent to the crew: ready to load.")));
  check("status is Ready to load", (await drawer.getByTestId("sheet-status").getByText("Ready to load", { exact: true }).count()) === 1);
  await drawer.getByRole("button", { name: "Open PDF" }).click();
  check("the PDF opens in-window", await seen(page.getByRole("link", { name: "Open full screen" })));
  await page.getByRole("dialog").last().getByRole("button", { name: "Close", exact: true }).first().click();

  // Crew checklist: breaker and 4 bags loaded, screws not bought.
  await drawer.getByRole("button", { name: "Open crew checklist" }).click();
  const load = page.getByTestId("load-screen");
  await load.waitFor();
  await load.getByLabel(`Loaded: ${TAG} ${KIT}`, { exact: true }).check();
  await load.getByLabel(`Loaded: ${SAND}`, { exact: true }).check();
  await load.getByRole("button", { name: /Mark as loaded|Load and tell the office/ }).click();
  check("anything not loaded needs a reason", await seen(load.getByRole("alert").filter({ hasText: BUY })));
  await load.getByLabel(`Why not loaded: ${BUY}`, { exact: true }).selectOption({ label: "Couldn't buy it" });
  await load.getByLabel(`Note: ${BUY}`, { exact: true }).fill("ZZ shop shut");
  await shot(page, "02-load");
  await load.getByRole("button", { name: "Load and tell the office" }).dblclick();
  check("loaded with one problem", await seen(drawer.getByText("Marked as loaded. 1 problem sent to the office.")));
  check("the sheet shows what was loaded", (await drawer.getByTestId("loaded-view").getByText(/Not loaded \(Couldn't buy it: ZZ shop shut\)/).count()) === 1);
  check("problems show under Needs attention", (await attention.getByRole("listitem").filter({ hasText: "Problems" }).count()) >= 1);
  await closeDrawer();

  // Loading took 4 bags off the warehouse and booked the breaker into the van on job 12.
  await page.goto(`${BASE}/jobs/12/materials`);
  await page.getByLabel("Search materials").fill(SAND);
  check("the job's materials show 4 bags used", (await rows.filter({ hasText: SAND }).filter({ hasText: "4 bag" }).count()) === 1);
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByLabel("Search plant").fill(TAG);
  check("the breaker is on the job, in the van", (await rows.filter({ hasText: TAG }).filter({ hasText: REG }).count()) === 1);
  await page.goto(`${BASE}/equipment`);
  check("Equipment and materials shows the load-up problem", await seen(attention.getByRole("listitem").filter({ hasText: "Load-up problem" }).first()));
  await page.getByLabel("Search the list").fill(SAND);
  check("the warehouse has 6 bags left", (await page.getByTestId("equipment-list").locator("tbody tr").filter({ hasText: "6 bag" }).count()) === 1);

  // Mark problems sorted.
  await page.goto(`${BASE}/jobs/12/load-up`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Loaded/ }).click();
  await openSheet(REG);
  await drawer.getByRole("button", { name: "Mark problems sorted" }).click();
  check("problems marked sorted", await seen(drawer.getByText(new RegExp(`Problems sorted by ${ME}`))));
  check("a loaded sheet can't be deleted", (await drawer.getByRole("button", { name: "Delete this sheet" }).count()) === 0);
  await closeDrawer();

  // A draft can be deleted (with the in-app check).
  await page.getByRole("button", { name: "+ New load-up sheet", exact: true }).click();
  await drawer.getByRole("button", { name: "Add something to buy" }).click();
  await drawer.getByLabel("What to buy").fill(`${BUY} draft`);
  await drawer.getByRole("button", { name: "Create load-up sheet" }).click();
  await drawer.getByTestId("sheet-status").waitFor();
  await drawer.getByRole("button", { name: "Delete this sheet" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  await page.getByLabel("Search load-up sheets").fill(`${BUY} draft`);
  check("draft deleted", (await rows.count()) === 0 || (await page.getByText("Nothing matches.").count()) === 1);

  // Clean up: return and remove the breaker's booking, delete the breaker, the sand and the van.
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByLabel("Search plant").fill(TAG);
  await rows.filter({ hasText: TAG }).first().click();
  await drawer.getByRole("button", { name: "Back in the yard", exact: true }).click();
  await drawer.getByText(/to CBS Warehouse$/).waitFor();
  await drawer.getByRole("button", { name: "Remove this booking" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Remove booking" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.goto(`${BASE}/equipment`);
  for (const [find, name] of [[TAG, KIT], [SAND, SAND]]) {
    await page.getByLabel("Search the list").fill(find);
    await page.getByTestId("equipment-list").getByText(name).first().click();
    await drawer.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG);
  await page.getByTestId("fleet-list").getByText(REG).click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await page.getByText("Nothing matches the search.").waitFor();
  check("test equipment, material and van deleted", true);

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n")[0]);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
