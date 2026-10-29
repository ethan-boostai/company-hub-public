// Hazards and CoSHH end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100)
// on the local dev database with the local seed (Test Office One, PIN 1234) and FILE_STORAGE=local.
// Creates fake records named "ZZ Test …" and deletes them again (a fake "ZZ Test Supplier …" stays).
// Usage: node tests/e2e/safety-hazards-coshh.mjs [screenshot-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument, StandardFonts } = require("pdf-lib");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const ukDate = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + n * 86_400_000));

const RUN = String(Date.now()).slice(-5);
const HAZARD = `ZZ Test hazard ${RUN}`;
const PRODUCT = `ZZ Test Thinners ${RUN}`;
const SUPPLIER = `ZZ Test Supplier ${RUN}`;

// A fake safety data sheet: a 2-page PDF.
async function fakeSds(name, pages) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) doc.addPage([595, 842]).drawText(`ZZ fake safety data sheet, page ${i}`, { x: 50, y: 780, size: 14, font });
  const file = path.join(tmpdir(), name);
  writeFileSync(file, await doc.save());
  return file;
}

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const panel = page.getByRole("complementary", { name: "Needs attention" });

async function packPages(drawer) {
  await drawer.getByRole("button", { name: /^Open CoSHH pack v\d+$/ }).click();
  const href = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const id = /\/files\/(\d+)/.exec(href)?.[1];
  const res = await page.request.get(`${BASE}/api/files/${id}/content`);
  const body = await res.body();
  await page.getByRole("dialog").last().getByRole("button", { name: "Close" }).first().click();
  const isPdf = body.subarray(0, 5).toString() === "%PDF-";
  return { isPdf, pages: isPdf ? (await PDFDocument.load(body)).getPageCount() : 0, name: decodeURIComponent((res.headers()["content-disposition"] || "").split("''")[1] || "") };
}

