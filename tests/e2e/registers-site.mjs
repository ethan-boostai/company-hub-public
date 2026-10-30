// Site end-to-end check: plant and materials on a job. Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234)
// and test job 12 at Approved. Creates a fake van (reg ZZ…S), two items of equipment and a material,
// books them to job 12, returns them, takes and returns stock, then deletes everything it made.
// Usage: node tests/e2e/registers-site.mjs [screenshot-dir]
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
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const STAMP = String(Date.now()).slice(-5);
const REG = `ZZ${STAMP}S`;
const TAG1 = `ZZB${STAMP}`;
const TAG2 = `ZZP${STAMP}`;
const KIT1 = `ZZ Test Breaker ${STAMP}`;
const KIT2 = `ZZ Test Saw ${STAMP}`;
const SAND = `ZZ Test Sand ${STAMP}`;
const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const browser = await chromium.launch();
let popups = 0;
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" });
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
async function addEquipment(name, tag, extra) {
  await menu("+ New", "Equipment");
  await drawer.getByLabel("Name").fill(name);
  await drawer.getByLabel("Asset tag").fill(tag);
  await pickOption(drawer, "Where it is kept", /^CBS Warehouse$/);
  if (extra) await extra();
  await drawer.getByRole("button", { name: "Add equipment" }).click();
  await drawer.getByRole("heading", { name: new RegExp(tag) }).waitFor();
  await closeDrawer();
}

