// Policy and manual end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100)
// on the local dev database with the local seed (Test Office One, PIN 1234) and FILE_STORAGE=local.
// Issues fake documents named "ZZ Test …" (issued documents stay on record; only drafts can be
// deleted) and turns Test Office One's "Issue H&S policy" tick off again at the end.
// Usage: node tests/e2e/safety-policy.mjs [screenshot-dir]
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
const RUN = String(Date.now()).slice(-5);
const ISSUE = `ZZ Test ${RUN}`;

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
let popups = 0;
page.on("dialog", async (d) => {
  popups++;
  await d.dismiss();
});
const rows = (text) => page.locator("main tbody tr").filter({ hasText: text });

async function setIssueTick(on) {
  await page.goto(`${BASE}/people`);
  await page.locator("main tbody tr").filter({ hasText: "Test Office One" }).first().getByRole("button").first().click();
  const d = page.getByRole("dialog", { name: "Test Office One" });
  const box = d.getByLabel(/^Issue H&S policy/);
  if ((await box.isChecked()) !== on) {
    await box.setChecked(on);
    await d.getByRole("button", { name: "Save", exact: true }).first().click();
    await page.waitForTimeout(1500);
    // Saved: the tick is still as set after a reload.
    await page.reload();
    await page.locator("main tbody tr").filter({ hasText: "Test Office One" }).first().getByRole("button").first().click();
    if ((await page.getByRole("dialog", { name: "Test Office One" }).getByLabel(/^Issue H&S policy/).isChecked()) !== on) throw new Error("The Issue H&S policy tick didn't save");
  }
  await page.goto(`${BASE}/safety/policy`);
}

async function fileOf(viewerButton) {
  await viewerButton.click();
  const href = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  const id = /\/files\/(\d+)/.exec(href)?.[1];
  const res = await page.request.get(id ? `${BASE}/api/files/${id}/content` : new URL(href, BASE).toString());
  await page.getByRole("dialog").last().getByRole("button", { name: "Close" }).first().click();
  const body = await res.body();
  return { isPdf: body.subarray(0, 5).toString() === "%PDF-", body, name: decodeURIComponent((res.headers()["content-disposition"] || "").split("''")[1] || "") };
}

async function sign() {
  const c = page.getByRole("img", { name: "Your signature" });
  await c.scrollIntoViewIfNeeded();
  const b = await c.boundingBox();
  await page.mouse.move(b.x + 30, b.y + 100);
  await page.mouse.down();
  for (const [x, y] of [[80, 40], [130, 110], [190, 50], [250, 100]]) await page.mouse.move(b.x + x, b.y + y, { steps: 5 });
  await page.mouse.up();
}