try {
  await page.goto(`${BASE}/sign-in?next=/safety/hazards`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/safety/hazards`);

  const menu = page.getByRole("navigation", { name: "Main menu" });
  check("menu: Health and safety > Hazards and CoSHH is highlighted", (await menu.getByRole("link", { name: "Hazards and CoSHH" }).getAttribute("aria-current")) === "page");
  check("Hazards tab is current", (await page.getByRole("link", { name: "Hazards", exact: true }).getAttribute("aria-current")) === "page");
  check("one orange + New hazard", await page.getByRole("button", { name: "+ New hazard" }).isVisible());

  /* ---------- Hazards ---------- */
  await page.getByRole("button", { name: "+ New hazard" }).click();
  let drawer = page.getByRole("dialog", { name: "New hazard" });
  await drawer.getByLabel("Hazard", { exact: true }).fill(HAZARD);
  await drawer.getByLabel("Activity").selectOption("Working at height");
  await drawer.getByLabel(/^Harm/).fill("Falls from the ladder: broken bones");
  const before = drawer.getByRole("group", { name: "Risk before controls" });
  await before.getByLabel("Likelihood").selectOption("4");
  await before.getByLabel("Consequence").selectOption("5");
  check("rating works out as you choose (4 x 5 = Extreme)", (await before.getByText(/Rating:/).innerText()).includes("Extreme"));
  await drawer.getByLabel("Controls", { exact: true }).fill("Use a podium; foot the ladder");
  await drawer.getByRole("checkbox", { name: "Eliminate", exact: true }).check();
  await drawer.getByRole("checkbox", { name: "PPE", exact: true }).check();
  const after = drawer.getByRole("group", { name: "Risk after controls" });
  await after.getByLabel("Likelihood").selectOption("2");
  await after.getByLabel("Consequence").selectOption("2");
  check("residual rating (2 x 2 = Low)", (await after.getByText(/Rating:/).innerText()).includes("Low"));
  await drawer.getByLabel("Review due").fill(ukDate(10));
  await shot(page, "01-hazard-form");
  await drawer.getByRole("button", { name: "Add hazard" }).dblclick();
  await page.getByRole("dialog", { name: HAZARD }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(600);
  const rows = page.locator("main tbody tr").filter({ hasText: HAZARD });
  check("double click adds the hazard once", (await rows.count()) === 1, String(await rows.count()));
  drawer = page.getByRole("dialog", { name: HAZARD });
  check("RAMS key made from the name", (await drawer.getByText(/RAMS key: zz_test_hazard_/).count()) === 1);
  await drawer.getByRole("button", { name: "Close" }).first().click();
  check("row shows Extreme and Low", (await rows.first().innerText()).includes("Extreme") && (await rows.first().innerText()).includes("Low"));
  check("review due in 10 days shows under Needs attention, Due soon", (await panel.getByRole("region", { name: "Due soon" }).getByText(HAZARD).count()) === 1);
  await shot(page, "02-hazards");

  await page.getByLabel("Search hazards").fill(`hazard ${RUN}`);
  check("search finds it", (await rows.count()) === 1);
  await page.getByLabel("Search hazards").fill("");

  // Same name refused.
  await page.getByRole("button", { name: "+ New hazard" }).click();
  drawer = page.getByRole("dialog", { name: "New hazard" });
  await drawer.getByLabel("Hazard", { exact: true }).fill(HAZARD.toUpperCase());
  await drawer.getByRole("button", { name: "Add hazard" }).click();
  await drawer.getByText("There's already a hazard with that name.").waitFor();
  check("a second hazard with the same name is refused", true);
  await drawer.getByRole("button", { name: "Close" }).first().click();

  // Archive, then restore.
  await rows.first().click();
  drawer = page.getByRole("dialog", { name: HAZARD });
  await drawer.getByRole("button", { name: "Archive hazard" }).click();
  await drawer.getByRole("button", { name: "Restore hazard" }).waitFor();
  await drawer.getByRole("button", { name: "Close" }).first().click();
  check("archived hazard leaves the Active list", (await rows.count()) === 0);
  await page.getByRole("button", { name: /^Archived/ }).click();
  check("and shows under Archived", (await rows.count()) === 1);
  check("archived hazards don't need attention", (await panel.getByText(HAZARD).count()) === 0);
  await rows.first().click();
  await page.getByRole("dialog", { name: HAZARD }).getByRole("button", { name: "Restore hazard" }).click();
  await page.getByRole("dialog", { name: HAZARD }).getByRole("button", { name: "Archive hazard" }).waitFor();
  await page.getByRole("dialog", { name: HAZARD }).getByRole("button", { name: "Close" }).first().click();
  await page.getByRole("button", { name: /^Active/ }).click();
  check("restored hazard is Active again", (await rows.count()) === 1);

  // Report.
  await page.getByRole("button", { name: "Reports" }).click();
  await page.getByRole("menuitem", { name: /Create report/ }).click();
  await page.getByRole("dialog", { name: "Hazard register report" }).getByLabel("Owner").check();
  await page.getByRole("button", { name: "Create report", exact: true }).click();
  await page.getByRole("link", { name: "Open full screen" }).waitFor();
  const rep = await page.request.get(`${BASE}/api/safety/hazards/report?which=active&cols=activity,risk,controls,residual,review`);
  check("hazard register report is a PDF", rep.headers()["content-type"] === "application/pdf" && (await rep.body()).subarray(0, 5).toString() === "%PDF-");
  await page.getByRole("dialog").last().getByRole("button", { name: "Close" }).first().click();

  /* ---------- CoSHH ---------- */
  await page.getByRole("link", { name: "CoSHH", exact: true }).click();
  await page.waitForURL(`${BASE}/safety/coshh`);
  check("menu keeps Hazards and CoSHH highlighted on the CoSHH tab", (await menu.getByRole("link", { name: "Hazards and CoSHH" }).getAttribute("aria-current")) === "page");
  const srows = page.locator("main tbody tr").filter({ hasText: PRODUCT });

  await page.getByRole("button", { name: "+ New CoSHH assessment" }).click();
  drawer = page.getByRole("dialog", { name: "New CoSHH assessment" });
  await drawer.getByLabel("Product").fill(PRODUCT);
  await drawer.getByLabel("Supplier").selectOption("__add_new__");
  await drawer.getByLabel("New supplier").fill(SUPPLIER);
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction((s) => [...document.querySelectorAll("select option:checked")].some((o) => o.textContent === s), SUPPLIER);
  check("supplier dropdown adds a new supplier", true);
  await drawer.getByLabel(/^Used for/).fill("Cleaning brushes");
  await drawer.getByLabel("Flammable").check();
  await drawer.getByLabel("Harmful or irritant").check();
  await drawer.getByRole("group", { name: "Skin contact" }).getByLabel("Effect").fill("Dry skin, dermatitis");
  await drawer.getByLabel("Controls", { exact: true }).fill("Use in a ventilated area");
  await drawer.getByLabel("Storage").fill("Flammables cabinet");
  await drawer.getByLabel("Spills and disposal").fill("Absorb with sand; hazardous waste");
  await drawer.getByLabel("Chemical-resistant gloves").check();
  await drawer.getByLabel("Assessed by").selectOption({ label: "Test Office One" });
  await drawer.locator("label").filter({ hasText: /^Assessed$/ }).click();
  await shot(page, "03-coshh-form");
  await drawer.getByRole("button", { name: "Add substance" }).dblclick();
  drawer = page.getByRole("dialog", { name: PRODUCT });
  await drawer.waitFor({ timeout: 10000 });
  await drawer.getByText(/Saved as a Draft\. To mark it Assessed it still needs: the safety data sheet\./).waitFor();
  check("Assessed without an SDS saves as a Draft, with an in-app note", true);
  await page.waitForTimeout(400);
  check("double click adds the substance once", (await srows.count()) === 1, String(await srows.count()));
  check("Draft shows under Needs attention", (await panel.getByText(PRODUCT).count()) >= 1);

  // Upload the SDS (a 2-page PDF), then mark it Assessed: pack v1 = assessment pages + 2 SDS pages.
  await drawer.locator('input[type="file"]').setInputFiles(await fakeSds(`ZZ SDS ${RUN}.pdf`, 2));
  await drawer.getByRole("button", { name: `ZZ SDS ${RUN}.pdf` }).waitFor({ timeout: 15000 });
  check("SDS uploads and shows on the substance", true);
  await drawer.locator("label").filter({ hasText: /^Assessed$/ }).click();
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await drawer.getByRole("button", { name: "Open CoSHH pack v1" }).waitFor({ timeout: 20000 });
  let pack = await packPages(drawer);
  check("Assessed makes pack v1 (a PDF)", pack.isPdf, pack.name);
  check("pack has the SDS pages appended", pack.pages >= 3, `${pack.pages} pages`);
  check("pack file name has the version and date", pack.name === `${PRODUCT} - COSHH Assessment v1 - ${ukDate(0)}.pdf`, pack.name);
  const housePages = pack.pages - 2;
  check("Draft leaves Needs attention once Assessed", (await panel.getByText(PRODUCT).count()) === 0);

  // Not assessment content: just saves, same version.
  await drawer.getByLabel("Notes").fill("Bought in 5 litre tins");
  await drawer.getByLabel("Where it's kept").fill("Van store");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await page.waitForTimeout(1500);
  check("notes and location edits keep v1", (await drawer.getByRole("button", { name: "Open CoSHH pack v1" }).count()) === 1);

  // Assessment content (storage): new pack v2.
  await drawer.getByLabel("Storage").fill("Locked flammables cabinet in the yard");
  await drawer.getByRole("button", { name: "Save", exact: true }).click();
  await drawer.getByRole("button", { name: "Open CoSHH pack v2" }).waitFor({ timeout: 20000 });
  check("a storage change makes pack v2", true);

  // A new SDS (3 pages): pack v3 with the new SDS.
  await drawer.locator('input[type="file"]').setInputFiles(await fakeSds(`ZZ SDS ${RUN} rev2.pdf`, 3));
  await drawer.getByRole("button", { name: "Open CoSHH pack v3" }).waitFor({ timeout: 20000 });
  pack = await packPages(drawer);
  check("a new SDS makes pack v3 with the new SDS", pack.pages === housePages + 3, `${pack.pages} pages`);
  await shot(page, "04-coshh-assessed");
  await drawer.getByRole("button", { name: "Close" }).first().click();
  check("list shows v3 and Assessed", (await srows.first().innerText()).includes("v3") && (await srows.first().innerText()).includes("Assessed"));

  await page.getByLabel("Search CoSHH").fill("brushes");
  check("search finds it by what it's used for", (await srows.count()) === 1);
  await page.getByLabel("Search CoSHH").fill("");

  const crep = await page.request.get(`${BASE}/api/safety/coshh/report?which=assessed&cols=supplier,ghs,review,status`);
  check("CoSHH register report is a PDF", crep.headers()["content-type"] === "application/pdf");

  /* ---------- Clean up (in-app are-you-sure) ---------- */
  await srows.first().click();
  await page.getByRole("dialog", { name: PRODUCT }).getByRole("button", { name: "Delete substance" }).click();
  await page.getByRole("dialog", { name: /^Delete ZZ Test Thinners/ }).getByRole("button", { name: "Delete substance" }).click();
  await page.waitForTimeout(800);
  check("substance deleted after the in-app are-you-sure", (await srows.count()) === 0);

  await page.goto(`${BASE}/safety/hazards`);
  await rows.first().click();
  await page.getByRole("dialog", { name: HAZARD }).getByRole("button", { name: "Delete hazard" }).click();
  await page.getByRole("dialog", { name: /^Delete ZZ Test hazard/ }).getByRole("button", { name: "Delete hazard" }).click();
  await page.waitForTimeout(800);
  check("hazard deleted after the in-app are-you-sure", (await rows.count()) === 0);

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
