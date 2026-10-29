// Team training end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100)
// on the local dev database with the local seed (Test Office One, PIN 1234; the seed people are on
// the crew list). Adds a fake person "ZZ Test Trainee …" (not on the crew list) with fake training,
// deletes the training and marks the person as left.
// Usage: node tests/e2e/registers-training.mjs [screenshot-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const { PDFDocument } = require("pdf-lib");

const BASE = process.env.BASE_URL || "http://localhost:3100";
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
const WHO = `ZZ Test Trainee ${RUN}`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const drawer = page.getByRole("dialog").first();
const closeDrawer = () => page.getByRole("button", { name: "Close", exact: true }).first().click();
const list = page.getByTestId("training-list");
const matrix = page.getByTestId("matrix");
const cell = (who, ticket) => matrix.getByRole("button", { name: new RegExp(`^${who}, ${ticket.replace(/[()]/g, "\\$&")}:`) });

try {
  await page.goto(`${BASE}/sign-in?next=/settings/people`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/settings/people`);

  // A fake person, not on the crew list.
  await page.getByRole("button", { name: "Add person" }).click();
  await drawer.getByLabel("Name").fill(WHO);
  await drawer.getByRole("button", { name: "Add person" }).click();
  await page.getByText(WHO).first().waitFor();

  await page.goto(`${BASE}/training`);
  check("Team training is in the left menu", await page.getByRole("link", { name: "Team training" }).isVisible());

  // SMSTS expiring in 20 days, with a file.
  await page.getByRole("button", { name: "Add training" }).click();
  await drawer.getByLabel("Person").selectOption({ label: WHO });
  await drawer.getByLabel("Ticket or qualification").selectOption("SMSTS");
  await drawer.getByLabel("Provider").fill("ZZ Test Training Ltd");
  await drawer.getByLabel("Expires").fill(plus(20));
  await drawer.getByRole("button", { name: "Add training" }).dblclick(); // a double click must save once
  await drawer.getByRole("heading", { name: `${WHO} · SMSTS` }).waitFor();
  check("training saved and shows days left", await drawer.getByText("(20 days)").isVisible());
  const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  check("page behind the drawer doesn't scroll", htmlOverflow === "hidden", htmlOverflow);
  const tmp = path.join(tmpdir(), "zz-test-card.txt");
  writeFileSync(tmp, "test card");
  const chooser = page.waitForEvent("filechooser");
  await drawer.getByRole("button", { name: "Upload file" }).click();
  await (await chooser).setFiles(tmp);
  await drawer.getByText("zz-test-card.txt").waitFor();
  check("file uploaded to the training record", true);
  await closeDrawer();
  const attention = page.getByTestId("attention");
  check("expiring ticket is in the expiring list", (await attention.getByText(WHO).count()) === 1);
  await page.getByLabel("Search training").fill(WHO);
  check("only one record was saved", (await list.getByRole("button").count()) === 1);

  // A newer SMSTS replaces it: off the expiring list, kept as history.
  await page.getByRole("button", { name: "Add training" }).click();
  await drawer.getByLabel("Person").selectOption({ label: WHO });
  await drawer.getByLabel("Ticket or qualification").selectOption("SMSTS");
  await drawer.getByLabel("Issued").fill(plus(-1));
  await drawer.getByLabel("Expires").fill(plus(1800));
  await drawer.getByRole("button", { name: "Add training" }).click();
  await drawer.getByText("Other SMSTS records").waitFor();
  check("newer record lists the earlier one", (await drawer.getByText("Earlier record").count()) === 1);
  await closeDrawer();
  check("replaced ticket leaves the expiring list", (await attention.getByText(WHO).count()) === 0);
  check("list shows the current record only", (await list.getByRole("button").count()) === 1);
  await page.getByLabel("Show replaced records").check();
  check("replaced records can be shown", (await list.getByRole("button").count()) === 2);
  await page.getByLabel("Show replaced records").uncheck();
  await shot(page, "01-records");

  // Matrix.
  await page.getByRole("tab", { name: "Matrix" }).click();
  await cell(WHO, "SMSTS").waitFor();
  check("matrix shows the current SMSTS", (await cell(WHO, "SMSTS").textContent()) !== "Expired");
  await page.getByLabel("People", { exact: true }).selectOption("crew");
  check("crew list leaves out people not ticked for the crew", (await matrix.getByText(WHO).count()) === 0 && (await matrix.getByText("Test Office One").count()) === 1);
  await page.getByLabel("People", { exact: true }).selectOption("active");
  await page.getByLabel("Tickets", { exact: true }).selectOption("standard");
  await cell(WHO, "PASMA").click();
  await drawer.getByRole("heading", { name: "Add training" }).waitFor();
  check("a gap opens Add training with the person and ticket filled in",
    (await drawer.getByLabel("Ticket or qualification").inputValue()) === "PASMA" &&
    (await drawer.getByLabel("Person").locator("option:checked").textContent()) === WHO);
  await drawer.getByRole("button", { name: "Add training" }).click();
  await drawer.getByRole("heading", { name: `${WHO} · PASMA` }).waitFor();
  await closeDrawer();
  check("the new ticket fills the gap", (await cell(WHO, "PASMA").textContent()) === "No expiry");
  await page.getByLabel("Tickets", { exact: true }).selectOption("chosen");
  await page.getByRole("group", { name: "Tickets to show" }).getByLabel("SMSTS").uncheck();
  check("chosen tickets limit the columns", (await cell(WHO, "SMSTS").count()) === 0 && (await cell(WHO, "PASMA").count()) === 1);
  await page.getByLabel("Search people on the matrix").fill(WHO);
  check("matrix search finds the person", (await matrix.locator("tbody tr").count()) === 1);
  await shot(page, "02-matrix");

  // Report: A4 landscape PDF.
  await page.getByLabel("Tickets", { exact: true }).selectOption("on_file");
  await page.getByRole("button", { name: "Create report" }).click();
  await page.getByLabel("Add the company accreditations").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create report" }).click();
  await page.getByRole("link", { name: "Open full screen" }).waitFor();
  const href = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const res = await page.request.get(`${BASE}${href}`);
  const ok = res.ok() && (res.headers()["content-type"] ?? "").includes("pdf");
  const size = ok ? (await PDFDocument.load(await res.body())).getPage(0).getSize() : { width: 0, height: 0 };
  check("report is an A4 landscape PDF", ok && Math.round(size.width) === 842 && Math.round(size.height) === 595, `${Math.round(size.width)}x${Math.round(size.height)}`);
  await shot(page, "03-report");
  await page.getByRole("button", { name: "Close" }).last().click();

  // Clean up: delete the three records (in-app are-you-sure), then mark the person as left.
  await page.getByRole("tab", { name: /^Training records/ }).click();
  await page.getByLabel("Search training").fill(WHO);
  await page.getByLabel("Show replaced records").check();
  for (let i = 0; i < 3; i++) {
    await list.getByRole("button").first().click();
    await drawer.getByRole("button", { name: "Delete this record" }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  }
  check("training records deleted", (await list.getByRole("button").count()) === 0);
  await page.goto(`${BASE}/settings/people`);
  await page.getByLabel("Search people").fill(WHO);
  await page.getByText(WHO).first().click();
  await drawer.getByLabel("Still works here").uncheck();
  await drawer.getByRole("button", { name: "Save" }).click();
  await page.waitForTimeout(500);
  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
