// Fleet end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100) on the
// local dev database with the local seed (Test Office One, PIN 1234). Creates fake test vehicles
// whose reg starts with ZZ and deletes them again.
// Usage: node tests/e2e/registers-fleet.mjs [screenshot-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
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

const REG = `ZZ${String(Date.now()).slice(-5)}T`; // a fresh fake reg each run
const SPACED = `${REG.slice(0, 4)} ${REG.slice(4)}`.toLowerCase();
const iso = (d) => d.toISOString().slice(0, 10);
const plus = (n) => iso(new Date(Date.now() + n * 86_400_000));

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const drawer = page.getByRole("dialog").first();

try {
  await page.goto(`${BASE}/sign-in?next=/fleet`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/fleet`);
  check("Fleet is in the left menu", await page.getByRole("link", { name: "Fleet" }).isVisible());

  // Add a vehicle (reg typed in lower case with a space).
  await page.getByRole("button", { name: "+ New", exact: true }).click(); await page.getByRole("menuitem", { name: "Vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(SPACED);
  await drawer.getByLabel("Make and model").fill("Ford Transit");
  await drawer.getByLabel("MOT expires").fill(plus(10));
  await drawer.getByLabel("Vehicle Tax due").fill(plus(200));
  await drawer.getByLabel("Next inspection due").fill(plus(5));
  await drawer.getByText("Quarterly", { exact: true }).click();
  const save = drawer.getByRole("button", { name: "Add vehicle" });
  await save.dblclick(); // a double click must save once
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  check("vehicle saved with reg in capitals, no spaces", true);
  await shot(page, "01-vehicle");

  const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  check("page behind the drawer doesn't scroll", htmlOverflow === "hidden", htmlOverflow);

  // Add a check with a fault but no description: refused in-app.
  await drawer.getByRole("button", { name: "Add check" }).click();
  await drawer.locator("li", { hasText: "Tyres and wheels" }).getByRole("radio", { name: "Fault" }).click();
  await drawer.getByLabel("Odometer (miles)").fill("41200");
  await drawer.getByRole("button", { name: "Add check" }).click();
  await drawer.getByText("Describe the fault.").waitFor();
  check("a fault needs a description", true);
  await drawer.getByLabel("Faults or notes").fill("Front nearside tyre worn");
  await drawer.getByText("Defects logged", { exact: true }).click();
  await drawer.getByRole("button", { name: "Add check" }).click();
  await drawer.getByRole("heading", { name: new RegExp(`Vehicle check · ${REG}`) }).waitFor();
  check("check saved", true);

  // Back to the vehicle: inspection date moved on by a quarter.
  await drawer.getByRole("button", { name: `Open vehicle ${REG}` }).click();
  const nextInsp = await drawer.getByLabel("Next inspection due").inputValue();
  const expected = (() => { const d = new Date(`${plus(5)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 3); return iso(d); })();
  check("logging a check rolls the next inspection on", nextInsp === expected, `${nextInsp} vs ${expected}`);

  // Add a service with a next due date: the vehicle's service date follows it.
  await drawer.getByRole("button", { name: "Add service" }).click();
  await drawer.getByLabel("Workshop").fill("Test Motors");
  await drawer.getByLabel("Cost (£)").fill("£245.50");
  await drawer.getByLabel("Odometer (miles)").fill("41250");
  await drawer.getByLabel("Next service due (date)").fill(plus(300));
  await drawer.getByLabel("Next service due (miles)").fill("51250");
  await drawer.getByRole("button", { name: "Add service" }).click();
  await drawer.getByRole("heading", { name: new RegExp(`Service · ${REG}`) }).waitFor();
  await drawer.getByRole("button", { name: `Open vehicle ${REG}` }).click();
  check("service updates the vehicle's next service date", (await drawer.getByLabel("Next service due").inputValue()) === plus(300));
  check("latest mileage comes from checks and services", await drawer.getByText("41,250 miles").first().isVisible());

  // Add an accident.
  await drawer.getByRole("button", { name: "Add accident" }).click();
  await drawer.getByLabel("What happened").fill("Test only: reversing into a bollard");
  await drawer.getByRole("button", { name: "Add accident" }).click();
  await drawer.getByRole("heading", { name: new RegExp(`Accident · ${REG}`) }).waitFor();
  check("accident saved", true);

  // Upload a file to the accident.
  const tmp = path.join(tmpdir(), "zz-test-photo.txt");
  writeFileSync(tmp, "test file");
  const chooser = page.waitForEvent("filechooser");
  await drawer.getByRole("button", { name: "Upload file" }).click();
  await (await chooser).setFiles(tmp);
  await drawer.getByText("zz-test-photo.txt").waitFor();
  check("file uploaded to the accident", true);
  await drawer.getByText("zz-test-photo.txt").click();
  await page.getByRole("link", { name: "Open full screen" }).waitFor();
  check("file opens in-window", true);
  await page.getByRole("button", { name: "Close" }).last().click();
  await page.getByRole("button", { name: "Close" }).first().click();

  // Due list shows the MOT, the unreviewed defect check and the open accident.
  // (Needs attention: the page top's button opens the 560px drawer, Overdue then Due soon.)
  await page.getByRole("button", { name: /^Needs attention/ }).click();
  const panel = page.getByRole("dialog", { name: "Needs attention" });
  check("Needs attention shows the MOT", await panel.getByText("MOT").first().isVisible());
  check("Needs attention shows the open accident", await panel.getByText(/Accident/).first().isVisible());
  await shot(page, "02-needs-attention");
  await panel.getByRole("button", { name: "Close" }).click();
  await shot(page, "02-list");

  // Search on each list.
  await page.getByLabel("Search vehicles").fill(REG.slice(0, 5).toLowerCase());
  check("vehicle search finds it", (await page.locator("[data-testid=fleet-list] li").filter({ hasText: REG }).count()) >= 1);
  await page.getByRole("button", { name: /^Vehicle checks/ }).click();
  await page.getByLabel("Search checks").fill("nearside");
  check("check search finds the defect", (await page.locator("[data-testid=fleet-list] li").filter({ hasText: "Defects logged" }).count()) === 1);

  // Duplicate reg refused.
  await page.getByRole("button", { name: /^Vehicles/ }).click();
  await page.getByRole("button", { name: "+ New", exact: true }).click(); await page.getByRole("menuitem", { name: "Vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(SPACED.toUpperCase());
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByText("That vehicle is already on the register.").waitFor();
  check("same reg can't be added twice", true);
  await page.getByRole("button", { name: "Close" }).first().click();

  // Delete the vehicle (in-app are-you-sure).
  await page.getByLabel("Search vehicles").fill(REG);
  await page.locator("[data-testid=fleet-list] li").filter({ hasText: REG }).first().click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  const confirm = page.getByRole("dialog").last();
  await confirm.getByText(/1 check\(s\), 1 service\(s\) and 1 accident/).waitFor();
  await confirm.getByRole("button", { name: "Delete" }).click();
  await page.getByText("Nothing matches the search.").waitFor();
  check("vehicle deleted after the in-app are-you-sure", true);
  await shot(page, "03-deleted");

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
