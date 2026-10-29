// Phase 1 browser check (tasks, job page, search). Needs the app running (BASE_URL, default
// http://localhost:3100) on the LOCAL dev database with the local seed, and test job 12 at Approved.
// Never run against live. Usage: node tests/e2e/phase1-tasks.mjs [screenshot dir]
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
const SHOTS = process.argv[2];
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 900 } }); const p = await ctx.newPage();
  let popups = 0; p.on("dialog", (d) => { popups++; d.dismiss(); });
  const log = (...a) => console.log(...a);
  // The task drawer: 560px from the right, full height, and the page behind it can't scroll.
  const drawerCheck = async (dlg, where) => {
    const bb = await dlg.boundingBox();
    const vw = p.viewportSize().width;
    const locked = await p.evaluate(() => document.documentElement.classList.contains("scroll-locked"));
    const y0 = await p.evaluate(() => window.scrollY);
    await p.mouse.move(100, 400); await p.mouse.wheel(0, 600); await p.waitForTimeout(200);
    const y1 = await p.evaluate(() => window.scrollY);
    const ok = bb && Math.round(bb.width) === 560 && Math.abs(bb.x + bb.width - vw) < 2 && Math.round(bb.height) === p.viewportSize().height && locked && y0 === y1;
    console.log(`${ok ? "PASS" : "FAIL"} task drawer from ${where}: width ${Math.round(bb?.width)}, right edge ${Math.round((bb?.x ?? 0) + (bb?.width ?? 0))}/${vw}, page locked ${locked}, page scrolled ${y1 - y0}`);
  };
  await p.goto(`${BASE}/sign-in`);
  await p.getByRole("button", { name: "Test Office One" }).click();
  await p.locator("#pin").fill("1234"); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);

  // Job page: Tasks panel down the right; its + New task is the requirement picker.
  await p.goto(`${BASE}/jobs/12`, { waitUntil: "networkidle" });
  const tasks = p.getByRole("complementary", { name: "Tasks" });
  const box = await tasks.boundingBox();
  log("tasks panel on the right:", box && box.x > 900 ? `yes (x=${Math.round(box.x)}, width ${Math.round(box.width)})` : `NO ${JSON.stringify(box)}`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/job12-wide.png` });
  // The job's + New task: centred box over a blurred page, as the live Job File.
  const centredCheck = async (dlg, what) => {
    const bb = await dlg.boundingBox(); const vw = p.viewportSize().width; const vh = p.viewportSize().height;
    const blur = await p.locator('[data-backdrop="blur"]').last().evaluate((el) => getComputedStyle(el).backdropFilter);
    const locked = await p.evaluate(() => document.documentElement.classList.contains("scroll-locked"));
    const ok = bb && Math.round(bb.width) === 620 && Math.abs(bb.x + bb.width / 2 - vw / 2) < 2 && bb.height <= vh * 0.92 + 1 && /blur/.test(blur) && locked;
    console.log(`${ok ? "PASS" : "FAIL"} ${what} is centred: width ${Math.round(bb?.width)}, centre ${Math.round((bb?.x ?? 0) + (bb?.width ?? 0) / 2)}/${vw / 2}, height ${Math.round(bb?.height)}/${vh}, backdrop ${blur}, page locked ${locked}`);
  };
  await tasks.getByRole("button", { name: "+ New task" }).click();
  const picker = p.getByRole("dialog", { name: "New task" });
  await picker.getByText("Job 12. Tick everything this job needs, then Add.").waitFor();
  await centredCheck(picker, "the + New task picker");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/picker.png` });
  const addBtn = picker.getByRole("button", { name: /^Add (\d+ )?tasks?$/ });
  log("Add tasks faded until something is ticked:", await addBtn.isDisabled() ? "yes" : "NO", "| Cancel beside it:", await picker.getByRole("button", { name: "Cancel" }).count());
  log("Other at the top:", (await picker.getByRole("button").filter({ hasText: "any one-off task" }).count()) === 1);
  log("Now label on the job's stage:", (await picker.getByRole("region", { name: "Approved: Planning" }).getByText("Now", { exact: true }).count()) === 1);
  log("site survey under Office tasks:", await picker.getByRole("button", { name: /^Site survey/ }).count());
  await picker.getByRole("button", { name: "On site tasks" }).click();
  log("site survey under On site tasks:", await picker.getByRole("button", { name: /^Site survey/ }).count());
  await picker.getByRole("button", { name: "Office tasks" }).click();
  // tick one: CBS RAMS -> Add 1 task opens it in the drawer
  await picker.getByRole("button", { name: /^CBS RAMS/ }).click();
  log("tick shows:", await picker.getByRole("button", { name: /^CBS RAMS \(selected\)/ }).count() ? "✓ Selected" : "NOT selected", "| button:", await addBtn.innerText());
  await addBtn.dblclick();
  const opened = p.getByRole("dialog", { name: "CBS RAMS" });
  await opened.waitFor({ timeout: 10000 });
  log("RAMS added and opened");
  await drawerCheck(opened, "the job page (a newly added task)");
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/task-drawer-job.png` });
  await opened.getByText("In progress", { exact: true }).click();
  await opened.getByLabel("In hand").fill("Waiting for the site visit");
  await opened.getByRole("button", { name: "Save" }).click();
  await opened.getByRole("status").filter({ hasText: "Saved" }).waitFor();
  await opened.getByRole("button", { name: "Close" }).first().click();
  await p.waitForTimeout(800);
  log("panel RAMS rows:", await tasks.getByRole("button", { name: /CBS RAMS/ }).count(), "| in hand shown:", await tasks.getByText("In hand: Waiting for the site visit").count());
  await tasks.getByRole("button", { name: "+ New task" }).click();
  const tile = picker.getByRole("button", { name: /^CBS RAMS \(On\)/ });
  await tile.waitFor(); await tile.click();
  await p.getByRole("dialog", { name: "CBS RAMS" }).waitFor();
  log("RAMS tile shows On and opens the same task");
  await p.getByRole("dialog", { name: "CBS RAMS" }).getByRole("button", { name: "Close" }).first().click();
  // A task clicked in the job's Tasks panel opens in the same 560px drawer (not centred).
  await tasks.getByRole("button", { name: /CBS RAMS/ }).first().click();
  await drawerCheck(p.getByRole("dialog", { name: "CBS RAMS" }), "the job page's Tasks panel");
  log("no centred task box:", (await p.locator('[data-panel="centred"]').count()) === 0);
  await p.getByRole("dialog", { name: "CBS RAMS" }).getByRole("button", { name: "Close" }).first().click();
  // tick several, then one Add: Site survey (from the Office tab) + Supplier POs + Toolbox talks (On site)
  await tasks.getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button", { name: /^Site survey/ }).click();
  await picker.getByRole("button", { name: /^Supplier POs/ }).click();
  await picker.getByRole("button", { name: "On site tasks" }).click();
  await picker.getByRole("button", { name: /^Toolbox talks/ }).click();
  log("three ticked:", await addBtn.innerText());
  await addBtn.dblclick();
  await picker.waitFor({ state: "detached", timeout: 10000 });
  await p.waitForTimeout(1200);
  log("one Add made them all:", ["Site survey", "Supplier POs", "Toolbox talks"].map((t) => t).join(", "), "->",
    (await Promise.all(["Site survey", "Supplier POs", "Toolbox talks"].map((t) => tasks.getByRole("button", { name: new RegExp(`^${t}`) }).count()))).join("/"));
  await tasks.getByRole("button", { name: /^Site survey/ }).click();
  const sv = p.getByRole("dialog", { name: "Site survey" });
  await sv.waitFor({ timeout: 10000 });
  log("site survey from Office tab is On site:", await sv.getByText("On site", { exact: true }).count() ? "yes (WRONG)" : "no (office task)");
  await sv.getByRole("button", { name: "Close" }).first().click();
  // Other: the one-off task form on this job
  await tasks.getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button").filter({ hasText: "any one-off task" }).click();
  const other = p.getByRole("dialog", { name: "New task" });
  await other.getByLabel("Title").fill("Test task other on job 12");
  await other.getByRole("button", { name: "Add task" }).click();
  await p.getByRole("dialog", { name: "Test task other on job 12" }).waitFor({ timeout: 10000 });
  log("Other made a one-off task on job 12:", await p.getByRole("dialog", { name: "Test task other on job 12" }).getByRole("link", { name: /Job 12/ }).count() ? "yes" : "NO");
  await p.getByRole("dialog", { name: "Test task other on job 12" }).getByRole("button", { name: "Close" }).first().click();
  // CDM lock on a project job
  await tasks.getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button", { name: /^Visitors log/ }).click();
  log("lock message:", await picker.getByRole("alert").innerText(), "| still nothing ticked:", await addBtn.isDisabled());
  await picker.getByRole("button", { name: "Cancel" }).click();
  // upload, done, verify
  await tasks.getByRole("button", { name: /CBS RAMS/ }).click();
  const r = p.getByRole("dialog", { name: "CBS RAMS" });
  await r.locator('input[type="file"]').setInputFiles({ name: "rams-test.txt", mimeType: "text/plain", buffer: Buffer.from("test") });
  await r.getByText("rams-test.txt").waitFor({ timeout: 15000 });
  log("file uploaded to the task");
  await r.getByText("Done", { exact: true }).click();
  await r.getByRole("button", { name: "Save" }).click();
  await r.getByRole("button", { name: "Verify" }).waitFor();
  await r.getByRole("button", { name: "Verify" }).dblclick();
  await r.getByRole("button", { name: "Undo verify" }).waitFor();
  log("done + verified:", (await r.getByText(/Verified by/).count()) > 0);
  await r.getByRole("button", { name: "Close" }).first().click();
  await tasks.getByRole("button", { name: "All", exact: true }).click();
  log("All filter shows the done RAMS:", await tasks.getByRole("button", { name: /CBS RAMS/ }).count());

  // Header + New task on a job page: the generic form, linked to job 12 to start with.
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  const g = p.getByRole("dialog", { name: "New task" });
  await g.getByLabel("Title").waitFor();
  log("header + New task opens the generic form:", await g.getByText("Link to").count() ? "yes" : "NO", "| picker tiles shown:", await g.getByRole("button", { name: /^CBS RAMS/ }).count(), "| linked:", await g.getByText("Job 12", { exact: true }).count() ? "Job 12" : "none");
  await g.getByLabel("Title").fill("Test task chase skip delivery");
  await g.getByRole("button", { name: "Add task" }).dblclick();
  await p.getByRole("dialog", { name: "Test task chase skip delivery" }).waitFor({ timeout: 10000 });
  await p.getByRole("dialog", { name: "Test task chase skip delivery" }).getByRole("button", { name: "Close" }).first().click();
  await p.waitForTimeout(800);
  log("generic task on job 12 shows in the panel:", await tasks.getByRole("button", { name: /Test task chase skip delivery/ }).count());

  // Header + New task elsewhere: Link to Nothing, or find a job.
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  await g.getByLabel("Title").fill("Test task order stationery");
  await g.getByRole("button", { name: "Add task" }).click();
  const oneOpen = p.getByRole("dialog", { name: "Test task order stationery" });
  await oneOpen.waitFor();
  log("one-off with no job: upload buttons:", await oneOpen.getByRole("button", { name: "Upload file" }).count());
  await oneOpen.getByRole("button", { name: "Close" }).first().click();
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  await g.getByLabel("Title").fill("Test task book scaffold check");
  await g.getByText("Job", { exact: true }).click();
  await g.getByLabel("Find the job").fill("12");
  await g.getByRole("option", { name: /#12/ }).click();
  await g.getByRole("button", { name: "Add task" }).click();
  const linked = p.getByRole("dialog", { name: "Test task book scaffold check" });
  await linked.waitFor();
  log("linked to a job from the form:", await linked.getByRole("link", { name: /Job 12/ }).count() ? "Job 12" : "NO");
  await linked.getByRole("button", { name: "Close" }).first().click();

  // Global search: results under the box as you type, click to open.
  const gs = p.getByRole("banner").getByRole("combobox", { name: "Search the hub" });
  await gs.fill("12");
  const list = p.getByRole("listbox", { name: "Search the hub results" });
  await list.getByRole("option").first().waitFor();
  log("search '12' lists:", (await list.innerText()).replace(/\n+/g, " | ").slice(0, 200));
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/search.png` });
  await list.getByRole("option", { name: /#12/ }).click();
  await p.waitForURL(`${BASE}/jobs/12`);
  log("clicking the job opens /jobs/12");
  await gs.fill("Hub rebuild");
  await list.getByRole("option", { name: /#12/ }).waitFor();
  log("search by client name finds job 12");
  await gs.fill("stationery");
  await list.getByRole("option", { name: /order stationery/ }).click();
  await p.getByRole("dialog", { name: "Test task order stationery" }).waitFor();
  log("clicking a task opens it in the task panel");
  await drawerCheck(p.getByRole("dialog", { name: "Test task order stationery" }), "search results");
  await p.getByRole("dialog", { name: "Test task order stationery" }).getByRole("button", { name: "Close" }).first().click();
  await gs.fill("Test Office");
  await list.getByRole("option", { name: /Test Office One/ }).waitFor();
  log("search finds people");
  await gs.fill("");

  // Home: a task opened from the header search there uses the same drawer.
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await gs.fill("scaffold");
  await list.getByRole("option", { name: /book scaffold check/ }).click();
  await drawerCheck(p.getByRole("dialog", { name: "Test task book scaffold check" }), "Home");
  await p.getByRole("dialog", { name: "Test task book scaffold check" }).getByRole("button", { name: "Close" }).first().click();

  // Jobs page search
  await p.goto(`${BASE}/jobs`, { waitUntil: "networkidle" });
  const js = p.getByRole("main").getByRole("combobox", { name: "Search jobs" });
  await js.fill("12");
  const jl = p.getByRole("listbox", { name: "Search jobs results" });
  await jl.getByRole("option", { name: /#12/ }).click();
  await p.waitForURL(`${BASE}/jobs/12`);
  log("Jobs page search: typed 12, clicked, opened job 12");

  // Narrow screen: Tasks button opens the panel full screen.
  await p.setViewportSize({ width: 900, height: 900 });
  await p.goto(`${BASE}/jobs/12`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: /^Tasks \(\d+\)$/ }).click();
  const full = p.getByRole("dialog", { name: "Tasks" });
  await full.waitFor();
  log("narrow screen: Tasks button opens the panel, rows:", await full.getByRole("listitem").count());
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/job12-narrow.png` });
  await full.getByRole("button", { name: "Close tasks" }).click();
  log("browser pop-ups:", popups);
  await b.close();
})().catch(async (e) => { console.error("ERR", e.message.split("\n").slice(0, 3).join(" ")); process.exit(1); });
