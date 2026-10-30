// Page standard and parity check (30/10/2026): Send to site / Move to office, Book in Job, the shared
// Create report dialog, Templates, Shared parts, the phone header and tables, and the not-found page.
// Needs the app running (BASE_URL, default http://localhost:3100) on the LOCAL dev database with the
// local seed and test job 12 at Approved. Never run against live. Makes fake "Test task …" tasks only.
// Usage: DATABASE_URL=<local> node tests/e2e/page-standard.mjs [screenshot dir]
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2];
let pass = 0, fail = 0, popups = 0;
const check = (ok, what) => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); };

// On a Vercel preview (BASE_URL not local): through Vercel Authentication, signed in as Preview Admin
// (VERCEL_AUTOMATION_BYPASS_SECRET and PREVIEW_ADMIN_PIN; never printed). Locally: Test Office One.
const PREVIEW = !/localhost|127\.0\.0\.1/.test(BASE);
const contextOptions = PREVIEW ? { extraHTTPHeaders: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "", "x-vercel-set-bypass-cookie": "true" } } : {};

async function signIn(p) {
  await p.goto(`${BASE}/sign-in`);
  await p.getByRole("button", { name: PREVIEW ? "Preview Admin" : "Test Office One" }).click();
  await p.locator("#pin").fill(PREVIEW ? process.env.PREVIEW_ADMIN_PIN || "" : "1234");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);
}

