// Phase 1 browser check (tasks). Needs the app running (BASE_URL, default http://localhost:3100) on the
// LOCAL dev database with the local seed, and test job 12 at Approved. Never run against live.
// Usage: node tests/e2e/phase1-tasks.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
  let popups = 0; p.on("dialog", (d) => { popups++; d.dismiss(); });
  const log = (...a) => console.log(...a);
  await p.goto(`${BASE}/sign-in`);
  await p.getByRole("button", { name: "Test Office One" }).click();
  await p.locator("#pin").fill("1234"); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);
  await p.goto(`${BASE}/jobs/12`, { waitUntil: "networkidle" });
  // header + New task on a job page: job preselected
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  const picker = p.getByRole("dialog", { name: "New task" });
  await picker.getByText("Job 12").waitFor();
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
  const ramsRows = await p.getByRole("region", { name: "Tasks" }).getByRole("button", { name: /CBS RAMS/ }).count();
  log("job tasks list RAMS rows:", ramsRows, "| in hand shown:", await p.getByText("In hand: Waiting for the site visit").count());
  // pick RAMS again -> opens existing
  await p.getByRole("region", { name: "Tasks" }).getByRole("button", { name: "+ New task" }).click();
  const tile = picker.getByRole("button", { name: /^CBS RAMS \(On\)/ });
  await tile.waitFor();
  await tile.click();
  await p.getByRole("dialog", { name: "CBS RAMS" }).waitFor();
  log("RAMS tile shows On and opens the same task");
  await p.getByRole("dialog", { name: "CBS RAMS" }).getByRole("button", { name: "Close" }).first().click();
  // repeatable twice
  for (let i = 0; i < 2; i++) {
    await p.getByRole("region", { name: "Tasks" }).getByRole("button", { name: "+ New task" }).click();
    await picker.getByRole("button", { name: /^Supplier POs/ }).click();
    await p.getByRole("dialog", { name: /New task/ }).getByRole("button", { name: "Add task" }).click();
    await p.getByRole("dialog", { name: i ? "Supplier POs 2" : "Supplier POs" }).waitFor({ timeout: 10000 });
    await p.getByRole("dialog", { name: i ? "Supplier POs 2" : "Supplier POs" }).getByRole("button", { name: "Close" }).first().click();
  }
  log("Supplier POs added twice (Supplier POs, Supplier POs 2)");
  // CDM lock on a project job
  await p.getByRole("region", { name: "Tasks" }).getByRole("button", { name: "+ New task" }).click();
  await picker.getByRole("button", { name: /^Visitors log/ }).click();
  log("lock message:", await picker.getByRole("alert").innerText());
  // on site toggle
  await picker.getByRole("button", { name: "On site tasks" }).click();
  log("on site tiles:", (await picker.getByRole("region", { name: "Approved: on site" }).getByRole("button").allInnerTexts()).map((t) => t.split("\n")[0]).join(", "));
  await picker.getByRole("button", { name: "Close" }).click();
  // open RAMS, upload file, mark done, verify
  await p.getByRole("region", { name: "Tasks" }).getByRole("button", { name: /CBS RAMS/ }).click();
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
  // one-off with no job from home
  await p.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  await picker.getByText("No job chosen").waitFor();
  await picker.getByRole("button", { name: /^Other/ }).click();
  const one = p.getByRole("dialog", { name: "New task" });
  await one.getByLabel("Title").fill("Test task order stationery");
  await one.getByRole("button", { name: "Add task" }).click();
  const oneOpen = p.getByRole("dialog", { name: "Test task order stationery" });
  await oneOpen.waitFor();
  log("one-off: files note:", await oneOpen.getByText("Tasks with no job don't take files.").count(), "| upload buttons:", await oneOpen.getByRole("button", { name: "Upload file" }).count());
  if (process.argv[2]) await p.screenshot({ path: process.argv[2] + "/panel.png" });
  log("browser pop-ups:", popups);
  await b.close();
})().catch(async (e) => { console.error("ERR", e.message.split("\n")[0]); process.exit(1); });