try {
  await page.goto(`${BASE}/sign-in?next=/fleet`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/fleet`);
  await page.getByRole("button", { name: "+ New vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(REG);
  await drawer.getByLabel("Make and model").fill("Ford Transit");
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  await closeDrawer();

  // Two items at the warehouse (one with its PAT test overdue) and 10 bags of sand at £4.50.
  await page.goto(`${BASE}/equipment`);
  await addEquipment(KIT1, TAG1);
  await addEquipment(KIT2, TAG2, () => drawer.getByLabel("PAT test due").fill(inDays(-3)));
  await menu("+ New", "Material");
  await drawer.getByLabel("Name").fill(SAND);
  await drawer.getByLabel("Unit").selectOption("bag");
  await drawer.getByLabel("Cost each (£)").fill("4.50");
  await drawer.getByLabel("Opening stock (optional)").fill("10");
  await pickOption(drawer, "Opening stock is at", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add material" }).click();
  await drawer.getByText("Stock by location").waitFor();
  await closeDrawer();

  // Job 12 > Plant.
  await page.goto(`${BASE}/jobs/12`);
  await page.getByRole("link", { name: "Plant", exact: true }).click();
  await page.waitForURL(`${BASE}/jobs/12/plant`);
  await page.getByRole("heading", { name: "Plant", level: 1 }).waitFor();
  check("Job > Plant opens from the job menu", true);

  await page.getByRole("button", { name: "+ Book plant", exact: true }).click();
  await drawer.getByLabel("Search equipment to book").fill(STAMP);
  const items = drawer.getByTestId("book-items");
  await items.getByLabel(new RegExp(TAG2)).check();
  check("an item with its PAT test overdue is flagged, not blocked", await drawer.getByRole("status").filter({ hasText: "PAT test overdue" }).isVisible());
  await items.getByLabel(new RegExp(TAG1)).check();
  await pickOption(drawer, "Out with", new RegExp(`\\(${REG}\\)`));
  await drawer.getByLabel("Due back").fill(inDays(0));
  await shot(page, "01-book");
  await drawer.getByRole("button", { name: "Book 2 items" }).dblclick();
  await drawer.waitFor({ state: "detached" });
  await page.getByLabel("Search plant").fill(STAMP);
  check("double click booked each item once", (await rows.filter({ hasText: STAMP }).count()) === 2, String(await rows.filter({ hasText: STAMP }).count()));
  check("booked items show Due back soon", (await rows.filter({ hasText: TAG1 }).filter({ hasText: "Due back soon" }).count()) === 1);
  check("due back today shows under Needs attention", (await attention.getByRole("listitem").filter({ hasText: TAG1 }).filter({ hasText: "Due back today" }).count()) === 1);
  check("went with the van", (await rows.filter({ hasText: TAG1 }).filter({ hasText: REG }).count()) === 1);

  // Booked items aren't offered again.
  await page.getByRole("button", { name: "+ Book plant", exact: true }).click();
  await drawer.getByLabel("Search equipment to book").fill(STAMP);
  check("booked items aren't offered for booking again", (await drawer.getByTestId("book-items").getByRole("checkbox").count()) === 0);
  await closeDrawer();

  // Equipment and materials shows it on the job.
  await page.goto(`${BASE}/equipment`);
  await page.getByLabel("Search the list").fill(TAG1);
  check("the register shows the item on job 12", (await page.getByTestId("equipment-list").locator("tbody tr").filter({ hasText: "On job 12" }).count()) === 1);
  check("the register's Needs attention shows it due back", (await attention.getByRole("listitem").filter({ hasText: TAG1 }).filter({ hasText: "Job 12" }).count()) === 1);
  await page.getByTestId("equipment-list").getByText(KIT1).first().click();
  check("the item's record links to the job", (await drawer.getByTestId("asset-on-job").getByRole("link", { name: "job 12" }).count()) === 1);
  await closeDrawer();

  // Return the breaker to the yard; remove the saw's booking (made by mistake).
  await page.goto(`${BASE}/jobs/12/plant`);
  await page.getByLabel("Search plant").fill(STAMP);
  await rows.filter({ hasText: TAG1 }).first().click();
  check("the booking links to the register", (await drawer.getByRole("link", { name: "Open in Equipment and materials" }).count()) === 1);
  await drawer.getByRole("button", { name: "Return", exact: true }).click();
  await drawer.getByText(/by Test Office One, to CBS Warehouse$/).waitFor();
  await closeDrawer();
  check("a returned item leaves the On job list", (await rows.filter({ hasText: TAG1 }).count()) === 0);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Returned/ }).click();
  check("and shows under Returned, back at the warehouse", (await rows.filter({ hasText: TAG1 }).filter({ hasText: "CBS Warehouse" }).count()) === 1);
  // Tidy job 12: remove the returned breaker's booking too (fake data only).
  await rows.filter({ hasText: TAG1 }).first().click();
  check("a returned booking has no Return form", (await drawer.getByRole("button", { name: "Return", exact: true }).count()) === 0);
  await drawer.getByRole("button", { name: "Remove this booking" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Remove booking" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^On job/ }).click();
  await rows.filter({ hasText: TAG2 }).first().click();
  await drawer.getByRole("button", { name: "Remove this booking" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Remove booking" }).click();
  await drawer.waitFor({ state: "detached" });
  check("removed booking is gone", (await rows.filter({ hasText: TAG2 }).count()) === 0);

  // Job 12 > Materials: take 4 bags, return 1, can't take more than there is.
  await page.getByRole("link", { name: "Materials", exact: true }).click();
  await page.waitForURL(`${BASE}/jobs/12/materials`);
  await menu("+ New", "Take stock for this job");
  await pickOption(drawer, "Material", new RegExp(SAND));
  check("shows what's in stock", await drawer.getByText("In stock: 10 at CBS Warehouse.").isVisible());
  await drawer.getByLabel(/^Quantity/).fill("4");
  await drawer.getByRole("button", { name: "Take stock" }).dblclick();
  await drawer.waitFor({ state: "detached" });
  await menu("+ New", "Return stock from this job");
  await pickOption(drawer, "Material", new RegExp(SAND));
  await drawer.getByLabel(/^Quantity/).fill("1");
  await drawer.getByRole("button", { name: "Return stock" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByLabel("Search materials").fill(SAND);
  const sand = rows.filter({ hasText: SAND });
  const sandText = (await sand.first().innerText()).replace(/\s+/g, " ");
  check("taken 4, returned 1, used 3 at £4.50", sandText.includes("Taken 4, returned 1") && sandText.includes("3 bag") && sandText.includes("£13.50"), sandText);
  await menu("+ New", "Take stock for this job");
  await pickOption(drawer, "Material", new RegExp(SAND));
  await drawer.getByLabel(/^Quantity/).fill("40");
  await drawer.getByRole("button", { name: "Take stock" }).click();
  check("can't take more than is there", await drawer.getByText(/Only 7 bag of/).waitFor({ timeout: 8000 }).then(() => true, () => false));
  await closeDrawer();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^History/ }).click();
  check("history lists the two moves for the job", (await rows.filter({ hasText: SAND }).count()) === 2);
  await shot(page, "02-materials");

  // Clean up: equipment, material, van.
  await page.goto(`${BASE}/equipment`);
  for (const [tag, name] of [[TAG1, KIT1], [TAG2, KIT2], [SAND, SAND]]) {
    await page.getByLabel("Search the list").fill(tag);
    await page.getByTestId("equipment-list").getByText(name).first().click();
    await drawer.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  await page.getByLabel("Search the list").fill(STAMP);
  check("our equipment and material are deleted", (await page.getByTestId("equipment-list").locator("tbody tr").filter({ hasText: STAMP }).count()) === 0);
  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG);
  await page.getByTestId("fleet-list").getByText(REG).click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await page.getByText("Nothing matches the search.").waitFor();
  check("van deleted", true);

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n")[0]);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
