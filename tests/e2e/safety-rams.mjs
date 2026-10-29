// RAMS check: create from a job type, edit, issue (PDF), sign on in the office and on the crew page,
// the signed copy, a new revision superseding the old, Save as job type, Templates, and a
// subcontractor RAMS (upload and review). Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234),
// test job 12 at Approved, the RAMS job types seeded (scripts/seed/dev-rams-job-types.sql) and
// TEAM_LINK_KEY set. Uses fake ZZ data only.
// Usage: node tests/e2e/safety-rams.mjs [screenshot-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
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
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });
const stamp = Date.now().toString(36);
// Pages stream in: wait for the RAMS heading before counting anything on them.
const ready = (p) => p.getByRole("heading", { name: /^(Subcontractor )?RAMS( 12-\d+( rev \d+)?)?$/, level: 1 }).first().waitFor();

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "en-GB" })).newPage();
let popups = 0;
page.on("dialog", async (d) => { popups++; await d.dismiss(); });

async function sign(p, scope, name) {
  await scope.getByLabel("Your name").selectOption({ label: "Not listed: type my name" });
  await scope.getByLabel("Your full name").fill(name);
  const canvas = scope.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const b = await canvas.boundingBox();
  await p.mouse.move(b.x + 20, b.y + 20);
  await p.mouse.down();
  await p.mouse.move(b.x + 120, b.y + 50, { steps: 8 });
  await p.mouse.move(b.x + 200, b.y + 25, { steps: 8 });
  await p.mouse.up();
  await scope.getByRole("checkbox").check();
  await scope.getByRole("button", { name: /^Sign/ }).click();
  await scope.getByRole("status").filter({ hasText: `${name} has signed` }).waitFor({ timeout: 30000 });
}

