// Team app and team requests end-to-end check. Needs the app running (BASE_URL, default
// http://localhost:3100) on the local dev database with the local seed (Test Office One, PIN 1234;
// "Test Office One" is on the crew list) and TEAM_LINK_KEY set (TEAM_KEY below must match it).
// Creates a fake vehicle (reg ZZ…) and fake reports, then deletes them.
// Usage: TEAM_KEY=<key> node tests/e2e/registers-team.mjs [screenshot-dir]
import { mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3100";
const KEY = process.env.TEAM_KEY || "local-test-team-key-0123456789";
const SHOTS = process.argv[2] || "";
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
};
const shot = async (page, name) => SHOTS && page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });

const REG = `ZZ${String(Date.now()).slice(-5)}T`;
// A real 1x1 PNG, and a text file pretending to be a photo.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const photo = (name) => ({ name, mimeType: "image/png", buffer: PNG });
const notPhoto = { name: "fake.jpg", mimeType: "image/jpeg", buffer: Buffer.from("this is not a photo") };
const DETAILS = `ZZ test request ${REG}`;
const browser = await chromium.launch();
let popups = 0;
const onDialog = async (d) => {
  popups++;
  await d.dismiss();
};

// Office: a signed-in desktop browser. Team: a phone with no sign-in.
const office = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "en-GB", timezoneId: "Europe/London" })).newPage();
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-GB", timezoneId: "Europe/London" });
const team = await phoneCtx.newPage();
office.on("dialog", onDialog);
team.on("dialog", onDialog);
const drawer = office.getByRole("dialog").first();

