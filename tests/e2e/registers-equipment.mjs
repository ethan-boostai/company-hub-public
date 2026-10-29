// Equipment and materials end-to-end check. Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234,
// on the crew list) and TEAM_LINK_KEY set (TEAM_KEY below must match it).
// Creates a fake vehicle (reg ZZ…E), equipment, a material, moves, a stocktake and tool reports,
// then deletes them.
// Usage: TEAM_KEY=<key> node tests/e2e/registers-equipment.mjs [screenshot-dir]
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

const STAMP = String(Date.now()).slice(-5);
const REG = `ZZ${STAMP}E`;
const TAG = `ZZ${STAMP}`;
const KIT = `ZZ Test Breaker ${STAMP}`;
const SAND = `ZZ Test Sand ${STAMP}`;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
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
const list = page.getByTestId("equipment-list");
const vanLabel = new RegExp(`\\(${REG}\\)`);

async function openRow(text) {
  await page.getByLabel("Search the list").fill(text);
  await list.getByText(text, { exact: false }).first().click();
}
async function closeDrawer() {
  await page.getByRole("button", { name: "Close", exact: true }).first().click();
}
async function menu(button, item) {
  await page.getByRole("button", { name: button, exact: true }).click();
  await page.getByRole("menuitem", { name: new RegExp(`^${item}`) }).click();
}
async function pickLocation(scope, label, option) {
  const sel = scope.getByLabel(label, { exact: true });
  const value = await sel.evaluate((el, re) => [...el.options].find((o) => new RegExp(re).test(o.textContent))?.value ?? "", option.source ?? option);
  await sel.selectOption(value);
}
async function stockIn(where) {
  const section = drawer.locator("section", { hasText: "Stock by location" });
  const row = section.locator("li").filter({ hasText: where });
  return (await row.count()) ? (await row.first().innerText()).replace(/\s+/g, " ") : "";
}

