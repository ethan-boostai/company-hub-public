// Insurance and accreditations end-to-end check. Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234).
// Creates fake records named "ZZ Test …" (and a ZZ vehicle) and deletes them again.
// Usage: node tests/e2e/registers-insurance.mjs [screenshot-dir]
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
const ukDate = (n) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date(Date.now() + n * 86_400_000));
const plus = ukDate;

const RUN = String(Date.now()).slice(-5);
const POLICY = `ZZ Test PL ${RUN}`;
const TITLE = `Public liability - ${POLICY}`;
const REG = `ZZ${RUN}C`;
const CERT_LIST = `ZZ Test Scheme ${RUN}`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const drawer = page.getByRole("dialog").first();
const attention = page.getByTestId("attention");
const closeDrawer = () => page.getByRole("button", { name: "Close", exact: true }).first().click();

try {
  await page.goto(`${BASE}/sign-in?next=/insurance`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/insurance`);
  check("Insurance and accreditations is in the left menu", await page.getByRole("link", { name: "Insurance and accreditations" }).isVisible());

  /* ---------- Policy with two covers ---------- */
  await page.getByRole("button", { name: "Add policy" }).click();
  await drawer.getByLabel("Type of policy").selectOption("Public liability");
  await drawer.getByLabel("Name (optional)").fill(POLICY);
  await drawer.getByLabel("Insurer").fill("ZZ Test Insurer");
  await drawer.getByLabel("Policy number").fill(`PL-${RUN}`);
  await drawer.getByLabel("Starts").fill(plus(-340));
  await drawer.getByLabel("Expires").fill(plus(25));
  await drawer.getByLabel("Cover 1").selectOption("Public liability");
  await drawer.getByLabel("Limit (£)").first().fill("£5,000,000");
  await drawer.getByLabel("Excess (£)").first().fill("250");
  await drawer.getByRole("button", { name: "Add cover" }).click();
  await drawer.getByLabel("Cover 2").selectOption("Employer's liability");
  await drawer.getByLabel("Limit (£)").nth(1).fill("10000000");
  await drawer.getByRole("button", { name: "Add policy" }).dblclick(); // a double click must save once
  await drawer.getByRole("heading", { name: TITLE }).waitFor();
  check("policy saved with its covers", (await drawer.getByTestId("cover-line").count()) === 2);
  check("policy shows days left", await drawer.getByText("25 days left").isVisible());
  const htmlOverflow = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  check("page behind the drawer doesn't scroll", htmlOverflow === "hidden", htmlOverflow);

  const tmp = path.join(tmpdir(), "zz-test-schedule.txt");
  writeFileSync(tmp, "test schedule");
  const chooser = page.waitForEvent("filechooser");
  await drawer.getByRole("button", { name: "Upload file" }).click();
  await (await chooser).setFiles(tmp);
  await drawer.getByText("zz-test-schedule.txt").waitFor();
  check("file uploaded to the policy", true);
  await shot(page, "01-policy");
  await closeDrawer();
  check("expiring policy is in Needs attention", (await attention.getByText(TITLE).count()) === 1);
  check("only one policy was saved", (await page.getByTestId("policy-list").getByText(TITLE).count()) === 1);

  /* ---------- Renewal ---------- */
  await page.getByTestId("policy-list").getByText(TITLE).click();
  await drawer.getByRole("button", { name: "Add renewal" }).click();
  await drawer.getByRole("heading", { name: `Add renewal · ${TITLE}` }).waitFor();
  check("renewal starts the day after the old period", (await drawer.getByLabel("Starts").inputValue()) === plus(26));
  check("renewal copies the covers", (await drawer.getByTestId("cover-line").count()) === 2);
  await drawer.getByLabel("Policy number").fill(`PL-${RUN}-2`);
  await drawer.getByRole("button", { name: "Add renewal" }).last().click();
  await drawer.getByRole("heading", { name: TITLE }).waitFor();
  await drawer.getByText("All periods").waitFor();
  check("renewal saved and both periods listed", (await drawer.getByRole("button", { name: /to/ }).filter({ hasText: "Earlier period" }).count()) === 1);
  await closeDrawer();
  check("renewed policy leaves Needs attention", (await attention.getByText(TITLE).count()) === 0);
  check("policy list shows the current period only", (await page.getByTestId("policy-list").getByText(TITLE).count()) === 1);
  await page.getByLabel("Show earlier periods").check();
  check("earlier periods can be shown", (await page.getByTestId("policy-list").getByText(TITLE).count()) === 2);
  await page.getByTestId("policy-list").getByRole("button").filter({ hasText: "Earlier period" }).filter({ hasText: TITLE }).click();
  check("an earlier period can't be renewed again", (await drawer.getByRole("button", { name: "Add renewal" }).count()) === 0);
  await closeDrawer();
  await page.getByLabel("Show earlier periods").uncheck();

  /* ---------- Claim from a vehicle ---------- */
  await page.goto(`${BASE}/fleet`);
  await page.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByLabel("Registration").fill(REG);
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  await drawer.getByText("No claims.").waitFor();
  check("vehicle drawer has a Claims list", true);
  await drawer.getByRole("link", { name: "Add claim" }).click();
  await page.waitForURL(/\/insurance\?add=claim&vehicle=\d+/);
  await drawer.getByRole("heading", { name: "Add claim" }).waitFor();
  check("new claim opens with the vehicle and type filled in",
    (await drawer.getByLabel("Type of claim").inputValue()) === "Vehicle" && (await drawer.getByLabel("Vehicle", { exact: true }).locator("option:checked").textContent()).startsWith(REG));
  await drawer.getByLabel("What happened").fill("Test only: van scraped in a car park");
  await drawer.getByText("Lodged", { exact: true }).click();
  await drawer.getByLabel("Our policy").selectOption({ label: `${TITLE} (ZZ Test Insurer)` });
  await drawer.getByLabel("Claimed (£)").fill("1,200");
  await drawer.getByLabel("ServiceM8 job number").fill("12");
  await drawer.getByLabel("Next action", { exact: true }).fill("Chase insurer");
  await drawer.getByLabel("Due by").fill(plus(-1));
  await drawer.getByRole("button", { name: "Add claim" }).dblclick();
  const heading = drawer.getByRole("heading", { name: /^CLM-\d{3,} · Vehicle$/ });
  await heading.waitFor();
  const claimNo = (await heading.textContent()).split(" ")[0];
  check("claim saved with an automatic CLM number", /^CLM-\d{3,}$/.test(claimNo), claimNo);
  await closeDrawer();
  check("overdue claim is in Needs attention", (await attention.getByText(`${claimNo} Vehicle`).count()) === 1);
  await shot(page, "02-claims");

  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG.toLowerCase());
  await page.getByText(REG).first().click();
  await drawer.getByRole("link", { name: new RegExp(claimNo) }).waitFor();
  check("vehicle drawer lists the claim", true);
  await drawer.getByRole("link", { name: new RegExp(claimNo) }).click();
  await page.waitForURL(/\/insurance\?claim=\d+/);
  await drawer.getByRole("heading", { name: `${claimNo} · Vehicle` }).waitFor();
  check("claim opens from the vehicle", true);

  // Settle it: the closed date fills in and it leaves the open list.
  await drawer.getByText("Settled", { exact: true }).click();
  await drawer.getByLabel("Settled (£)").fill("950");
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText(/^Closed \d/).waitFor();
  check("settling a claim sets the closed date", true);
  await closeDrawer();
  check("settled claim leaves Needs attention", (await attention.getByText(`${claimNo} Vehicle`).count()) === 0);
  await page.getByRole("tab", { name: /^Claims/ }).click();
  check("open claims list hides it", (await page.getByTestId("claim-list").getByText(claimNo).count()) === 0);
  await page.getByLabel("Which claims").selectOption("all");
  await page.getByLabel("Search claims").fill("car park");
  check("all claims list and search find it", (await page.getByTestId("claim-list").getByText(claimNo).count()) === 1);

  /* ---------- Accreditation ---------- */
  await page.getByRole("tab", { name: /^Accreditations/ }).click();
  await page.getByRole("button", { name: "Add accreditation" }).click();
  await drawer.getByLabel("Accreditation").selectOption({ label: "+ Add new…" });
  await drawer.getByLabel("New accreditation").fill(CERT_LIST);
  await drawer.getByRole("button", { name: "Add", exact: true }).click();
  await drawer.getByLabel("New accreditation").waitFor({ state: "detached" });
  await drawer.getByLabel("Renews or expires").fill(plus(40));
  await drawer.getByLabel("Account contact and login notes").fill("login test@example.com password: hunter2");
  await drawer.getByRole("button", { name: "Add accreditation" }).click();
  await drawer.getByText("Don't save passwords here. Keep them in the password manager.").waitFor();
  check("passwords refused in contact notes", true);
  await drawer.getByLabel("Accreditation").selectOption(CERT_LIST);
  await drawer.getByLabel("Renews or expires").fill(plus(40));
  await drawer.getByLabel("Account contact and login notes").fill("login test@example.com");
  await drawer.getByLabel("Annual cost (£)").fill("£450");
  await drawer.getByRole("button", { name: "Add accreditation" }).click();
  await drawer.getByRole("heading", { name: CERT_LIST }).waitFor();
  check("accreditation saved (with a new name added from the dropdown)", await drawer.getByText("40 days left").isVisible());
  await closeDrawer();
  check("expiring accreditation is in Needs attention", (await attention.getByText(CERT_LIST).count()) === 1);

  /* ---------- Report ---------- */
  await page.getByRole("button", { name: "Create report" }).click();
  await page.getByLabel("All claims").check();
  await page.getByLabel("Show annual costs").check();
  await page.getByRole("dialog").getByRole("button", { name: "Create report" }).click();
  await page.getByRole("link", { name: "Open full screen" }).waitFor();
  const href = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const res = await page.request.get(`${BASE}${href}`);
  check("report is a PDF", res.ok() && (res.headers()["content-type"] ?? "").includes("pdf"));
  await shot(page, "03-report");
  await page.getByRole("button", { name: "Close" }).last().click();

  /* ---------- Clean up (in-app are-you-sure) ---------- */
  const del = async (name) => {
    await drawer.getByRole("button", { name }).click();
    await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
    await drawer.waitFor({ state: "detached" });
  };
  await page.getByTestId("cert-list").getByText(CERT_LIST).click();
  await del(`Delete ${CERT_LIST}`);
  await page.getByRole("tab", { name: /^Claims/ }).click();
  await page.getByLabel("Which claims").selectOption("all");
  await page.getByTestId("claim-list").getByText(claimNo).click();
  await del(`Delete ${claimNo}`);
  await page.getByRole("tab", { name: /^Policies/ }).click();
  await page.getByLabel("Show earlier periods").check();
  for (let i = 0; i < 2; i++) {
    await page.getByTestId("policy-list").getByText(TITLE).first().click();
    await del("Delete this policy period");
  }
  check("policies, claim and accreditation deleted", (await page.getByTestId("policy-list").getByText(TITLE).count()) === 0);
  await page.goto(`${BASE}/fleet`);
  await page.getByLabel("Search vehicles").fill(REG.toLowerCase());
  await page.getByText(REG).first().click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await drawer.waitFor({ state: "detached" });
  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(page, "error");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