try {
  // The team app only opens with the right key.
  await team.goto(`${BASE}/team`);
  await team.getByText("Ask the office for the team link.").waitFor();
  check("no key: asks for the team link", true);
  await team.goto(`${BASE}/team?k=wrong-key-wrong-key`);
  await team.getByText("Ask the office for the team link.").waitFor();
  check("wrong key: asks for the team link", (await team.getByRole("button", { name: /Vehicle check/ }).count()) === 0);
  const api = await team.request.post(`${BASE}/api/team/report`, { data: {}, headers: { "X-Team-Key": "wrong" } });
  check("API refuses a wrong key", api.status() === 403, String(api.status()));

  // Office adds a fake vehicle.
  await office.goto(`${BASE}/sign-in?next=/fleet`);
  await office.getByRole("button", { name: "Test Office One" }).click();
  await office.locator("#pin").fill("1234");
  await office.getByRole("button", { name: "Sign in" }).click();
  await office.waitForURL(`${BASE}/fleet`);
  await office.getByRole("button", { name: "+ New vehicle", exact: true }).click();
  await drawer.getByLabel("Registration").fill(REG);
  await drawer.getByLabel("Make and model").fill("Ford Transit");
  await drawer.getByRole("button", { name: "Add vehicle" }).click();
  await drawer.getByRole("heading", { name: new RegExp(REG) }).waitFor();
  await office.getByRole("button", { name: "Close" }).first().click();

  // Team: vehicle check with a fault.
  await team.goto(`${BASE}/team?k=${encodeURIComponent(KEY)}`);
  await team.getByRole("button", { name: /Vehicle check/ }).waitFor();
  check("right key opens the team app with no sign-in", !team.url().includes("sign-in"), team.url());
  await shot(team, "01-team-home");
  await team.getByRole("button", { name: /Vehicle check/ }).click();
  await team.getByRole("button", { name: "Submit check" }).click();
  check("name must be picked", await team.getByText("Pick your name.").isVisible());
  await team.getByLabel("Your name").selectOption("Test Office One");
  await team.getByLabel("Vehicle", { exact: true }).selectOption({ label: `${REG} - Ford Transit` });
  await team.getByLabel("Odometer (miles)").fill("41,500");
  await team.getByRole("radiogroup", { name: "Lights and indicators" }).getByRole("radio", { name: "Fault" }).click();
  await team.getByRole("button", { name: "Submit check" }).click();
  check("a fault needs a description", await team.getByText("Describe the fault before submitting.").isVisible());
  await team.getByLabel("Faults or notes").fill("ZZ test: offside indicator out");
  await team.locator('input[type="file"]').setInputFiles([photo("a.png"), photo("b.png"), photo("c.png")]);
  await team.getByRole("button", { name: "Remove photo 3" }).click();
  check("two photos ready to send", (await team.getByRole("img", { name: /^Photo \d$/ }).count()) === 2);
  await shot(team, "02-team-check");
  await team.getByRole("button", { name: "Submit check" }).dblclick();
  await team.getByText("Check submitted - faults have been flagged to the office.").waitFor();
  check("check sent", true);
  const stored = await team.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage));
  check("the name isn't remembered on the device", !stored.includes("Test Office One"), stored.slice(0, 80));
  await team.getByRole("button", { name: "Done" }).click();
  await team.getByRole("button", { name: /Vehicle check/ }).click();
  check("next report starts with no name picked", (await team.getByLabel("Your name").inputValue()) === "");
  await team.getByRole("button", { name: "‹ Back" }).click();

  // Team: accident.
  await team.getByRole("button", { name: /Report a vehicle accident/ }).click();
  await team.getByLabel("Your name").selectOption("Test Office One");
  await team.getByLabel("Vehicle", { exact: true }).selectOption({ label: `${REG} - Ford Transit` });
  await team.getByLabel("What happened").fill("ZZ test: clipped a bollard in the yard");
  await team.getByRole("button", { name: "Send report" }).click();
  await team.getByText("Accident reported. The office has been notified.").waitFor();
  check("accident sent", true);
  await team.getByRole("button", { name: "Done" }).click();

  // Team: request.
  await team.getByRole("button", { name: /Make a request/ }).click();
  await team.getByLabel("Your name").selectOption("Test Office One");
  await team.getByLabel("What is it for", { exact: true }).selectOption("Other");
  await team.getByLabel("Other: say what it is for").fill(`ZZ Ladder ${REG}`);
  await team.getByLabel("Details").fill(DETAILS);
  await team.getByLabel("How urgent").selectOption("today");
  await team.locator('input[type="file"]').setInputFiles([photo("ladder.png"), notPhoto]);
  await team.getByRole("button", { name: "Send request" }).click();
  await team.getByText("Your report was sent, but 1 photo didn't.", { exact: false }).waitFor();
  check("a file that isn't a photo is refused, the request still sent", true);
  await team.getByRole("button", { name: "Send photos again" }).click();
  await team.getByText("Your report was sent, but 1 photo didn't.", { exact: false }).waitFor();
  await team.getByRole("button", { name: "Skip photos" }).click();
  await team.getByText("Request sent to the office.").waitFor();
  check("request sent", true);

  // Office: the check (once, unreviewed, from the team app) and the accident show in Fleet.
  await office.reload();
  const panel = office.getByRole("complementary", { name: "Needs attention" });
  await panel.getByText(REG).first().waitFor({ timeout: 10000 }).catch(() => {});
  check("unreviewed team check shows in Needs attention", (await panel.getByText(REG).count()) >= 2);
  await office.getByRole("button", { name: /^Vehicle checks/ }).click();
  await office.getByLabel("Search checks").fill(REG);
  const rows = office.getByTestId("fleet-list").locator("tbody tr").filter({ hasText: REG });
  check("double tap sent the check once", (await rows.count()) === 1, String(await rows.count()));
  check("check marked Team app and not reviewed", (await rows.first().getByText("Team app").count()) === 1 && (await rows.first().getByText("Not reviewed").count()) === 1);
  await rows.first().click();
  await drawer.getByText(/Vehicle check \d+ - photo 2\.png/).waitFor();
  check("both check photos are on the check, once each", (await drawer.getByText(/Vehicle check \d+ - photo \d\.png/).count()) === 2);
  await office.getByRole("button", { name: "Close" }).first().click();

  // Office: team request, then mark it done with a reply.
  await office.goto(`${BASE}/requests`);
  // Team requests is a tab of People and companies > Team (page standard, 29/10/2026).
  check("Team requests is a Team tab (Team highlighted in the menu)",
    (await office.getByRole("navigation", { name: "Team" }).getByRole("link", { name: "Team requests" }).getAttribute("aria-current")) === "page" &&
    (await office.getByRole("navigation", { name: "Main menu" }).getByRole("link", { name: "Team" }).getAttribute("aria-current")) === "page");
  await office.getByLabel("Search requests").fill(DETAILS);
  const req = office.getByTestId("request-list").locator("li").filter({ hasText: DETAILS });
  check("request shows as Today, New, Team app", (await req.getByText("Today").count()) === 1 && (await req.getByText("Team app").count()) === 1);
  check("typed category kept", (await req.getByText(`ZZ Ladder ${REG}`).count()) === 1);
  await req.click();
  await drawer.getByText(/Request \d+ - photo 1\.png/).waitFor();
  check("the good request photo arrived, the bad one didn't", (await drawer.getByText(/Request \d+ - photo \d\./).count()) === 1);
  await drawer.getByRole("button", { name: `Add “ZZ Ladder ${REG}” to the list` }).click();
  await drawer.getByText("isn't on the list").waitFor({ state: "detached" });
  check("office turned the typed category into a list option", true);
  await drawer.getByText("Done", { exact: true }).click();
  await drawer.getByLabel("Office response").fill("ZZ test: ordered");
  await drawer.getByRole("button", { name: "Save" }).click();
  await drawer.getByText(/Closed .* by Test Office One/).waitFor();
  check("marking Done records who closed it", true);
  await shot(office, "03-requests");
  await drawer.getByRole("button", { name: "Delete this request" }).click();
  await office.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await office.getByRole("tab", { name: /^All/ }).click();
  await office.getByTestId("request-list").getByText("Nothing matches the search.").waitFor();
  check("request deleted after the in-app are-you-sure", true);

  // Clean up the fake vehicle (and its check and accident).
  await office.goto(`${BASE}/fleet`);
  await office.getByLabel("Search vehicles").fill(REG);
  await office.getByTestId("fleet-list").getByText(REG).click();
  await drawer.getByRole("button", { name: `Delete ${REG}` }).click();
  await office.getByRole("dialog").last().getByRole("button", { name: "Delete" }).click();
  await office.getByText("Nothing matches the search.").waitFor();

  check("no browser pop-ups", popups === 0, String(popups));
} catch (e) {
  failed++;
  console.log("FAIL  unexpected error:", e.message);
  await shot(team, "error-team");
  await shot(office, "error-office");
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