try {
  // Sign in and add a fake van that holds stock.
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

  // The menu item sits next to Fleet.
  const links = await page.getByRole("navigation", { name: "Main menu" }).getByRole("link").allInnerTexts();
  check("Equipment and materials is in the menu, after Fleet", links.indexOf("Equipment and materials") === links.indexOf("Fleet") + 1, links.join(" | "));
  await page.getByRole("link", { name: "Equipment and materials" }).click();
  await page.waitForURL(`${BASE}/equipment`);

  // Add equipment at the warehouse, service due in 10 days.
  await menu("+ New", "Equipment");
  await drawer.getByLabel("Name").fill(KIT);
  await drawer.getByLabel("Asset tag").fill(TAG);
  await pickLocation(drawer, "Where it is kept", /^CBS Warehouse$/);
  await drawer.getByLabel("Next service due").fill(inDays(10));
  await drawer.getByLabel("PAT test due").fill(inDays(200));
  await drawer.getByRole("button", { name: "Add equipment" }).dblclick();
  await drawer.getByRole("heading", { name: new RegExp(TAG) }).waitFor();
  await closeDrawer();
  await page.getByLabel("Search the list").fill(TAG);
  check("double click added the equipment once", (await list.locator("tbody tr").filter({ hasText: TAG }).count()) === 1);
  check("service due soon shows under Needs attention", (await page.getByRole("complementary", { name: "Needs attention" }).getByRole("listitem").filter({ hasText: TAG }).filter({ hasText: "Service" }).count()) === 1);

  // Add a material with 10 bags at the warehouse, minimum 5.
  await menu("+ New", "Material");
  await drawer.getByLabel("Name").fill(SAND);
  await drawer.getByLabel("Unit").selectOption("bag");
  await drawer.getByLabel("Minimum level").fill("5");
  await drawer.getByLabel("Opening stock (optional)").fill("10");
  await pickLocation(drawer, "Opening stock is at", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Add material" }).click();
  await drawer.getByText("Stock by location").waitFor();
  check("opening stock is at the warehouse", (await stockIn("CBS Warehouse")).includes("10 bag"), await stockIn("CBS Warehouse"));

  // CoSHH substance dropdown: lists Hazards and CoSHH's substances (no add new), saves the link.
  const coshh = drawer.getByLabel("CoSHH substance");
  const subs = await coshh.locator("option").allTextContents();
  check("CoSHH substance dropdown has None and no add new", subs[0] === "None" && !subs.some((o) => /add new/i.test(o)), subs.join(" | "));
  const zzSub = subs.find((o) => o.startsWith("ZZ"));
  if (zzSub) {
    await coshh.selectOption({ label: zzSub });
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await drawer.getByRole("link", { name: "Open CoSHH assessment" }).waitFor();
    const href = await drawer.getByRole("link", { name: "Open CoSHH assessment" }).getAttribute("href");
    check("saved substance links to its CoSHH assessment", /^\/safety\/coshh\?open=\d+$/.test(href ?? ""), href ?? "");
  } else check("a ZZ test substance exists for the CoSHH check", false, "add one on Hazards and CoSHH first");
  await closeDrawer();

  // Move 4 bags and the equipment onto the van.
  await menu("More", "Move stock");
  await pickLocation(drawer, "From", /^CBS Warehouse$/);
  await pickLocation(drawer, "To", vanLabel);
  const moving = drawer.getByTestId("move-items");
  await drawer.getByLabel("Search items to move").fill(STAMP);
  await moving.getByLabel(SAND).check();
  await moving.getByLabel("Qty").fill("40");
  check("can't move more than is there", await moving.getByText("Only 10 here").isVisible());
  await moving.getByLabel("Qty").fill("4");
  await moving.getByLabel(new RegExp(TAG)).check();
  await shot(page, "01-move");
  await drawer.getByRole("button", { name: "Move 2 items" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByLabel("Search the list").fill("");
  await openRow(SAND);
  check("warehouse now has 6 bags", (await stockIn("CBS Warehouse")).includes("6 bag"), await stockIn("CBS Warehouse"));
  check("the van has 4 bags", (await stockIn(REG)).includes("4 bag"), await stockIn(REG));
  await closeDrawer();
  await openRow(TAG);
  check("the equipment is on the van", (await drawer.getByText(vanLabel).count()) > 0);
  await drawer.getByText(/Moved: CBS Warehouse →/).first().waitFor();
  check("its history shows the move", true);
  await closeDrawer();

  // Filter by the van: both items show, the material with the van's quantity.
  await page.getByLabel("Search the list").fill(STAMP);
  await pickLocation(page, "Location", vanLabel);
  const here = list.locator("tbody tr").filter({ hasText: SAND });
  check("location filter shows the van's stock", (await here.getByText("4 bag here").count()) === 1 && (await list.locator("tbody tr").filter({ hasText: TAG }).count()) === 1);
  await shot(page, "02-filter-van");
  await pickLocation(page, "Location", /^CBS Office$/);
  check("nothing of ours at the office", (await list.locator("tbody tr").filter({ hasText: STAMP }).count()) === 0);
  await page.getByLabel("Location", { exact: true }).selectOption("");

  // Use 2 bags on a job from the van; trying to take 10 is refused.
  await openRow(SAND);
  await drawer.getByRole("button", { name: "Add or remove stock" }).click();
  await drawer.getByText("Remove stock").click();
  await pickLocation(drawer, "Where", vanLabel);
  await drawer.getByLabel("Quantity (bag)").fill("10");
  await drawer.getByLabel("Reason").selectOption("Used on job");
  await drawer.getByLabel("Job number (optional)").fill("12");
  await drawer.getByRole("button", { name: "Update stock" }).click();
  await drawer.getByText(/Only 4 bag of .* at /).waitFor();
  check("can't remove more than the van holds", true);
  await drawer.getByLabel("Quantity (bag)").fill("2");
  await drawer.getByRole("button", { name: "Update stock" }).click();
  await drawer.getByText("Used on job").first().waitFor();
  check("van down to 2 bags", (await stockIn(REG)).includes("2 bag"), await stockIn(REG));
  await drawer.getByText(/Job 12/).first().waitFor();
  check("history has the job number", true);
  await closeDrawer();

  // Stocktake at the warehouse: count 5. A delivery of 1 comes in before the office approves.
  await menu("More", "Start stocktake");
  await pickLocation(drawer, "Location counted", /^CBS Warehouse$/);
  await drawer.getByLabel("Search materials to count").fill(SAND);
  await drawer.getByLabel(`Count of ${SAND}`).fill("5");
  await drawer.getByRole("button", { name: "Send 1 count for approval" }).click();
  await drawer.getByText("Waiting for approval").waitFor();
  check("stocktake saved as waiting for approval", true);
  await closeDrawer();
  check("stocktake shows under Needs attention", (await page.getByRole("complementary", { name: "Needs attention" }).getByText("Stocktake to approve").count()) > 0);
  await openRow(SAND);
  check("stock unchanged until approved", (await stockIn("CBS Warehouse")).includes("6 bag"));
  await drawer.getByRole("button", { name: "Add or remove stock" }).click();
  await pickLocation(drawer, "Where", /^CBS Warehouse$/);
  await drawer.getByLabel("Quantity (bag)").fill("1");
  await drawer.getByLabel("Reason").selectOption("Delivered");
  await drawer.getByRole("button", { name: "Update stock" }).click();
  await drawer.getByText("Delivered").first().waitFor();
  await closeDrawer();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Stocktakes/ }).click();
  await page.getByLabel("Search the list").fill("CBS Warehouse");
  await list.locator("tbody tr").filter({ hasText: "Waiting for approval" }).first().click();
  const line = drawer.getByTestId("stocktake-lines").locator("tr").filter({ hasText: SAND });
  check("approval shows counted + the delivery since", (await line.innerText()).includes("6 bag"), (await line.innerText()).replace(/\s+/g, " "));
  await shot(page, "03-stocktake");
  await drawer.getByRole("button", { name: "Save decision" }).click();
  await drawer.getByText("Approved", { exact: true }).waitFor();
  check("stocktake approved", true);
  await closeDrawer();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  await openRow(SAND);
  check("warehouse set to 6 after approval", (await stockIn("CBS Warehouse")).includes("6 bag"), await stockIn("CBS Warehouse"));
  check("stocktake adjustment not needed (no change), last counted set", (await drawer.getByText("Test Office One").count()) > 0);
  await closeDrawer();

  // Office tool report: damaged, repair it. The equipment needs repair; a Team request is raised.
  await menu("+ New", "Tool report");
  await drawer.getByText("Damaged", { exact: true }).click();
  await drawer.getByLabel("Which tool").selectOption({ label: `${TAG} · ${KIT}` });
  await drawer.getByLabel("What happened / details").fill("ZZ test: chisel holder cracked");
  await drawer.getByText("Repair it - it can be fixed").click();
  await drawer.getByLabel("What needs repairing").fill("ZZ test: new holder");
  await drawer.getByRole("button", { name: "Add tool report" }).click();
  await drawer.getByRole("button", { name: /Open .*Needs repair/ }).waitFor();
  check("damaged report marks the equipment Needs repair", true);
  await drawer.getByRole("link", { name: "Open the Team request" }).click();
  await page.waitForURL(/\/requests\?request=\d+/);
  await page.getByRole("dialog").getByText(/Repair: ZZ Test Breaker .* \(damaged\)/).waitFor();
  check("repair raised a Team request, opened from the report", (await page.getByRole("dialog").getByText("Tool repair", { exact: false }).count()) > 0);
  await page.goto(`${BASE}/equipment`);

  // Back in service from the equipment drawer.
  await openRow(TAG);
  await drawer.getByRole("button", { name: "Mark back in service" }).click();
  await pickLocation(drawer, "Where is it now?", /^CBS Warehouse$/);
  await drawer.getByRole("button", { name: "Mark back in service" }).click();
  await drawer.getByText("Back in service at CBS Warehouse").waitFor();
  check("back in service, at the warehouse", true);
  await closeDrawer();

  // Team app: the crew report the same tool lost, with a photo, and ask for a replacement.
  const phone = await (await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
  phone.on("dialog", async (d) => {
    popups++;
    await d.dismiss();
  });
  await phone.goto(`${BASE}/team?k=${encodeURIComponent(KEY)}`);
  await phone.getByText("TOOLS", { exact: true }).waitFor();
  await phone.getByRole("button", { name: /Report a lost, stolen or damaged tool/ }).click();
  await phone.getByLabel("Your name").selectOption("Test Office One");
  await phone.getByLabel("What happened", { exact: true }).selectOption("Stolen");
  await phone.getByLabel("Which tool").selectOption({ label: `${KIT} (${TAG})` });
  await phone.getByLabel("Police event number (if reported)").fill("ZZ123");
  await phone.getByLabel("Do you need it replaced or repaired?").selectOption("yes");
  await phone.locator('input[type="file"]').setInputFiles([{ name: "van.png", mimeType: "image/png", buffer: PNG }]);
  await shot(phone, "04-team-tool");
  await phone.getByRole("button", { name: "Send report" }).click();
  await phone.getByText("Report sent and a replacement has been requested.").waitFor();
  check("team tool report sent", true);
  await phone.close();

  await page.reload();
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Tool reports/ }).click();
  await page.getByLabel("Search the list").fill(TAG);
  const rep = list.locator("tbody tr").filter({ hasText: "Stolen" });
  check("team report listed as Team app, replacement asked for", (await rep.getByText("Team app").count()) === 1 && (await rep.getByText("Replacement", { exact: true }).count()) === 1);
  await rep.first().click();
  await drawer.getByText(/Tool report \d+ - photo 1\.png/).waitFor();
  check("its photo arrived on the report", true);
  check("stolen: police reference kept", (await drawer.getByText("ZZ123").count()) === 1);
  await drawer.getByRole("button", { name: /Open .*\(Lost\)/ }).waitFor();
  check("stolen marks the equipment Lost", true);
  await drawer.getByText("Closed", { exact: true }).click();
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText(/Closed .* by Test Office One/).waitFor();
  check("office closes the report by hand", true);
  await closeDrawer();
  await page.goto(`${BASE}/requests`);
  await page.getByLabel("Search requests").fill(KIT);
  const req = page.getByTestId("request-list").locator("tbody tr").filter({ hasText: "Replace:" });
  check("replacement request raised for today", (await req.getByText("Today").count()) === 1 && (await req.getByText("Team app").count()) === 1);

  // The report PDF.
  await page.goto(`${BASE}/equipment`);
  await menu("Reports", "Create report");
  await page.getByRole("dialog").getByRole("button", { name: "Create report" }).click();
  await page.getByRole("dialog").locator("iframe, object, embed").first().waitFor();
  const pdf = await page.request.get(`${BASE}/equipment/report?include=equipment,materials&kit=tag,location&mat=qty,locations`);
  check("report is a PDF", pdf.status() === 200 && (pdf.headers()["content-type"] ?? "").includes("application/pdf"));
  await page.keyboard.press("Escape");

  // A van still holding stock can't be deleted.
  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG);
  await page.getByTestId("fleet-list").getByText(REG).click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await page.getByText(/still holds equipment or materials/).waitFor();
  check("can't delete a van that holds stock", true);
  await page.getByRole("dialog").last().getByRole("button", { name: "Cancel" }).click();
  await page.goto(`${BASE}/equipment`);

  // Clean up: requests, reports, equipment, material, stocktake, van.
  await page.goto(`${BASE}/requests`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  for (;;) {
    await page.getByLabel("Search requests").fill(KIT);
    const r = page.getByTestId("request-list").locator("tbody tr").filter({ hasText: KIT });
    if ((await r.count()) === 0) break;
    await r.first().click();
    await page.getByRole("dialog").first().getByRole("button", { name: "Delete this request" }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await page.getByRole("dialog").last().waitFor({ state: "detached" }).catch(() => {});
    await page.waitForTimeout(300);
  }
  await page.goto(`${BASE}/equipment`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Tool reports/ }).click();
  for (;;) {
    await page.getByLabel("Search the list").fill(TAG);
    const r = list.locator("tbody tr").filter({ hasText: KIT });
    if ((await r.count()) === 0) break;
    await r.first().click();
    await drawer.getByRole("button", { name: "Delete this tool report" }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /Stocktakes/ }).click();
  await page.getByLabel("Search the list").fill("CBS Warehouse");
  await list.locator("tbody tr").filter({ hasText: "Approved" }).first().click();
  await drawer.getByRole("button", { name: "Delete this stocktake" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  await openRow(TAG);
  await drawer.getByRole("button", { name: `Delete ${KIT}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  await openRow(SAND);
  await drawer.getByRole("button", { name: `Delete ${SAND}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  await page.getByLabel("Search the list").fill(STAMP);
  check("our equipment and material are deleted", (await list.locator("tbody tr").filter({ hasText: STAMP }).count()) === 0);
  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG);
  await page.getByTestId("fleet-list").getByText(REG).click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await page.getByText("Nothing matches the search.").waitFor();
  check("empty van deleted", true);

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n")[0]);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