try {
  await page.goto(`${BASE}/sign-in?next=/jobs/12/rams`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/jobs/12/rams`);
  await page.getByRole("heading", { name: "RAMS", level: 1 }).waitFor();
  check("Job > RAMS opens on job 12", true);
  check("Needs attention panel on the page", await page.getByRole("complementary", { name: "Needs attention" }).isVisible());

  // + New > CBS RAMS from a job type
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: /CBS RAMS/ }).click();
  const jt = page.getByLabel(/Job type/);
  check("job types listed in Create RAMS", (await jt.locator("option").count()) >= 13);
  await jt.selectOption({ label: "Plumbing repairs & alterations" });
  await page.getByRole("button", { name: "Create RAMS", exact: true }).click();
  await page.waitForURL(/\/jobs\/12\/rams\/\d+$/);
  const ramsUrl = page.url();
  await page.getByRole("heading", { name: /^RAMS 12-\d+ rev 1$/ }).waitFor();
  check("draft created from the job type", (await page.getByText("Draft", { exact: true }).count()) >= 1);
  const steps = await page.getByRole("group", { name: /^Step \d+$/ }).count();
  check("job type steps plus standard opening and closing steps", steps === 4 + 3 + 2, String(steps));
  const hz = await page.getByRole("group", { name: /^Hazard / }).count();
  check("job type hazards in the register", hz >= 5, String(hz));
  await shot(page, "01-rams-draft");

  // Issue refuses until it's complete
  await page.getByRole("button", { name: "Issue RAMS" }).click();
  await page.getByRole("alert").filter({ hasText: "Before it can be issued" }).waitFor();
  check("issue lists what's missing", (await page.getByRole("alert").filter({ hasText: "approved by" }).count()) === 1);

  // Edit: title, scope, a step, a new hazard (also to the library), people
  await page.getByLabel("Activity", { exact: true }).fill(`ZZ Test plumbing ${stamp}`);
  await page.getByLabel("Description of works").fill("ZZ test: replace the kitchen sink waste.");
  const before = await page.getByRole("group", { name: /^Step \d+$/ }).count();
  await page.getByRole("button", { name: "Add step (the task)" }).click();
  check("Add step adds a step", (await page.getByRole("group", { name: /^Step \d+$/ }).count()) === before + 1);
  const added = page.getByRole("group", { name: "Step 8", exact: true });
  await added.getByLabel("Task", { exact: true }).fill("ZZ test step: tidy up the waste pipe");
  await page.getByRole("button", { name: "Move step 8 up" }).click();
  check("step moves up", (await page.getByRole("group", { name: "Step 7", exact: true }).locator("textarea").first().inputValue()).startsWith("ZZ test step"));
  await page.getByRole("button", { name: "+ Add hazard" }).click();
  const nh = page.getByRole("group", { name: "New hazard" });
  await nh.getByLabel("Hazard", { exact: true }).fill(`ZZ Test hazard ${stamp}`);
  await nh.getByLabel("Harm", { exact: true }).fill("ZZ harm");
  await nh.getByRole("checkbox", { name: "Also add to the hazards library" }).check();
  await nh.getByRole("button", { name: "Add hazard" }).click();
  await page.getByRole("group", { name: `Hazard ZZ Test hazard ${stamp}` }).waitFor();
  check("new hazard added to the register", true);
  await page.getByLabel("Prepared by").selectOption({ label: "Test Office One" });
  await page.getByLabel("Approved by").selectOption({ label: "Test Office Two" });
  await page.getByLabel("Approver's role").fill("ZZ Director");
  await page.getByRole("button", { name: "Save draft" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.reload();
  await ready(page);
  check("draft saves and reloads", (await page.getByLabel("Activity", { exact: true }).inputValue()) === `ZZ Test plumbing ${stamp}`);
  check("moved step kept its place", (await page.getByRole("group", { name: "Step 7", exact: true }).locator("textarea").first().inputValue()).startsWith("ZZ test step"));

  // Issue: PDF in the job's RAMS folder
  await page.getByRole("button", { name: "Issue RAMS" }).click();
  await page.getByText(/rev 1 issued\./).waitFor({ timeout: 30000 });
  check("RAMS issued", (await page.getByText("Issued", { exact: true }).count()) >= 1);
  check("issued RAMS can't be edited", await page.getByLabel("Activity", { exact: true }).isDisabled());
  await page.getByRole("button", { name: "Open PDF" }).click();
  const dlg = page.getByRole("dialog");
  check("PDF opens in-window", (await dlg.getByText(/Job 12 - RAMS 12-\d+ rev 1 - ZZ Test plumbing/).count()) >= 1);
  const full = await dlg.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const fileId = full.match(/\/files\/(\d+)/)[1];
  const pdf = await page.request.get(`${BASE}/api/files/${fileId}/content`);
  check("issued file is a PDF", pdf.ok() && (await pdf.body()).subarray(0, 4).toString() === "%PDF");
  await dlg.getByRole("button", { name: "Close" }).click();
  await shot(page, "02-rams-issued");

  // Sign on in the office
  await page.getByRole("button", { name: "Sign on (this device)" }).click();
  await sign(page, page.getByRole("dialog"), `ZZ Office Signer ${stamp}`);
  await page.keyboard.press("Escape");
  await page.reload();
  await ready(page);
  check("office sign-on listed", (await page.getByText(`ZZ Office Signer ${stamp}`).count()) === 1);
  check("signed copy made", (await page.getByRole("button", { name: "Open signed copy" }).count()) === 1, String(await page.getByRole("button", { name: "Open signed copy" }).count()));

  // Crew page: the issued RAMS is there to sign
  await page.goto(`${BASE}/jobs/12/sign-ons`);
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Crew page link/ }).click();
  const link = await page.getByLabel("Crew page link").inputValue();
  const crew = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await crew.goto(link);
  const doc = crew.getByText(new RegExp(`RAMS 12-\\d+ rev 1: ZZ Test plumbing ${stamp}`)).first();
  await doc.waitFor();
  check("crew page lists the issued RAMS", true);
  await crew.getByRole("region", { name: "To sign" }).getByRole("button", { name: new RegExp(`ZZ Test plumbing ${stamp}`) }).click();
  await sign(crew, crew.getByRole("region", { name: /^Sign RAMS/ }), `ZZ Crew Signer ${stamp}`);
  await shot(crew, "03-crew-signed");
  await page.goto(ramsUrl);
  await ready(page);
  check("crew sign-on listed on the RAMS", (await page.getByText(`ZZ Crew Signer ${stamp}`).count()) === 1);
  check("signed count 2", (await page.getByRole("heading", { name: "Signed on to rev 1 (2)" }).count()) === 1, (await page.getByRole("heading", { name: /Signed on to/ }).allTextContents()).join(";"));

  // Save as job type
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Save as job type/ }).click();
  await page.getByLabel("Job type name").fill(`ZZ Test job type ${stamp}`);
  await page.getByRole("button", { name: "Save job type" }).click();
  await page.getByText(`Saved as the job type "ZZ Test job type ${stamp}".`).waitFor();
  check("saved as a job type", true);

  // New revision supersedes rev 1 once issued
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Create new revision/ }).click();
  await page.getByRole("heading", { name: /^RAMS 12-\d+ rev 2$/ }).waitFor();
  await page.reload();
  await ready(page);
  await page.getByLabel("Approved by").selectOption({ label: "Test Office Two" });
  await page.getByRole("button", { name: "Issue RAMS" }).click();
  await page.getByText(/rev 2 issued\./).waitFor({ timeout: 30000 });
  check("rev 2 issued", true);
  await page.getByRole("navigation", { name: "Revisions" }).getByText("Rev 1 (Superseded)").waitFor();
  check("revisions listed", true);
  check("rev 2 has nobody signed yet", (await page.getByRole("heading", { name: "Signed on to rev 2 (0)" }).count()) === 1);
  await page.goto(`${BASE}/jobs/12/rams`);
  await ready(page);
  check("list shows rev 2 issued", (await page.getByRole("row", { name: new RegExp(`rev 2.*ZZ Test plumbing ${stamp}`) }).count()) === 1);
  await page.getByRole("button", { name: /All revisions/ }).click();
  check("rev 1 superseded", (await page.getByRole("row", { name: new RegExp(`rev 1.*ZZ Test plumbing ${stamp}.*Superseded`) }).count()) === 1);
  await shot(page, "04-rams-list");

  // Templates: the saved job type, open it, rename, retire
  await page.goto(`${BASE}/safety/templates`);
  await page.getByRole("heading", { name: "Templates", level: 1 }).waitFor();
  await page.getByRole("table").waitFor();
  check("Templates in the Health and safety menu", (await page.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Templates" }).count()) === 1);
  check("seeded job types listed", (await page.getByRole("row", { name: /Resin floor/ }).count()) === 1);
  await page.getByRole("row", { name: new RegExp(`ZZ Test job type ${stamp}`) }).click();
  await page.waitForURL(/\/safety\/templates\/rams\/\d+$/);
  await page.getByLabel("Job type name").waitFor();
  const tsteps = await page.getByRole("group", { name: /^Step \d+$/ }).count();
  check("job type keeps the task steps only", tsteps === 4, String(tsteps));
  await page.getByLabel("Job type name").fill(`ZZ Test job type ${stamp} renamed`);
  await page.getByRole("button", { name: "Save job type" }).click();
  await page.getByRole("status").filter({ hasText: "Saved." }).waitFor();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Retire job type/ }).click();
  await page.getByRole("status").filter({ hasText: "Retired." }).waitFor();
  await page.goto(`${BASE}/jobs/12/rams`);
  await ready(page);
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: /CBS RAMS/ }).click();
  check("retired job type not offered", (await page.getByLabel(/Job type/).locator("option", { hasText: `ZZ Test job type ${stamp}` }).count()) === 0);
  await page.getByRole("button", { name: "Cancel" }).click();

  // Subcontractor RAMS: add a new subcontractor from the dropdown, upload, reject then approve
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: /Subcontractor RAMS/ }).click();
  await page.getByRole("dialog").locator("select").first().selectOption({ label: "+ Add a new subcontractor…" });
  await page.getByLabel(/company name/).fill(`ZZ Test Sparks ${stamp}`);
  await page.getByLabel("What it covers").fill("ZZ electrical first fix");
  await page.getByRole("button", { name: "Add subcontractor RAMS" }).click();
  await page.waitForURL(/\/jobs\/12\/rams\/\d+$/);
  await page.getByRole("heading", { name: /^Subcontractor RAMS 12-\d+$/ }).waitFor();
  check("subcontractor RAMS created with a new subcontractor", (await page.getByText(`ZZ Test Sparks ${stamp}`).count()) >= 1);
  const file = path.join(os.tmpdir(), `zz-sub-rams-${stamp}.txt`);
  writeFileSync(file, "ZZ fake subcontractor RAMS");
  await page.locator('input[type="file"]').setInputFiles(file);
  await page.getByText("File added. Review it, then approve or reject.").waitFor({ timeout: 30000 });
  check("file uploaded", (await page.getByRole("button", { name: /^Open zz-sub-rams/ }).count()) === 1);
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByRole("alert").filter({ hasText: "Say why" }).waitFor();
  check("reject needs a note", true);
  await page.getByLabel(/Review note/).fill("ZZ needs the method for working at height");
  await page.getByRole("button", { name: "Reject" }).click();
  await page.getByText("Rejected", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByText("Approved", { exact: true }).waitFor();
  check("approved after review", true);
  await shot(page, "05-sub-rams");

  // Delete it (in-app are-you-sure)
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirm = page.getByRole("dialog").filter({ hasText: /Delete Subcontractor RAMS/ });
  await confirm.waitFor();
  check("delete asks first, in-app", true);
  await confirm.getByRole("button", { name: "Delete" }).click();
  await page.waitForURL(`${BASE}/jobs/12/rams`);
  check("deleted", true);

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
