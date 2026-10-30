// Yard app end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100) on the
// local dev database with the local seed (Test Office One, PIN 1234, on the crew list), TEAM_LINK_KEY
// set (TEAM_KEY below must match it), FILE_STORAGE=local and test job 12 at Approved.
// The office sets up a fake van (ZZ…Y), two items, a material and a load-up sheet on job 12; the yard
// loads it, takes plant back in, reports plant, returns materials and counts stock; the office
// confirms. Then everything it made is removed (a loaded sheet stays; the local clean-up removes it).
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
const tablet = await (await browser.newContext({ viewport: { width: 820, height: 1180 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
for (const p of [page, tablet]) p.on("dialog", async (d) => { popups++; await d.dismiss(); });
const drawer = page.getByRole("dialog").first();
const rows = page.locator("tbody tr");
const attention = page.getByRole("complementary", { name: "Needs attention" });
const list = page.getByTestId("equipment-list");

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
async function assetStatus(tag) {
  await page.goto(`${BASE}/equipment`);
  await page.getByLabel("Search the list").fill(tag);
  return (await list.locator("tbody tr").filter({ hasText: tag }).first().innerText()).replace(/\s+/g, " ");
}
// The yard: home, then a section.
async function yard(section) {
  await tablet.goto(`${BASE}/yard?k=${encodeURIComponent(KEY)}`);
  await tablet.getByRole("button", { name: new RegExp(`^${section}`) }).click();
}
async function yardDone() {
  const s = tablet.getByRole("status");
  await s.waitFor();
  return s.innerText();
}
// Opens the newest tool report for an item on the office's Equipment page and confirms it.
async function confirmReport(tag) {
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Tool reports/ }).click();
  await page.getByLabel("Search the list").fill(tag);
  await list.locator("tbody tr").filter({ hasText: tag }).filter({ hasText: "New" }).first().click();
  const box = drawer.getByTestId("confirm-status");
  const shown = await seen(box);
  if (shown) {
    await box.getByRole("button", { name: /^Confirm: mark/ }).click();
    await drawer.getByText(/Equipment updated: confirmed by Test Office One/).waitFor();
  }
  await drawer.getByRole("button", { name: "Delete this tool report" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  return shown;
}

try {
  // The link key is required.
  await tablet.goto(`${BASE}/yard?k=wrong-key-wrong-key`);
  check("the yard needs the link key", await seen(tablet.getByText("Ask the office for the yard link.")));

  // Office set-up.
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
  // A load-up sheet on job 12: the breaker and 2 bags, sent to the crew.
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

  // Yard: load it.
  await yard("Load-ups");
  await tablet.getByRole("button", { name: new RegExp(REG) }).click();
  const load = tablet.getByTestId("load-screen");
  await load.waitFor();
  check("loading needs a name first", await load.getByRole("button", { name: "Mark as loaded" }).isDisabled());
  await tablet.getByLabel("Your name").selectOption(ME);
  await load.getByLabel(`Loaded: ${TAG1} ${KIT1}`, { exact: true }).check();
  await load.getByLabel(`Loaded: ${SAND}`, { exact: true }).check();
  await shot(tablet, "01-yard-load");
  await load.getByRole("button", { name: "Mark as loaded" }).dblclick();
  check("the yard loads the sheet", (await yardDone()).includes("Loaded"));
  await tablet.goto(`${BASE}/yard?k=${encodeURIComponent(KEY)}`);
  await tablet.getByRole("button", { name: /^Load-ups/ }).click();
  check("a sheet loaded today shows as Loaded", await seen(tablet.getByRole("button", { name: new RegExp(REG) }).filter({ hasText: "Loaded" })));

  // Yard: plant back in.
  await yard("Plant back in");
  await tablet.getByLabel("Search").fill(TAG1);
  check("plant out on a job is listed", await seen(tablet.getByTestId("plant-out").getByText(`${TAG1} ${KIT1}`)));
  check("the name isn't remembered from the last action", (await tablet.getByLabel("Your name").inputValue()) === "");
  check("Back in needs a name first", await tablet.getByRole("button", { name: `Back in: ${TAG1} ${KIT1}` }).isDisabled());
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByRole("button", { name: `Back in: ${TAG1} ${KIT1}` }).click();
  check("plant back in", (await yardDone()).includes("Returned"));
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Returned/ }).click();
  await page.getByLabel("Search plant").fill(TAG1);
  check("the job's Plant page shows it returned to the warehouse", (await rows.filter({ hasText: TAG1 }).filter({ hasText: "CBS Warehouse" }).count()) === 1);
  await rows.filter({ hasText: TAG1 }).first().click();
  await drawer.getByRole("button", { name: "Remove this booking" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Remove booking" }).click();
  await drawer.waitFor({ state: "detached" });

  // Yard: report the breaker faulty. The office confirms it before the status changes.
  await yard("Report plant");
  await tablet.getByLabel("Your name").selectOption(ME);
  await pickOption(tablet, "Which item?", new RegExp(TAG1));
  await tablet.getByRole("button", { name: "Send to the office" }).click();
  check("faulty needs a note", await seen(tablet.getByRole("alert").filter({ hasText: "Say what's wrong with it." })));
  await tablet.getByLabel("What's wrong with it?").fill("ZZ chuck jammed");
  await tablet.getByRole("button", { name: "Send to the office" }).click();
  check("report sent to the office", (await yardDone()).includes("to confirm"));
  check("the breaker stays In service until the office confirms", (await assetStatus(TAG1)).includes("In service"));
  check("the office confirms the report", await confirmReport(TAG1));
  check("confirmed: Needs repair", (await assetStatus(TAG1)).includes("Needs repair"));

  // Missing, then found.
  await yard("Report plant");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.locator("label").filter({ hasText: /^Missing$/ }).click();
  await pickOption(tablet, "Which item?", new RegExp(TAG2));
  await tablet.getByLabel("Where was it last seen?").fill("ZZ back of the van");
  await tablet.getByRole("button", { name: "Send to the office" }).click();
  await yardDone();
  await confirmReport(TAG2);
  check("confirmed missing: Lost", (await assetStatus(TAG2)).includes("Lost"));
  await yard("Report plant");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.locator("label").filter({ hasText: /^Found$/ }).click();
  await pickOption(tablet, "Which item?", new RegExp(TAG2));
  await tablet.getByRole("button", { name: "Send to the office" }).click();
  await yardDone();
  await confirmReport(TAG2);
  const laser = await assetStatus(TAG2);
  check("confirmed found: In service at CBS Warehouse", laser.includes("In service") && laser.includes("CBS Warehouse"), laser);

  // Yard: materials returned (on the register, and not).
  await yard("Materials returned");
  await tablet.getByLabel("Your name").selectOption(ME);
  await pickOption(tablet, "From job (optional)", /^12\b/);
  await pickOption(tablet, "Material", new RegExp(SAND));
  await tablet.getByLabel(/^How many/).fill("1");
  await tablet.getByRole("button", { name: "Put back on stock" }).dblclick();
  check("returned to stock", (await yardDone()).includes("Back on stock"));
  await page.goto(`${BASE}/jobs/12/materials`);
  await page.getByLabel("Search materials").fill(SAND);
  check("job 12 used 1 bag (2 loaded, 1 back)", (await rows.filter({ hasText: SAND }).filter({ hasText: "Taken 2, returned 1" }).count()) === 1);
  await yard("Materials returned");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByLabel("Material", { exact: true }).selectOption("other");
  await tablet.getByLabel("What is it?").fill(OFFCUTS);
  await tablet.getByLabel("Unit").fill("pcs");
  await tablet.getByLabel(/^How many/).fill("3");
  await tablet.getByRole("button", { name: "Put back on stock" }).click();
  check("not on the register goes to the office", (await yardDone()).includes("add to the register"));
  await page.goto(`${BASE}/equipment`);
  const item = attention.getByRole("listitem").filter({ hasText: OFFCUTS });
  check("the office sees it under Needs attention", await seen(item));
  await item.getByRole("button").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark done" }).click();
  check("marked done", await attention.getByRole("listitem").filter({ hasText: OFFCUTS }).waitFor({ state: "detached", timeout: 8000 }).then(() => true, () => false));

  // Yard: stocktake at the warehouse.
  await yard("Stocktake");
  await tablet.getByLabel("Your name").selectOption(ME);
  await tablet.getByLabel("Search").fill(SAND);
  check("the count shows what the register says", await seen(tablet.getByTestId("count-list").getByText("Register says 9 bag")));
  await tablet.getByLabel(`Counted: ${SAND}`).fill("8");
  await shot(tablet, "02-yard-count");
  await tablet.getByRole("button", { name: /^Send 1 count/ }).click();
  check("count sent", (await yardDone()).includes("approve"));
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Stocktakes/ }).click();
  await page.getByLabel("Search the list").fill(ME);
  const st = list.locator("tbody tr").filter({ hasText: "Waiting" }).first();
  check("the stocktake waits for the office", await seen(st));
  await st.click();
  await drawer.getByRole("button", { name: "Delete this stocktake" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });

  // Clean up: items, material, van.
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
