// Yard app end-to-end check (four tabs, as the old hub's yard page). Needs the app running
// (BASE_URL, default http://localhost:3100) on the local dev database with the local seed (Test Office
// One, PIN 1234, on the crew list), TEAM_LINK_KEY set (TEAM_KEY below must match it), FILE_STORAGE=local
// and test job 12 at Approved. The office sets up a fake van (ZZ…Y), two items, a material and a
// load-up sheet on job 12; the yard loads it, extends and returns plant, reports faulty / missing /
// found, returns materials and counts stock; the office confirms. Everything it made is removed
// afterwards (a loaded sheet stays; the local clean-up removes it).
// Usage: TEAM_KEY=<key> node tests/e2e/registers-yard.mjs [screenshot-dir]
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
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
const seen = (loc, ms = 8000) => loc.waitFor({ timeout: ms }).then(() => true, () => false);
const gone = (loc, ms = 8000) => loc.waitFor({ state: "detached", timeout: ms }).then(() => true, () => false);
const inDays = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "Europe/London" });

const STAMP = String(Date.now()).slice(-5);
const REG = `ZZ${STAMP}Y`;
const TAG1 = `ZZY${STAMP}`;
const TAG2 = `ZZX${STAMP}`;
const KIT1 = `ZZ Test Breaker ${STAMP}`;
const KIT2 = `ZZ Test Laser ${STAMP}`;
const SAND = `ZZ Test Sand ${STAMP}`;
const OFFCUTS = `ZZ Test Offcuts ${STAMP}`;
const ME = "Test Office One";

