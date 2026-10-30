// Hazard type check (Workplace or Task, 30/10/2026). Needs the app running (BASE_URL, default
// http://localhost:3100) on the LOCAL dev database with the local seed and the safety and RAMS job
// type seeds (scripts/seed/dev-safety.sql, dev-rams-job-types.sql). Never run against live.
// Makes one fake hazard, "ZZ test workplace hazard", and archives it at the end.
// Usage: node tests/e2e/safety-hazard-type.mjs [screenshot dir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2];
const NAME = "ZZ test workplace hazard";
let pass = 0, fail = 0, popups = 0;
// On a Vercel preview (BASE_URL not local): through Vercel Authentication as Preview Admin
// (VERCEL_AUTOMATION_BYPASS_SECRET, PREVIEW_ADMIN_PIN; never printed). Locally: Test Office One.
const PREVIEW = !/localhost|127\.0\.0\.1/.test(BASE);
const contextOptions = PREVIEW ? { extraHTTPHeaders: { "x-vercel-protection-bypass": process.env.VERCEL_AUTOMATION_BYPASS_SECRET || "", "x-vercel-set-bypass-cookie": "true" } } : {};
const check = (ok, what) => { if (ok) pass++; else fail++; console.log(`${ok ? "PASS" : "FAIL"}  ${what}`); };

(async () => {
  const b = await chromium.launch();
  try {
    const p = await (await b.newContext({ viewport: { width: 1400, height: 900 }, ...contextOptions })).newPage();
    p.on("dialog", (d) => { popups++; d.dismiss(); });
    await p.goto(`${BASE}/sign-in`);
    await p.getByRole("button", { name: PREVIEW ? "Preview Admin" : "Test Office One" }).click();
    await p.locator("#pin").fill(PREVIEW ? process.env.PREVIEW_ADMIN_PIN || "" : "1234");
    await p.getByRole("button", { name: "Sign in" }).click();
    await p.waitForURL(`${BASE}/`);

    await p.goto(`${BASE}/safety/hazards`, { waitUntil: "networkidle" });
    const table = p.getByRole("table", { name: "Hazards" });
    check(await table.getByRole("columnheader", { name: "Type" }).count() === 1, "Hazards list has a Type column");
    const type = p.getByRole("combobox", { name: "Type" });
    check(await type.count() === 1, "Hazards page has a Type filter");

    // Make (or reuse) a Workplace hazard. "All" so an archived one from an earlier run is found.
    await p.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
    await p.getByRole("searchbox", { name: "Search hazards" }).fill(NAME);
    if (await table.getByRole("button", { name: NAME }).count() === 0) {
      await p.getByRole("searchbox", { name: "Search hazards" }).fill("");
      await p.getByRole("button", { name: "+ New hazard" }).click();
      const d = p.getByRole("dialog", { name: "New hazard" });
      await d.getByLabel("Hazard", { exact: true }).fill(NAME);
      await d.getByText("Workplace", { exact: true }).click();
      if (!(await d.getByRole("radio", { name: "Workplace" }).isChecked())) throw new Error("Workplace not chosen");
      await d.getByRole("button", { name: "Add hazard" }).dblclick();
      await p.getByRole("dialog", { name: NAME }).waitFor({ timeout: 15000 });
      await p.getByRole("dialog", { name: NAME }).getByRole("button", { name: "Close" }).first().click();
    } else {
      // An earlier run archived it: bring it back so the RAMS library can offer it.
      await table.getByRole("button", { name: NAME }).click();
      const d0 = p.getByRole("dialog", { name: NAME });
      if (await d0.getByRole("button", { name: "Restore hazard" }).count()) {
        await d0.getByRole("button", { name: "Restore hazard" }).click();
        await d0.getByRole("button", { name: "Archive hazard" }).waitFor({ timeout: 15000 });
      }
      await d0.getByRole("button", { name: "Close" }).first().click();
    }
    await p.getByRole("searchbox", { name: "Search hazards" }).fill("");

    await type.selectOption("workplace");
    const workplaceRows = await table.getByRole("row").count();
    check(await table.getByRole("button", { name: NAME }).count() === 1, "Workplace filter shows the workplace hazard");
    await type.selectOption("task");
    check(await table.getByRole("button", { name: NAME }).count() === 0 && (await table.getByRole("row").count()) > 1, "Task filter hides it and shows the task hazards");
    if (SHOTS) await p.screenshot({ path: `${SHOTS}/hazard-type.png` });
    await type.selectOption("");
    check(workplaceRows >= 2, `Workplace filter lists workplace hazards only (${workplaceRows - 1})`);

    // RAMS job type editor (the same RAMS editor as a job's RAMS): Task hazards unless asked.
    await p.goto(`${BASE}/safety/templates`, { waitUntil: "networkidle" });
    await p.getByRole("table", { name: "RAMS job types" }).getByRole("button").first().click();
    await p.waitForURL(/\/safety\/templates\/rams\/\d+/);
    const lib = p.getByPlaceholder("Search the hazards library");
    await lib.waitFor();
    await lib.fill("ZZ test workplace");
    check(await p.getByRole("button", { name: `Add ${NAME}` }).count() === 0, "RAMS library search hides workplace hazards by default");
    await p.getByLabel(/Include workplace hazards/).check();
    check(await p.getByRole("button", { name: new RegExp(`^Add ${NAME}`) }).count() === 1, "…and shows them with Include workplace hazards ticked");
    await p.getByLabel(/Include workplace hazards/).uncheck();
    await lib.fill("e");
    const offered = await p.getByRole("button", { name: /^Add / }).allInnerTexts();
    check(offered.length >= 1 && offered.every((t) => !t.includes("(Workplace)")), `task hazards still show by default, no workplace ones (${offered.length} offered)`);

    // Tidy up: archive the fake hazard.
    await p.goto(`${BASE}/safety/hazards`, { waitUntil: "networkidle" });
    await p.getByRole("group", { name: "Show" }).getByRole("button", { name: /^All/ }).click();
    await p.getByRole("searchbox", { name: "Search hazards" }).fill(NAME);
    await table.getByRole("button", { name: NAME }).click();
    const d2 = p.getByRole("dialog", { name: NAME });
    if (await d2.getByRole("button", { name: "Archive hazard" }).count()) await d2.getByRole("button", { name: "Archive hazard" }).click();
    await d2.getByRole("button", { name: "Restore hazard" }).waitFor({ timeout: 15000 });
    check(true, "fake hazard archived");
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