(async () => {
  const b = await chromium.launch();
  try {
    // ---- Desktop ----
    const ctx = await b.newContext({ viewport: { width: 1400, height: 900 }, ...contextOptions });
    const p = await ctx.newPage();
    p.on("dialog", (d) => { popups++; d.dismiss(); });
    await signIn(p);

    // Send to site / Move to office on a one-off job task.
    await p.goto(`${BASE}/jobs/12`, { waitUntil: "networkidle" });
    await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
    const g = p.getByRole("dialog", { name: "New task" });
    await g.getByLabel("Title").fill("Test task move to site");
    await g.getByRole("button", { name: "Add task" }).click();
    const d = p.getByRole("dialog", { name: "Test task move to site" });
    await d.waitFor();
    const officeBox = d.getByRole("region", { name: "Office or site" });
    check(await officeBox.getByText("not on the job portal").count() === 1, "office job task shows 'Office task · not on the job portal'");
    // The box sits above Status, first in the drawer.
    const boxY = (await officeBox.boundingBox())?.y ?? 9999;
    const statusY = (await d.getByText("Status", { exact: true }).boundingBox())?.y ?? 0;
    check(boxY < statusY, "the office/site box sits above Status");
    await officeBox.getByRole("button", { name: "Send to site" }).dblclick();
    const siteBox = d.getByRole("region", { name: "On site" });
    await siteBox.getByRole("button", { name: "Move to office" }).waitFor();
    check(await siteBox.getByText("on the job portal").count() === 1, "after Send to site: 'On site task · … · on the job portal'");
    check(await siteBox.getByRole("button", { name: "Approve and mark done" }).count() === 1 && await siteBox.getByRole("button", { name: "Send back to site" }).count() === 1,
      "on-site box keeps Approve and mark done / Send back to site");
    await siteBox.getByRole("button", { name: "Move to office" }).click();
    await officeBox.getByRole("button", { name: "Send to site" }).waitFor();
    check(true, "Move to office puts it back in the office");
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/task-office-box.png` });
    await d.getByRole("button", { name: "Close" }).first().click();

    // Double-click guard: the side changed once per click pair (activity rows for this task).
    if (process.env.DATABASE_URL && /127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL)) {
      const postgres = require("postgres");
      const sql = postgres(process.env.DATABASE_URL, { max: 1 });
      const rows = await sql`select a.changes from activity_log a join tasks t on t.id = a.row_id and a.table_name = 'tasks'
        where t.id = (select max(id) from tasks where title = 'Test task move to site') and a.changes ? 'side' order by a.id`.catch(() => null);
      if (rows) check(rows.length === 2, `side changed exactly twice (double-click saved once): ${rows.length}`);
      await sql.end();
    }

    // Book in Job tile: Office, Approved: Planning, last in the group. Office-only: no Send to site.
    const tasks = p.getByRole("complementary", { name: "Tasks" });
    await tasks.getByRole("button", { name: "+ New task" }).click();
    const picker = p.getByRole("dialog", { name: "New task" });
    const planning = picker.getByRole("region", { name: "Approved: Planning" });
    await planning.getByRole("button").first().waitFor();
    const tiles = await planning.getByRole("button").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") || ""));
    check(/^Book in Job/.test(tiles.at(-1) ?? ""), `Book in Job is the last Approved: Planning tile (${tiles.at(-1)})`);
    // Already on the job (a re-run): the tile opens its task. Otherwise tick it and Add.
    const already = /\((On|Done)\)/.test(tiles.at(-1) ?? "");
    await planning.getByRole("button", { name: /^Book in Job/ }).click();
    if (!already) await picker.getByRole("button", { name: /^Add (\d+ )?tasks?$/ }).click();
    const book = p.getByRole("dialog", { name: "Book in Job" });
    await book.waitFor();
    check(await book.getByRole("region", { name: "Office or site" }).getByRole("button", { name: "Send to site" }).count() === 0, "office-only requirement (Book in Job) has no Send to site");
    await book.getByRole("button", { name: "Close" }).first().click();

    // Templates: RegisterLayout (Needs attention, All clear) and Reports ▾ > Create report.
    await p.goto(`${BASE}/safety/templates`, { waitUntil: "networkidle" });
    check(await p.getByRole("complementary", { name: "Needs attention" }).getByTestId("all-clear").count() === 1, "Templates has the Needs attention panel (All clear)");
    await p.getByRole("button", { name: "Reports" }).click();
    await p.getByRole("menuitem", { name: /Create report/ }).click();
    const rep = p.getByRole("dialog", { name: "Create report" });
    await rep.waitFor();
    check(await rep.getByRole("group", { name: "Columns" }).getByRole("button", { name: "Select all" }).count() === 1, "report dialog: tick groups have Select all / Clear");
    check(await rep.getByRole("button", { name: "Cancel" }).count() === 1, "report dialog has Cancel");
    const [pdf] = await Promise.all([
      p.waitForResponse((r) => r.url().includes("/safety/templates/report"), { timeout: 30000 }),
      rep.getByRole("button", { name: "Create report" }).click(),
    ]);
    check(pdf.status() === 200 && /pdf/.test(pdf.headers()["content-type"] || ""), `Templates report opens a PDF in-window (${pdf.status()})`);
    await p.getByRole("dialog", { name: "RAMS job types.pdf" }).getByRole("button", { name: "Close" }).click();

    // Fleet report (now the shared dialog): a choice is remembered on this device.
    await p.goto(`${BASE}/fleet`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "Reports" }).click();
    await p.getByRole("menuitem", { name: /Create report/ }).click();
    const fr = p.getByRole("dialog", { name: "Create report" });
    const radios = fr.getByRole("radio");
    const n = await radios.count();
    check(n >= 2 && await fr.getByRole("button", { name: "Cancel" }).count() === 1, "Fleet uses the shared dialog (radios, Cancel)");
    if (n >= 2) {
      await radios.nth(1).check();
      await fr.getByRole("button", { name: "Create report" }).click();
      await p.getByRole("dialog", { name: "Fleet list.pdf" }).getByRole("button", { name: "Close" }).click();
      await p.getByRole("button", { name: "Reports" }).click();
      await p.getByRole("menuitem", { name: /Create report/ }).click();
      check(await fr.getByRole("radio").nth(1).isChecked(), "the last report choice is remembered on this device");
      await fr.getByRole("button", { name: "Cancel" }).click();
    }

    // Shared parts: on locally (previews only, never live).
    const sp = await p.goto(`${BASE}/settings/shared-parts`);
    await p.getByRole("button", { name: "Slow click" }).waitFor({ timeout: 15000 }).catch(() => {});
    check(sp?.status() === 200 && await p.getByRole("button", { name: "Slow click" }).count() === 1, "Shared parts loads off the live site, with the Button demo");

    // Not found: the hub's page with the header.
    // (Pages stream, so the status is already 200 when not-found shows; the page content is what counts.)
    await p.goto(`${BASE}/jobs/12/summary`);
    await p.getByRole("heading", { name: "Page not found" }).waitFor({ timeout: 15000 }).catch(() => {});
    check(await p.getByRole("heading", { name: "Page not found" }).count() === 1 && await p.getByRole("button", { name: "‹ Back" }).count() === 1 && await p.getByTestId("signed-in-name").count() === 1,
      "not-found page keeps the header (‹ Back, name pill)");
    await p.goto(`${BASE}/zz-no-such-page`);
    await p.getByRole("heading", { name: "Page not found" }).waitFor({ timeout: 15000 }).catch(() => {});
    check(await p.getByRole("heading", { name: "Page not found" }).count() === 1 && await p.getByRole("navigation").count() >= 1, "an unknown top-level address shows the hub's not-found page with the menu");
    await ctx.close();

    // ---- Phone (390) ----
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, ...contextOptions });
    const m = await pc.newPage();
    m.on("dialog", (dd) => { popups++; dd.dismiss(); });
    await signIn(m);
    await m.goto(`${BASE}/people`, { waitUntil: "networkidle" });
    const header = m.getByRole("banner");
    check(await header.getByRole("button", { name: "Open search" }).isVisible(), "phone header: a search button, not an empty box");
    check((await header.getByRole("button", { name: /Task/ }).innerText()).trim() === "+ Task", "phone header: + Task");
    await header.getByRole("button", { name: "Open search" }).click();
    check(await m.getByRole("combobox", { name: "Search the hub" }).isVisible(), "phone header: the search row opens under the header");
    await m.getByRole("button", { name: "Close" }).first().click();
    check(await m.getByRole("table").count() === 0 && await m.getByRole("list", { name: /team/i }).count() >= 1, "phone: Team list shows stacked rows, not a table");
    const sideways = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(sideways <= 0, `phone: no sideways scrolling on Team (${sideways}px)`);
    if (SHOTS) await m.screenshot({ path: `${SHOTS}/phone-team.png` });
    await pc.close();
  } catch (e) {
    fail++;
    console.log("ERR", String(e.message || e).split("\n")[0]);
  } finally {
    check(popups === 0, `no browser pop-ups (${popups})`);
    console.log(`\n${pass} passed, ${fail} failed`);
    await b.close();
    process.exit(fail ? 1 : 0);
  }
})();
