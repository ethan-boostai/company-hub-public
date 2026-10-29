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
  await tasks.getByRole("button", { name: "+ New task" }).click();
  const picker = p.getByRole("dialog", { name: "New task" });
  await picker.getByText("Job 12").waitFor();
  log("site survey under Office tasks:", await picker.getByRole("button", { name: /^Site survey/ }).count());
  await picker.getByRole("button", { name: "On site tasks" }).click();
  log("site survey under On site tasks:", await picker.getByRole("button", { name: /^Site survey/ }).count());
  await picker.getByRole("button", { name: "Office tasks" }).click();
  await picker.getByRole("button", { name: /^CBS RAMS/ }).click();
  const panel = p.getByRole("dialog", { name: /New task/ });
  await panel.getByRole("button", { name: "Add task" }).dblclick();
  const opened = p.getByRole("dialog", { name: "CBS RAMS" });
  await opened.waitFor({ timeout: 10000 });
  log("RAMS added and opened");
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
  // Site survey added from the Office tab is an Office task
  await tasks.getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button", { name: /^Site survey/ }).click();
  await p.getByRole("dialog", { name: /New task/ }).getByRole("button", { name: "Add task" }).click();
  const sv = p.getByRole("dialog", { name: "Site survey" });
  await sv.waitFor({ timeout: 10000 });
  log("site survey from Office tab is On site:", await sv.getByText("On site", { exact: true }).count() ? "yes (WRONG)" : "no (office task)");
  await sv.getByRole("button", { name: "Close" }).first().click();
  // CDM lock on a project job
  await tasks.getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button", { name: /^Visitors log/ }).click();
  log("lock message:", await picker.getByRole("alert").innerText());
  await picker.getByRole("button", { name: "Close", exact: true }).click();
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
  await p.getByRole("dialog", { name: "Test task order stationery" }).getByRole("button", { name: "Close" }).first().click();
  await gs.fill("Test Office");
  await list.getByRole("option", { name: /Test Office One/ }).waitFor();
  log("search finds people");
  await gs.fill("");

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
