#!/usr/bin/env node
// The only way any session opens the old live hub. View and screenshot only.
//
//   node scripts/old-hub.mjs <path?query> <out.png> [--mobile] [--full] [--wait=ms]
//   e.g. node scripts/old-hub.mjs "cbs-admin#jobs" /tmp/old-jobs.png
//
// Also importable: const { openOldHub } = await import("./old-hub.mjs");
//   const hub = await openOldHub({ mobile: false }); await hub.open("cbs-admin"); await hub.shot("x.png"); await hub.close();
//
// Safety (CLAUDE.md, "Old hub"):
// - Every browser request that isn't a GET is aborted. GETs that the old hub uses to change data
//   (save/delete/approve/nudge style endpoints and parameters) are aborted too.
// - The one write allowed is the sign-in request (POST cbs-signin-act, a=login, name + PIN only).
//   It is sent by this script, not by the page, and never with a second PIN, so it can never set a PIN.
//   The session token is kept outside the repo and reused for 25 days, so we don't add a new
//   session row on every run. The page's own session "check" request is aborted like any other POST.
// - Browser pop-ups (confirm/prompt) are dismissed, so a stray click can't confirm anything.
// - Screenshots show real data: write them outside the repo (default: the OS temp folder) or under
//   private/screens/ (git-ignored). Never commit them, never publish them.
//
// Needs OLD_HUB_NAME and OLD_HUB_PIN, and OLD_HUB_URL (the old hub's n8n address, e.g.
// https://<host>/webhook). The address is never written in the repo.
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");

// GET endpoints / parameters on the old hub that change data. Aborted even though they are GETs.
const WRITE_GET_PATH = /\/webhook\/(cbs-(yard-approve|tv-nudge|tv-ping|tv-cast|tv-settings|crew-go|job-file-fresh|page-patcher|clients-import|sp-crawl|layout-patch)|[^/?]*(save|delete|import|backfill|patch))(\?|$|\/)/i;
const WRITE_GET_PARAM = /[?&](a|act|action|op|mode)=(save|delete|del|remove|add|create|update|set|approve|done|move|send|sign|upload|patch|kill|reset|logout|close|reopen)\b/i;

function env(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set (add it to the environment, then start a new session)`);
  return v;
}

export function oldHubBase() {
  return env("OLD_HUB_URL").replace(/\/+$/, "").replace(/\/webhook$/, "");
}

const SESSION_FILE = process.env.OLD_HUB_SESSION_FILE || path.join(os.homedir(), ".cache", "cbs-old-hub", "session.json");
const SESSION_DAYS = 25;

function readSession(name) {
  try {
    const s = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
    if (s.name === name && s.token && Date.now() - s.at < SESSION_DAYS * 864e5) return s;
  } catch {}
  return null;
}

async function signIn(base, name, pin) {
  if (!/^\d{4}$/.test(pin)) throw new Error("OLD_HUB_PIN must be 4 digits");
  // The single allowed write. No pin2: if this person has no PIN yet the old hub refuses instead of setting one.
  const res = await fetch(`${base}/webhook/cbs-signin-act`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a: "login", name, pin, device: "Read-only viewer (rebuild checks)" }),
  });
  const r = await res.json().catch(() => ({}));
  if (!r.ok || !r.token) throw new Error(`old hub sign-in refused: ${r.setPin ? "this name has no PIN set (not setting one)" : r.message || res.status}`);
  const s = { token: r.token, name: r.name || name, at: Date.now() };
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true, mode: 0o700 });
  fs.writeFileSync(SESSION_FILE, JSON.stringify(s), { mode: 0o600 });
  return s;
}

export async function openOldHub({ mobile = false } = {}) {
  const base = oldHubBase();
  const name = env("OLD_HUB_NAME");
  const pin = env("OLD_HUB_PIN");
  let session = readSession(name) || (await signIn(base, name, pin));

  const browser = await chromium.launch();
  const context = await browser.newContext(
    mobile
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "en-GB" }
      : { viewport: { width: 1440, height: 900 }, locale: "en-GB" },
  );
  const blocked = [];
  await context.route("**/*", (route) => {
    const req = route.request();
    const url = req.url();
    if (req.method() !== "GET" || WRITE_GET_PATH.test(url) || WRITE_GET_PARAM.test(url)) {
      blocked.push(`${req.method()} ${url.replace(/[?#].*$/, "").replace(/^https?:\/\/[^/]+/, "")}`);
      return route.abort("blockedbyclient");
    }
    return route.continue();
  });
  // Signed-in state for the page guard, marked as just checked so it doesn't call home to re-check.
  const seed = () => ({ token: session.token, name: session.name, at: session.at, chk: Date.now() });
  await context.addInitScript((s) => {
    try { localStorage.setItem("cbs_session", JSON.stringify(s)); } catch {}
  }, seed());
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));

  return {
    page,
    blocked,
    async open(p, { wait = 2500 } = {}) {
      const url = `${base}/webhook/${String(p).replace(/^\/+/, "").replace(/^webhook\//, "")}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(wait);
      if (/\/webhook\/cbs-signin/.test(page.url())) {
        // Token expired or revoked: sign in once more, then retry.
        fs.rmSync(SESSION_FILE, { force: true });
        session = await signIn(base, name, pin);
        throw new Error("the old hub asked to sign in again; signed in afresh, run again");
      }
      return page;
    },
    async shot(out, { full = false } = {}) {
      fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
      await page.screenshot({ path: out, fullPage: full });
      return out;
    },
    async close() { await browser.close(); },
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const [p, out = path.join(os.tmpdir(), "old-hub-shots", "shot.png")] = args.filter((a) => !a.startsWith("--"));
  if (!p) { console.error("Usage: node scripts/old-hub.mjs <path?query> <out.png> [--mobile] [--full] [--wait=ms]"); process.exit(1); }
  const wait = Number([...flags].find((f) => f.startsWith("--wait="))?.slice(7)) || 2500;
  if (path.resolve(out).startsWith(path.resolve(".")) && !path.resolve(out).includes(`${path.sep}private${path.sep}`)) {
    console.error("Screenshots of the old hub show real data: save them outside the repo or under private/screens/.");
    process.exit(1);
  }
  let hub;
  try {
    hub = await openOldHub({ mobile: flags.has("--mobile") });
    await hub.open(p, { wait });
    await hub.shot(out, { full: flags.has("--full") });
    console.log(`Old hub ${p}: ${out}${hub.blocked.length ? ` (blocked ${hub.blocked.length} non-view requests: ${[...new Set(hub.blocked)].slice(0, 6).join(", ")})` : ""}`);
  } catch (e) {
    console.error(`Old hub view failed: ${e.message.split("\n")[0]}`);
    process.exitCode = 1;
  } finally {
    await hub?.close();
  }
}
