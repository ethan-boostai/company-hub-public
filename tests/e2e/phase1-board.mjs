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
  await p.goto(`${BASE}/actions`, { waitUntil: "networkidle" });
  log("page top:", await p.getByRole("heading", { level: 1 }).innerText(), "|", await p.getByTestId("record-count").innerText(), "| Needs attention panel:", await p.getByRole("complementary", { name: "Needs attention" }).count());
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
  await p.getByRole("main").locator("select").first().selectOption("none");
  log("job = No job ->", await counts());
  await p.reload({ waitUntil: "networkidle" });
  log("after reload, Job filter:", await p.getByRole("main").locator("select").first().inputValue(), "->", await counts());
  await p.getByRole("button", { name: "Clear" }).click();
  const groupBtn = p.getByRole("button", { name: /Group by job/ });
  await groupBtn.click();
  log("Group by job pressed:", await groupBtn.getAttribute("aria-pressed"), "| group headings:", (await col("To do").getByRole("heading", { level: 3 }).allInnerTexts()).join(", "));
  await groupBtn.click();
  const overdueBtn = p.getByRole("button", { name: /^✓?Overdue$/ });
  await overdueBtn.click();
  log("Overdue pressed:", await overdueBtn.getAttribute("aria-pressed"), "->", await counts());
  await p.getByRole("button", { name: "Clear" }).click();
  await p.getByRole("link", { name: "Show older done" }).click();
  await p.waitForURL(/older=1/);
  log("older done shown:", await col("Done").getByText("all").count() > 0);
  await col("To do").getByRole("listitem").first().getByRole("button").click();
  await p.getByRole("dialog").first().waitFor();
  log("card opens panel:", await p.getByRole("dialog").first().getAttribute("aria-label") || "yes");
  await drawerCheck(p.getByRole("dialog").first(), "the Actions board");
  await p.keyboard.press("Escape");
  // requirement types page is gone (built-in types only)
  const rt = await p.goto(`${BASE}/settings/requirement-types`);
  log("requirement types page:", rt.status(), "| menu item:", await p.getByRole("link", { name: "Requirement types" }).count());
  log("popups:", popups);
  await b.close();
})().catch((e) => { console.error("FAIL", e.message.slice(0,600)); process.exit(1); });