try {
  await page.goto(`${BASE}/sign-in?next=/safety/policy`);
  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/safety/policy`);
  await setIssueTick(false);

  const menu = page.getByRole("navigation", { name: "Main menu" });
  check("menu: Health and safety > Policy and manual is highlighted", (await menu.getByRole("link", { name: "Policy and manual" }).getAttribute("aria-current")) === "page");
  await page.getByRole("complementary", { name: "Needs attention" }).waitFor();
  check("Needs attention panel is on the page", true);

  /* ---------- A policy draft ---------- */
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Policy statement issue" }).click();
  let drawer = page.getByRole("dialog", { name: "New H&S policy statement issue" });
  const paras = drawer.getByRole("textbox", { name: /^Paragraph \d+$/ });
  const start = await paras.count();
  check("a new policy starts with the wording (12 paragraphs, or the issued policy's)", start >= 1, String(start));
  await drawer.getByLabel("Issue name").fill(ISSUE);
  await drawer.getByRole("button", { name: `Remove paragraph ${start}` }).click();
  await drawer.getByRole("button", { name: "Add paragraph" }).click();
  await paras.last().fill("ZZ test paragraph: everyone follows the site rules.");
  check("paragraphs can be removed and added (no pop-up)", (await paras.count()) === start);
  await drawer.getByLabel("Signed by").selectOption({ label: "Test Office One" });
  await shot(page, "01-policy-draft");
  await drawer.getByRole("button", { name: "Create draft" }).dblclick();
  drawer = page.getByRole("dialog", { name: `H&S policy statement ${ISSUE}` });
  await drawer.waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  check("double click creates the draft once", (await rows(ISSUE).count()) === 1, String(await rows(ISSUE).count()));
  check("only people with the tick can issue", (await drawer.getByText(/Only people with the "Issue H&S policy" tick/).count()) === 1);

  await drawer.getByRole("button", { name: "Open preview" }).click();
  const prevHref = await page.getByRole("link", { name: "Open full screen" }).getAttribute("href");
  await page.getByRole("dialog").last().getByRole("button", { name: "Close" }).first().click();
  const prev = await page.request.get(new URL(prevHref, BASE).toString());
  const prevBody = await prev.body();
  check("draft preview is a PDF", prevBody.subarray(0, 5).toString() === "%PDF-");

  /* ---------- Issue it (with the tick, signing now) ---------- */
  await setIssueTick(true);
  await rows(ISSUE).first().click();
  drawer = page.getByRole("dialog", { name: `H&S policy statement ${ISSUE}` });
  const signNow = drawer.getByRole("button", { name: "Sign now" });
  if (await signNow.count()) await signNow.click();
  check("Issue is disabled until signed", await drawer.getByRole("button", { name: "Issue policy statement" }).isDisabled());
  await sign();
  await drawer.getByLabel("Save this as my signature").setChecked(true);
  await shot(page, "02-policy-issue");
  await drawer.getByRole("button", { name: "Issue policy statement" }).dblclick();
  await drawer.getByRole("button", { name: "Open policy statement" }).waitFor({ timeout: 20000 });
  check("issued (once, even with a double click)", (await rows(ISSUE).first().getByText("Issued", { exact: true }).count()) === 1);
  let file = await fileOf(drawer.getByRole("button", { name: "Open policy statement" }));
  check("issued policy is a PDF named as live", file.isPdf && file.name === `CBS H&S Policy General Statement - ${ISSUE}.pdf`, file.name);
  check("issued policy can't be edited", (await drawer.getByRole("button", { name: /^Save/ }).count()) === 0);

  /* ---------- Next issue: copies the wording, uses the saved signature, supersedes the last ---------- */
  await drawer.getByRole("button", { name: "Start the next issue" }).click();
  drawer = page.getByRole("dialog", { name: "New H&S policy statement issue" });
  check("next issue starts from the issued wording", (await paras.last().inputValue()) === "ZZ test paragraph: everyone follows the site rules.");
  await drawer.getByLabel("Issue name").fill(`${ISSUE} b`);
  await drawer.getByRole("button", { name: "Create draft" }).click();
  drawer = page.getByRole("dialog", { name: `H&S policy statement ${ISSUE} b` });
  await drawer.getByRole("button", { name: "Use my saved signature" }).click();
  await drawer.getByRole("button", { name: "Issue policy statement" }).click();
  await drawer.getByRole("button", { name: "Open policy statement" }).waitFor({ timeout: 20000 });
  await drawer.getByRole("button", { name: "Close" }).first().click();
  check("the earlier issue is now Superseded", (await rows(ISSUE).filter({ hasNotText: `${ISSUE} b` }).first().innerText()).includes("Superseded"));
  check("only one issued policy", (await page.locator("main tbody tr").filter({ hasText: "H&S policy statement" }).filter({ has: page.getByText("Issued", { exact: true }) }).count()) === 1);

  /* ---------- Manual: PDF only ---------- */
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Manual issue" }).click();
  drawer = page.getByRole("dialog", { name: "New H&S manual issue" });
  await drawer.getByLabel("Issue name").fill(ISSUE);
  await drawer.getByRole("button", { name: "Create draft" }).click();
  drawer = page.getByRole("dialog", { name: `H&S manual ${ISSUE}` });
  await drawer.waitFor();
  check("a manual can't be issued without its PDF", (await drawer.getByText(/Save the draft with the manual PDF first/).count()) === 1);
  const txt = path.join(tmpdir(), `zz-manual-${RUN}.txt`);
  writeFileSync(txt, "not a pdf");
  await drawer.locator('input[type="file"]').setInputFiles(txt);
  await drawer.getByText("The manual must be a PDF. Choose the PDF of the manual.").waitFor();
  check("a non-PDF manual is refused", true);
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const pdfPath = path.join(tmpdir(), `zz-manual-${RUN}.pdf`);
  writeFileSync(pdfPath, await doc.save());
  await drawer.locator('input[type="file"]').setInputFiles(pdfPath);
  await drawer.getByRole("button", { name: `CBS H&S Manual - ${ISSUE}.pdf` }).waitFor({ timeout: 15000 });
  check("the manual PDF uploads, named as live", true);
  await drawer.getByRole("button", { name: "Issue manual" }).click();
  await drawer.getByRole("button", { name: "Open manual" }).waitFor({ timeout: 15000 });
  file = await fileOf(drawer.getByRole("button", { name: "Open manual" }));
  check("issued manual opens as a PDF", file.isPdf);
  await drawer.getByRole("button", { name: "Close" }).first().click();
  check("issued manual leaves 'not issued' out of Needs attention", (await page.getByRole("complementary", { name: "Needs attention" }).getByText("No manual has been issued.").count()) === 0);

  /* ---------- A draft can be deleted (in-app are-you-sure) ---------- */
  await page.getByRole("button", { name: "+ New", exact: true }).click();
  await page.getByRole("menuitem", { name: "Manual issue" }).click();
  drawer = page.getByRole("dialog", { name: "New H&S manual issue" });
  await drawer.getByLabel("Issue name").fill(`${ISSUE} draft`);
  await drawer.getByRole("button", { name: "Create draft" }).click();
  drawer = page.getByRole("dialog", { name: `H&S manual ${ISSUE} draft` });
  await drawer.getByRole("button", { name: "Delete draft" }).click();
  await page.getByRole("dialog", { name: /^Delete the draft/ }).getByRole("button", { name: "Delete draft" }).click();
  await page.waitForTimeout(800);
  check("draft deleted after the in-app are-you-sure", (await rows(`${ISSUE} draft`).count()) === 0);
  await shot(page, "03-policy-list");

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message.split("\n").slice(0, 3).join(" "));
  await shot(page, "99-error");
} finally {
  await setIssueTick(false).catch(() => {});
  await browser.close();
}
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
