// Phase 0 end-to-end check. Needs the app running (BASE_URL, default http://localhost:3100) on the
// local dev database with the local seed (Test Office One / Two, PIN 1234).
// Usage: node tests/e2e/phase0.mjs [screenshot-dir]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

// Playwright is installed globally in the dev environment (not a project dependency).
const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await ctx.newPage();
let browserPopups = 0;
page.on("dialog", async (d) => {
  browserPopups++;
  await d.dismiss();
});

async function signIn(p, name, pin) {
  await p.goto(`${BASE}/sign-in`);
  await p.getByRole("button", { name }).click();
  await p.locator("#pin").fill(pin);
  await p.getByRole("button", { name: "Sign in" }).click();
}

try {
  // Signed out: any page goes to sign-in.
  await page.goto(`${BASE}/settings/people`);
  check("signed-out visit goes to sign-in", page.url().includes("/sign-in?next=%2Fsettings%2Fpeople"), page.url());
  await shot(page, "01-sign-in");

  await page.getByRole("button", { name: "Test Office One" }).click();
  await page.locator("#pin").fill("0000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("alert").filter({ hasText: "Wrong PIN" }).waitFor();
  check("wrong PIN is refused with an in-app message", true);

  await page.locator("#pin").fill("1234");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/settings/people`);
  check("sign-in returns to the page asked for", true);
  const who = await page.getByTestId("signed-in-name").textContent();
  check("signed-in name shown top right", who === "Test Office One", who);
  await shot(page, "02-people");

  // Shared parts page
  await page.goto(`${BASE}/settings/shared-parts`);
  await page.getByText("1. Save button").waitFor();
  const notes = page.getByTestId("demo-notes").locator("li");
  const before = await notes.filter({ hasNotText: "No test notes." }).count();
  await page.getByLabel("Test note", { exact: true }).fill(`Double click test ${Date.now()}`);
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "Add note" }).dblclick();
  await page.getByText("Saved once.").waitFor({ timeout: 10000 });
  await page.waitForTimeout(1500);
  const after = await notes.filter({ hasNotText: "No test notes." }).count();
  check("double-click Save adds exactly one record", after === before + 1, `${before} -> ${after}`);
  await page.reload();
  const afterReload = await page.getByTestId("demo-notes").locator("li").filter({ hasNotText: "No test notes." }).count();
  check("database has exactly one new record", afterReload === before + 1, `${before} -> ${afterReload}`);

  await page.getByTestId("demo-notes").getByRole("button", { name: "Delete" }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.waitFor();
  check("delete asks in-app first", (await dlg.textContent()).includes("Delete this test note?"));
  await shot(page, "03-confirm");
  await dlg.getByRole("button", { name: "Delete" }).click();
  await dlg.waitFor({ state: "detached" });
  const afterDelete = await page.getByTestId("demo-notes").locator("li").filter({ hasNotText: "No test notes." }).count();
  check("confirmed delete removes the record", afterDelete === before, `${afterDelete}`);

  await page.getByRole("button", { name: "Open drawer" }).click();
  await page.getByRole("dialog", { name: "Test drawer" }).waitFor();
  const locked = await page.evaluate(() => document.documentElement.classList.contains("scroll-locked") && getComputedStyle(document.body).overflow === "hidden");
  const drawerScrolls = await page.evaluate(() => {
    const el = document.querySelector("[data-drawer-body]");
    el.scrollTop = 400;
    return el.scrollTop > 0;
  });
  check("page behind the drawer can't scroll; the drawer can", locked && drawerScrolls);
  await shot(page, "04-drawer");
  await page.keyboard.press("Escape");

  const colour = `Test colour ${Date.now() % 100000}`;
  await page.getByLabel("Test colour", { exact: true }).selectOption("__add_new__");
  await page.getByLabel("New test colour").fill(colour);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForFunction((c) => document.querySelector("select[name=colour]")?.value === c, colour);
  check("dropdown adds a new option and selects it", true);
  await page.reload({ waitUntil: "networkidle" });
  const kept = await page.locator("select[name=colour] option").allTextContents();
  check("a new dropdown option is saved for everyone (still there after a reload)", kept.includes(colour));

  const files = page.getByTestId("demo-files").locator("li");
  const fBefore = await files.filter({ hasNotText: "No test files yet." }).count();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "test-photo.png", mimeType: "image/png", buffer: png });
  const realRows = () => [...document.querySelectorAll('[data-testid="demo-files"] li')].filter((li) => !li.textContent.includes("No test files yet.")).length;
  await page.waitForFunction(`(${realRows.toString()})() > ${fBefore}`, null, { timeout: 15000 });
  const fAfter = await files.filter({ hasNotText: "No test files yet." }).count();
  check("Upload file records one file", fAfter === fBefore + 1, `${fBefore} -> ${fAfter}`);
  await page.locator('input[type="file"]').setInputFiles({ name: "notes.xyz", mimeType: "application/octet-stream", buffer: Buffer.from("any type of file") });
  await page.waitForFunction(`(${realRows.toString()})() > ${fAfter}`, null, { timeout: 15000 });
  check("Upload file accepts any file type", true);

  await files.filter({ hasText: "test-photo.png" }).first().getByRole("button", { name: "Open file" }).click();
  const viewer = page.getByRole("dialog");
  await viewer.locator("img").waitFor();
  const imgOk = await viewer.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0);
  const fullLink = viewer.getByRole("link", { name: "Open full screen" });
  const full = await fullLink.getAttribute("target");
  check("photo opens in-window with 'Open full screen' in a new tab", imgOk && full === "_blank");
  await shot(page, "05-viewer");
  const [tab] = await Promise.all([ctx.waitForEvent("page"), fullLink.click()]);
  await tab.waitForLoadState();
  await tab.locator("img").waitFor({ timeout: 10000 });
  const tabImg = await tab.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0);
  check("'Open full screen' shows the photo on a viewer page, not a download", tabImg && /\/files\/\d+$/.test(tab.url()), tab.url());
  await tab.close();
  await viewer.getByRole("button", { name: "Close" }).click();

  const pdf = await page.request.get(`${BASE}/api/pdf/sample`);
  const pdfBody = await pdf.body();
  check("house PDF sample is a PDF", pdf.headers()["content-type"] === "application/pdf" && pdfBody.subarray(0, 5).toString() === "%PDF-", `${pdfBody.length} bytes`);
  if (SHOTS) writeFileSync(path.join(SHOTS, "06-sample.pdf"), pdfBody);

  // People: add once (double click), set PIN, mark as left
  await page.goto(`${BASE}/settings/people`);
  const name = `Test Person ${Date.now() % 100000}`;
  await page.getByRole("button", { name: "Add person" }).click();
  const drawer = page.getByRole("dialog", { name: "Add person" });
  await drawer.getByLabel("Name").fill(name);
  const roleTag = await drawer.getByLabel("Role").evaluate((el) => el.tagName);
  check("Role is a plain text box", roleTag === "INPUT", roleTag);
  await drawer.getByLabel("Role").fill("Test role");
  await drawer.getByLabel("Can sign in to the hub (office)").check();
  await page.waitForTimeout(300);
  await drawer.getByRole("button", { name: "Add person" }).dblclick();
  await page.getByRole("dialog", { name }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  const rows = await page.locator("main li").filter({ hasText: name }).count();
  check("adding a person with a double click adds one person", rows === 1, String(rows));

  const pd = page.getByRole("dialog", { name });
  await pd.getByLabel("New 4-digit PIN").fill("2468");
  await pd.getByLabel("Type it again").fill("2468");
  await pd.getByRole("button", { name: "Set PIN" }).click();
  await pd.getByText("PIN set.").waitFor();
  check("office can set a PIN", true);
  await pd.getByRole("button", { name: "Mark as left" }).click();
  const cd = page.getByRole("dialog", { name: `Mark ${name} as left?` });
  await cd.waitFor();
  await cd.getByRole("button", { name: "Mark as left" }).click();
  await cd.waitFor({ state: "detached" });
  await page.keyboard.press("Escape");
  const stillListed = await page.locator("main li").filter({ hasText: name }).count();
  check("person marked as left drops off the list", stillListed === 0);

  // Global search
  await page.getByLabel("Search the hub").fill("Test Office");
  await page.getByLabel("Search the hub").press("Enter");
  await page.waitForURL(/\/search\?q=/);
  await page.getByRole("link", { name: "Test Office Two" }).waitFor();
  check("global search finds people", true);

  // Phone width: menu button and narrow drawer, no sticky menu
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const m = await phone.newPage();
  m.on("dialog", async (d) => { browserPopups++; await d.dismiss(); });
  await m.goto(`${BASE}/`);
  const sidebarHidden = await m.locator("aside").isHidden();
  await m.getByRole("button", { name: "Menu" }).click();
  const nav = m.getByRole("dialog", { name: "Main menu" });
  await nav.waitFor();
  const navWidth = await nav.evaluate((el) => el.getBoundingClientRect().width);
  const headerPos = await m.locator("header").evaluate((el) => getComputedStyle(el).position);
  check("phone: menu button opens a narrow drawer; no sticky menu", sidebarHidden && navWidth <= 320 && headerPos !== "sticky" && headerPos !== "fixed", `drawer ${navWidth}px, header ${headerPos}`);
  await shot(m, "07-phone-menu");
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("phone: no sideways page scroll", !overflow);
  await phone.close();

  // Sign out
  await page.goto(`${BASE}/`);
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/sign-in/);
  const back = await page.goto(`${BASE}/settings/people`);
  check("signed out: pages need sign-in again", page.url().includes("/sign-in") && back.ok());

  // Lock-out after 5 wrong PINs
  for (let i = 0; i < 5; i++) {
    await signIn(page, "Test Office Two", "9999");
    await page.getByRole("alert").filter({ hasText: /Wrong PIN/ }).waitFor();
  }
  await signIn(page, "Test Office Two", "1234");
  await page.getByRole("alert").filter({ hasText: "Too many wrong PINs" }).waitFor();
  check("5 wrong PINs lock sign-in, even with the right PIN", true);

  check("no browser pop-ups (alert/confirm/prompt) at any point", browserPopups === 0, String(browserPopups));
} catch (e) {
  await shot(page, "99-failure").catch(() => {});
  check("test run finished without errors", false, e instanceof Error ? e.message.split("\n")[0] : String(e));
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
