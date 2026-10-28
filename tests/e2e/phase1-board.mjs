// Phase 1 browser check (board). Needs the app running (BASE_URL, default http://localhost:3100) on the
// LOCAL dev database with the local seed, and test job 12 at Approved. Never run against live.
// Usage: node tests/e2e/phase1-board.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3100";
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } }); const p = await ctx.newPage();
  let popups = 0; p.on("dialog", (d) => { popups++; d.dismiss(); });
  const log = (...a) => console.log(...a);
  await p.goto(`${BASE}/sign-in`);
  await p.getByRole("button", { name: "Test Office One" }).click();
  await p.locator("#pin").fill("1234"); await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);
  await p.goto(`${BASE}/actions`, { waitUntil: "networkidle" });
  const col = (n) => p.getByRole("region", { name: n, exact: true });
  const counts = async () => (await Promise.all(["To do", "In progress", "Done"].map((n) => col(n).getByRole("listitem").count()))).join("/");
  log("columns to do/in progress/done:", await counts());
  const card = col("To do").getByRole("listitem").first();
  const title = (await card.locator("span.font-medium").innerText());
  await card.dragTo(col("Done"));
  await p.getByRole("status").filter({ hasText: "Moved" }).waitFor();
  log("dragged", JSON.stringify(title), "to Done ->", await counts());
  await p.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await p.waitForTimeout(1500);
  log("after Undo ->", await counts(), "| card back in To do:", await col("To do").getByText(title, { exact: true }).count());
  // search
  await p.getByLabel("Search tasks").fill("RAMS");
  log("search RAMS ->", await counts());
  await p.getByLabel("Search tasks").fill("");
  // filter persisted
  await p.getByRole("combobox").first().selectOption("none");
  log("job = No job ->", await counts());
  await p.reload({ waitUntil: "networkidle" });
  log("after reload, Job filter:", await p.getByRole("combobox").first().inputValue(), "->", await counts());
  await p.getByRole("button", { name: "Clear" }).click();
  await p.getByLabel("Group by job").check();
  log("group headings:", (await col("To do").locator("p.text-xs").allInnerTexts()).join(", "));
  await p.getByLabel("Group by job").uncheck();
  await p.getByRole("link", { name: "Show older done" }).click();
  await p.waitForURL(/older=1/);
  log("older done shown:", await col("Done").getByText("all").count() > 0);
  await col("To do").getByRole("listitem").first().getByRole("button").click();
  await p.getByRole("dialog").first().waitFor();
  log("card opens panel:", await p.getByRole("dialog").first().getAttribute("aria-label") || "yes");
  await p.keyboard.press("Escape");
  // requirement types
  await p.goto(`${BASE}/settings/requirement-types`, { waitUntil: "networkidle" });
  await p.getByRole("button", { name: "Add type" }).click();
  const d = p.getByRole("dialog", { name: "Add type" });
  await d.getByLabel("Name").fill("Test skip hire check");
  await d.getByLabel("Approved: on site").check();
  await d.getByLabel("On site task").check();
  await d.getByLabel(/Repeatable/).check();
  await d.getByRole("button", { name: "Add type" }).dblclick();
  await p.waitForTimeout(1500);
  log("custom list:", (await p.getByTestId("custom-types").innerText()).replace(/\n/g, " | "));
  // duplicate name
  await p.getByRole("button", { name: "Add type" }).click();
  await d.getByLabel("Name").fill("test SKIP hire check");
  await d.getByRole("button", { name: "Add type" }).click();
  await p.waitForTimeout(1000);
  log("duplicate:", await d.getByText(/already a type/).count() ? "refused" : "NOT refused");
  await p.keyboard.press("Escape");
  // shows in picker on job 12
  await p.goto(`${BASE}/jobs/12`, { waitUntil: "networkidle" });
  await p.getByRole("banner").getByRole("button", { name: "+ New task" }).click();
  const picker = p.getByRole("dialog", { name: "New task" });
  await picker.getByText("Job 12").waitFor();
  await picker.getByRole("button", { name: "On site tasks" }).click();
  log("in picker (on site):", await picker.getByRole("button", { name: /^Test skip hire check/ }).count());
  await picker.getByRole("button", { name: /^Test skip hire check/ }).click();
  await p.getByRole("dialog", { name: /New task/ }).getByRole("button", { name: "Add task" }).click();
  await p.getByRole("dialog", { name: "Test skip hire check" }).waitFor({ timeout: 10000 });
  log("custom task added");
  await p.keyboard.press("Escape");
  // delete refused when used; switch off works
  await p.goto(`${BASE}/settings/requirement-types`, { waitUntil: "networkidle" });
  await p.getByTestId("custom-types").getByRole("button", { name: /Test skip hire check/ }).click();
  const e = p.getByRole("dialog", { name: "Test skip hire check" });
  await e.getByRole("button", { name: "Delete type" }).click();
  const c = p.getByRole("alertdialog").or(p.getByRole("dialog", { name: /Delete/ }));
  await c.getByRole("button", { name: /Delete/ }).last().click();
  await p.waitForTimeout(1000);
  log("delete used type:", (await c.innerText()).includes("Switch it off") ? "refused, says switch off" : await c.innerText());
  await p.keyboard.press("Escape"); await p.waitForTimeout(400);
  log("Escape on confirm keeps the drawer open:", await e.isVisible(), "| confirm closed:", !(await c.isVisible()));
  await e.getByLabel(/Switched on/).uncheck();
  await e.getByRole("button", { name: "Save" }).click();
  await p.waitForTimeout(1200);
  log("after switch off:", (await p.getByTestId("custom-types").innerText()).replace(/\n/g, " | "));
  log("popups:", popups);
  await b.close();
})().catch((e) => { console.error("FAIL", e.message.slice(0,600)); process.exit(1); });