const browser = await chromium.launch();
let popups = 0;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" });
const page = await ctx.newPage();
const tablet = await (await browser.newContext({ viewport: { width: 1180, height: 820 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
for (const p of [page, tablet]) p.on("dialog", async (d) => { popups++; await d.dismiss(); });
const drawer = page.getByRole("dialog").first();
const rows = page.locator("tbody tr");
const attention = page.getByRole("complementary", { name: "Needs attention" });
const list = page.getByTestId("equipment-list");
const box = tablet.getByTestId("plant-box");

async function closeDrawer() {
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
  await drawer.waitFor({ state: "detached" });
}
async function menu(button, item) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
}
async function pickOption(scope, label, option, exact = true) {
  const sel = scope.getByLabel(label, { exact });
  const value = await sel.evaluate((el, re) => [...el.options].find((o) => new RegExp(re).test(o.textContent))?.value ?? "", option.source ?? option);
  await sel.selectOption(value);
}
async function addEquipment(name, tag) {
  await menu("+ New", "Equipment");
  await drawer.getByLabel("Name").fill(name);
  await drawer.getByLabel("Asset tag").fill(tag);
  await pickOption(drawer, "Where it is kept", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add equipment" }).click();
  await drawer.getByRole("heading", { name: new RegExp(tag) }).waitFor();
  await closeDrawer();
}
async function assetRow(tag) {
  await page.goto(`${BASE}/equipment`);
  await page.getByLabel("Search the list").fill(tag);
  return (await list.locator("tbody tr").filter({ hasText: tag }).first().innerText()).replace(/\s+/g, " ");
}
async function bookToJob12(tag) {
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByRole("button", { name: "+ Book plant", exact: true }).click();
  await drawer.getByLabel("Search equipment to book").fill(tag);
  await drawer.getByTestId("book-items").getByLabel(new RegExp(tag)).check();
  await pickOption(drawer, "Out with", new RegExp(`\\(${REG}\\)`));
  await drawer.getByRole("button", { name: "Book 1 item" }).click();
  await drawer.waitFor({ state: "detached" });
}
// The yard: open, choose a tab.
async function yard(tab) {
  await tablet.goto(`${BASE}/yard?k=${encodeURIComponent(KEY)}`);
  await tablet.getByRole("navigation", { name: "Yard" }).getByRole("button", { name: new RegExp(`^${tab}`) }).click();
}
async function openPlant(tag) {
  await yard("Plant");
  await tablet.getByLabel("Search plant (name, tag, location)").fill(tag);
  await tablet.getByTestId("plant-list").getByRole("button").first().click();
  await box.waitFor();
}
// Confirms (and deletes) the newest New tool report for an item on the office's Equipment page.
async function confirmReport(tag) {
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Tool reports/ }).click();
  await page.getByLabel("Search the list").fill(tag);
  await list.locator("tbody tr").filter({ hasText: tag }).filter({ hasText: "New" }).first().click();
  const c = drawer.getByTestId("confirm-status");
  const shown = await seen(c);
  if (shown) {
    await c.getByRole("button", { name: /^Confirm: mark/ }).click();
    await drawer.getByText(/Equipment updated: confirmed by Test Office One/).waitFor();
  }
  await drawer.getByRole("button", { name: "Delete this tool report" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  return shown;
}

try {
  await tablet.goto(`${BASE}/yard?k=wrong-key-wrong-key`);
  check("the yard needs the link key", await seen(tablet.getByText("Ask the office for the yard link.")));

  // Office set-up: van, two items, 10 bags of sand, a load-up sheet for today on job 12.
  await page.goto(`${BASE}/sign-in?next=/fleet`);
  await page.getByRole("button", { name: ME }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/fleet`);
  await page.getByRole("button", { name: "+ New vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(REG);
  await drawer.getByLabel("Make and model").fill("Ford Transit");
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  await closeDrawer();
  await page.goto(`${BASE}/equipment`);
  await addEquipment(KIT1, TAG1);
  await addEquipment(KIT2, TAG2);
  await menu("+ New", "Material");
  await drawer.getByLabel("Name").fill(SAND);
  await drawer.getByLabel("Unit").selectOption("bag");
  await drawer.getByLabel("Opening stock (optional)").fill("10");
  await pickOption(drawer, "Opening stock is at", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add material" }).click();
  await drawer.getByText("Stock by location").waitFor();
  await closeDrawer();
  await page.goto(`${BASE}/jobs/12/load-up`);
  await page.getByRole("button", { name: "+ New load-up sheet", exact: true }).click();
  await pickOption(drawer, "Van", new RegExp(`\\(${REG}\\)`));
  await drawer.getByRole("button", { name: "Add equipment", exact: true }).click();
  await drawer.getByLabel("Search equipment to add").fill(TAG1);
  await drawer.getByTestId("equipment-picker").getByRole("button", { name: `Add ${KIT1}` }).click();
  await drawer.getByRole("button", { name: "Add material", exact: true }).click();
  await pickOption(drawer, "Material 1", new RegExp(SAND));
  await drawer.getByLabel("Quantity 1").fill("2");
  await drawer.getByRole("button", { name: "Create load-up sheet" }).click();
  await drawer.getByTestId("sheet-status").waitFor();
  await drawer.getByRole("button", { name: "Send to crew (ready to load)" }).click();
  await drawer.getByText("Sent to the crew: ready to load.").waitFor();
  await closeDrawer();

  // Load-ups tab: day columns; the sheet is under Today. Load it.
  await yard("Load-ups");
  const tabs = await tablet.getByRole("navigation", { name: "Yard" }).getByRole("button").allInnerTexts();
  check("four tabs: Load-ups, Deliveries, Plant, Stock", ["Load-ups", "Deliveries", "Plant", "Stock"].every((t, i) => (tabs[i] ?? "").startsWith(t)), tabs.join(" | "));
  check("auto refresh is shown", await seen(tablet.getByText(/Refreshes every minute\./)));
  const loadups = tablet.getByTestId("loadups");
  check("the sheet is under Today", await seen(loadups.getByRole("region", { name: "Today" }).getByRole("button", { name: new RegExp(REG) })));
  await loadups.getByRole("button", { name: new RegExp(REG) }).click();
  const load = tablet.getByTestId("load-screen");
  await load.waitFor();
  check("loading needs a name first", await load.getByRole("button", { name: "Mark as loaded" }).isDisabled());
  await tablet.getByLabel("Your name").selectOption(ME);
  await load.getByLabel(`Loaded: ${TAG1} ${KIT1}`, { exact: true }).check();
  await load.getByLabel(`Loaded: ${SAND}`, { exact: true }).check();
  await shot(tablet, "01-yard-load");
  await load.getByRole("button", { name: "Mark as loaded" }).dblclick();
  check("the yard loads the sheet", (await seen(tablet.getByRole("status").filter({ hasText: "Loaded" }))));
  check("the name is cleared after the save", (await tablet.getByLabel("Your name").inputValue()) === "");
  check("it moves to Loaded today", await seen(loadups.getByRole("region", { name: "Loaded today" }).getByRole("button", { name: new RegExp(REG) })));
  await shot(tablet, "02-yard-loadups");

  // Deliveries: the placeholder until purchase orders are in the hub.
  await yard("Deliveries");
  check("Deliveries shows the placeholder", await seen(tablet.getByTestId("deliveries-placeholder")));

  // Plant tab: the breaker is on job 12. Extend, then back in the yard.
  await openPlant(TAG1);
  check("the item shows it's out on job 12", await seen(box.getByText(/Out on job 12/)));
  check("plant actions need a name first", await box.getByRole("button", { name: "Extend" }).isDisabled());
  await tablet.getByLabel("Your name").selectOption(ME);
  await box.getByLabel("New due back").fill(inDays(10));
  await box.getByRole("button", { name: "Extend" }).click();
  check("extended", await seen(tablet.getByRole("status").filter({ hasText: "Due back" })));
  await openPlant(TAG1);
  await shot(tablet, "03-yard-plant-box");
  await tablet.getByLabel("Your name").selectOption(ME);
  await box.getByRole("button", { name: "Back in the yard" }).click();
  check("back in the yard", await seen(tablet.getByRole("status").filter({ hasText: "Back in" })));
  await yard("Plant");
  await tablet.getByLabel("Search plant (name, tag, location)").fill(TAG1);
  check("it's listed under CBS Warehouse", await seen(tablet.getByTestId("plant-list").getByRole("region", { name: "CBS Warehouse" })));
  await tablet.getByRole("group", { name: "Show" }).getByRole("button", { name: "On jobs" }).click();
  check("and no longer under On jobs", await gone(tablet.getByTestId("plant-list").getByRole("button").filter({ hasText: KIT1 })));
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Returned/ }).click();
  await page.getByLabel("Search plant").fill(TAG1);
  check("the job's Plant page shows it returned", (await rows.filter({ hasText: TAG1 }).filter({ hasText: "CBS Warehouse" }).count()) === 1);

  // Faulty: the office confirms before the status changes.
  await openPlant(TAG1);
  await tablet.getByLabel("Your name").selectOption(ME);
  await box.getByRole("button", { name: "Save" }).click();
  check("faulty needs a note", await seen(box.getByRole("alert").filter({ hasText: "Add a short note" })));
  await box.getByLabel("Note (needed)").fill("ZZ chuck jammed");
  await box.getByRole("button", { name: "Save" }).click();
  check("sent to the office", await seen(tablet.getByRole("status").filter({ hasText: "to confirm" })));
  check("still In service until the office confirms", (await assetRow(TAG1)).includes("In service"));
  check("the office confirms the report", await confirmReport(TAG1));
  check("confirmed: Needs repair", (await assetRow(TAG1)).includes("Needs repair"));

  // Found, for an item in service that's on a job: the booking closes straight away, it moves to the van.
  await bookToJob12(TAG2);
  await openPlant(TAG2);
  await tablet.getByLabel("Your name").selectOption(ME);
  const offered = await box.getByLabel("What's happened?").evaluate((el) => [...el.options].map((o) => o.value));
  check("Found is offered for an item in service", offered.includes("found") && offered.includes("faulty"), offered.join(","));
  await box.getByLabel("What's happened?").selectOption("found");
  await pickOption(box, "Where is it now?", new RegExp(`\\(${REG}\\)`));
  await box.getByRole("button", { name: "Save" }).click();
  check("found closes job 12's booking", await seen(tablet.getByRole("status").filter({ hasText: "Job 12's booking is closed" })));
  const laserNow = await assetRow(TAG2);
  check("the item is now in the van, not on a job", laserNow.includes(REG) && !laserNow.includes("On job"), laserNow);
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Returned/ }).click();
  await page.getByLabel("Search plant").fill(TAG2);
  check("the job's Plant page shows the booking closed", (await rows.filter({ hasText: TAG2 }).count()) === 1);

  // Missing, then found at the yard: the status waits for the office each time.
  await openPlant(TAG2);
  await tablet.getByLabel("Your name").selectOption(ME);
  await box.getByLabel("What's happened?").selectOption("missing");
  await box.getByLabel("Note (needed)").fill("ZZ back of the van");
  await box.getByRole("button", { name: "Save" }).click();
  await seen(tablet.getByRole("status"));
  await confirmReport(TAG2);
  check("confirmed missing: Lost", (await assetRow(TAG2)).includes("Lost"));
  await openPlant(TAG2);
  check("Found is chosen for a lost item", (await box.getByLabel("What's happened?").inputValue()) === "found");
  await tablet.getByLabel("Your name").selectOption(ME);
  await pickOption(box, "Where is it now?", /^CBS Warehouse$/);
  await box.getByRole("button", { name: "Save" }).click();
  check("the office will confirm it's back in service", await seen(tablet.getByRole("status").filter({ hasText: "confirm it's back in service" })));
  const lostNow = await assetRow(TAG2);
  check("it's at the warehouse but still Lost", lostNow.includes("CBS Warehouse") && lostNow.includes("Lost"), lostNow);
  await confirmReport(TAG2);
  check("confirmed found: In service", (await assetRow(TAG2)).includes("In service"));

  // Stock tab: materials back from a job (on the register and not), then a stock take.
  await yard("Stock");
  check("stock is listed by location and category", await seen(tablet.getByTestId("stock-list").getByText(SAND)));
  await tablet.getByRole("button", { name: "Materials back from a job" }).click();
  check("needs a name first", await seen(tablet.getByRole("alert").filter({ hasText: "Choose your name" })));
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByRole("button", { name: "Materials back from a job" }).click();
  const ret = tablet.getByRole("dialog");
  await pickOption(ret, "Material", new RegExp(SAND));
  await ret.getByLabel(/^How many/).fill("1");
  await pickOption(ret, "From job (optional)", /^12\b/);
  await ret.getByRole("button", { name: "Back in stock" }).dblclick();
  check("returned to stock", await seen(tablet.getByRole("status").filter({ hasText: "Back on stock" })));
  await page.goto(`${BASE}/jobs/12/materials`);
  await page.getByLabel("Search materials").fill(SAND);
  check("job 12 used 1 bag (2 loaded, 1 back)", (await rows.filter({ hasText: SAND }).filter({ hasText: "Taken 2, returned 1" }).count()) === 1);
  await yard("Stock");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByRole("button", { name: "Materials back from a job" }).click();
  await ret.getByLabel("Material").selectOption("other");
  await ret.getByLabel("What is it?").fill(OFFCUTS);
  await ret.getByLabel("Unit (optional)").fill("pcs");
  await ret.getByLabel(/^How many/).fill("3");
  await ret.getByRole("button", { name: "Back in stock" }).click();
  check("not on the register goes to the office", await seen(tablet.getByRole("status").filter({ hasText: "add to the register" })));
  await page.goto(`${BASE}/equipment`);
  const item = attention.getByRole("listitem").filter({ hasText: OFFCUTS });
  check("the office sees it under Needs attention", await seen(item));
  await item.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark done" }).click();
  check("marked done", await gone(attention.getByRole("listitem").filter({ hasText: OFFCUTS })));

  await yard("Stock");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByLabel("Location", { exact: true }).selectOption("p:CBS Warehouse");
  await tablet.getByRole("button", { name: "Start stock take" }).click();
  await tablet.getByLabel("Search stock (name, category)").fill(SAND);
  check("the count shows the system figure", await seen(tablet.getByTestId("stock-list").getByText("System: 9 bag")));
  await tablet.getByLabel(`Counted: ${SAND}`).fill("8");
  await shot(tablet, "04-yard-count");
  await tablet.getByRole("button", { name: "Send to office" }).click();
  check("count sent; it waits for the office", await seen(tablet.getByText(/waiting for the office to approve/).first()));
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Stocktakes/ }).click();
  await page.getByLabel("Search the list").fill(ME);
  const st = list.locator("tbody tr").filter({ hasText: "Waiting" }).first();
  check("the stocktake is on Equipment and materials", await seen(st));
  await st.click();
  await drawer.getByRole("button", { name: "Delete this stocktake" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });

  // Clean up: remove the bookings on job 12, then the items, the material and the van.
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  for (;;) {
    await page.getByLabel("Search plant").fill(STAMP);
    const r = rows.filter({ hasText: STAMP });
    if ((await r.count()) === 0) break;
    await r.first().click();
    await drawer.getByRole("button", { name: "Remove this booking" }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Remove booking" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  for (const [find, name] of [[TAG1, KIT1], [TAG2, KIT2], [SAND, SAND]]) {
    await page.getByLabel("Search the list").fill(find);
    await list.getByText(name).first().click();
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
  check("test items, material and van deleted", true);

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n")[0]);
  await shot(page, "error");
  await shot(tablet, "error-tablet");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
