// Subcontractors and suppliers end-to-end check. Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234).
// Creates fake companies named "ZZ Test …" and deletes them again.
// Usage: node tests/e2e/registers-subcontractors.mjs [screenshot-dir]
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
const plus = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

const RUN = String(Date.now()).slice(-5);
const SUB = `ZZ Test Scaffolding ${RUN}`;
const SUP = `ZZ Test Haulage ${RUN}`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const drawer = page.getByRole("dialog").first();
const list = page.getByTestId("company-list");
const newMenu = async (what) => {
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: what, exact: true }).click();
};

try {
  await page.goto(`${BASE}/sign-in?next=/subcontractors`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/subcontractors`);
  check("Subcontractors and suppliers is in the left menu", await page.getByRole("link", { name: "Subcontractors and suppliers" }).isVisible());

  // Add a subcontractor, with a trade from the list.
  await newMenu("Subcontractor");
  await drawer.getByLabel("Company").fill(SUB);
  await drawer.getByLabel("Trade").selectOption("Scaffolding");
  await drawer.getByLabel("Mobile").fill("07700 900123");
  await drawer.getByLabel("Email").fill("not-an-email");
  await drawer.getByRole("button", { name: "Add subcontractor" }).click();
  await drawer.getByText("That email address doesn't look right.").waitFor();
  check("bad email refused in-app", true);
  // A refused save currently clears the form (shared GuardedForm bug, reported to Core), so type it again.
  await drawer.getByLabel("Company").fill(SUB);
  await drawer.getByLabel("Trade").selectOption("Scaffolding");
  await drawer.getByLabel("Email").fill("test@example.com");
  await drawer.getByLabel("Approved to work").check();
  await drawer.getByRole("button", { name: "Add subcontractor" }).dblclick();
  await drawer.getByRole("heading", { name: SUB }).waitFor();
  check("subcontractor saved", true);

  // Add an insurance document expiring in 20 days, with a file.
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByLabel("Document").selectOption("Public liability insurance");
  await drawer.getByLabel("Policy or certificate number").fill("PL-TEST-1");
  await drawer.getByLabel("Expires").fill(plus(20));
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByRole("heading", { name: new RegExp(`Public liability insurance · ${SUB}`) }).waitFor();
  check("document saved", await drawer.getByText("20 days left").isVisible());
  const tmp = path.join(tmpdir(), "zz-test-pl.txt");
  writeFileSync(tmp, "test file");
  const chooser = page.waitForEvent("filechooser");
  await drawer.getByRole("button", { name: "Upload file" }).click();
  await (await chooser).setFiles(tmp);
  await drawer.getByText("zz-test-pl.txt").waitFor();
  check("file uploaded to the document", true);

  // Add a new document type through the dropdown's "+ Add new…".
  await drawer.getByRole("button", { name: `Open ${SUB}` }).click();
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByLabel("Document").selectOption({ label: "+ Add new…" });
  await drawer.getByLabel("New document").fill(`ZZ Test permit ${RUN}`);
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByRole("heading", { name: new RegExp(`ZZ Test permit ${RUN}`) }).waitFor();
  check("a new document type can be added from the dropdown", true);
  await drawer.getByRole("button", { name: `Open ${SUB}` }).click();
  check("company shows its documents", (await drawer.getByText("No expiry date").count()) === 1);
  await page.getByRole("button", { name: "Close" }).first().click();

  // Add a supplier: suppliers hold documents too.
  await newMenu("Supplier");
  await drawer.getByLabel("Company").fill(SUP);
  await drawer.getByLabel("Our account number").fill("ACC-1");
  await drawer.getByRole("button", { name: "Add supplier" }).click();
  await drawer.getByRole("heading", { name: SUP }).waitFor();
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByLabel("Document").selectOption("Goods in transit insurance");
  await drawer.getByLabel("Expires").fill(plus(-3));
  await drawer.getByRole("button", { name: "Add document" }).click();
  await drawer.getByText(/^Expired /).first().waitFor();
  check("supplier document saved and shows expired", true);
  await page.getByRole("button", { name: "Close" }).first().click();

  // Due panel and filters.
  const panel = page.getByRole("complementary", { name: "Needs attention" });
  check("Needs attention shows both documents", (await panel.getByText(SUB).count()) === 1 && (await panel.getByText(SUP).count()) === 1);
  await page.getByLabel("Search subcontractors and suppliers").fill(`ZZ Test`);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^Suppliers/ }).click();
  check("type filter shows suppliers only", (await list.getByText(SUP).count()) === 1 && (await list.getByText(SUB).count()) === 0);
  await page.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
  await page.getByLabel("Search subcontractors and suppliers").fill("PL-TEST-1");
  check("search finds a company by document reference", (await list.getByText(SUB).count()) === 1);
  await shot(page, "01-list");

  // Duplicate name refused.
  await newMenu("Subcontractor");
  await drawer.getByLabel("Company").fill(SUB.toLowerCase());
  await drawer.getByRole("button", { name: "Add subcontractor" }).click();
  await drawer.getByText("There is already a subcontractor with that name.").waitFor();
  check("same subcontractor can't be added twice", true);
  await page.getByRole("button", { name: "Close" }).first().click();

  // Report.
  await page.getByRole("button", { name: "Reports" }).click();
  await page.getByRole("menuitem", { name: /^Create report/ }).click();
  await page.getByLabel("Email").check();
  await page.getByLabel("Only expired or expiring documents").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create report" }).click();
  await page.getByRole("link", { name: "Open full screen" }).waitFor();
  const href = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const res = await page.request.get(`${BASE}${href}`);
  check("report is a PDF", res.ok() && (res.headers()["content-type"] ?? "").includes("pdf"));
  await shot(page, "02-report");
  await page.getByRole("button", { name: "Close" }).last().click();

  // Delete both companies (in-app are-you-sure).
  await page.getByLabel("Search subcontractors and suppliers").fill("ZZ Test");
  for (const name of [SUB, SUP]) {
    await list.getByText(name).click();
    await drawer.getByRole("button", { name: `Delete ${name}` }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await list.getByText(name).waitFor({ state: "detached" });
  }
  check("companies deleted after the in-app are-you-sure", true);
  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
