#!/usr/bin/env node
// Copies new commits on cbs-hub's main to the public repo (company-hub-public), after scanning them.
//
// Usage (from a cbs-hub checkout, after a merge to main):
//   node scripts/public-mirror.mjs           scan only, push nothing
//   node scripts/public-mirror.mjs --push    scan, then push if nothing turns up
//
// How it works: the public repo's main is a cleaned copy of cbs-hub's main. Each public commit
// carries a "Source-Commit: <cbs-hub sha>" line. For every newer first-parent commit on cbs-hub's
// main, this builds a public commit with the same files (minus private/, which never goes public),
// message, author and date. Personal email addresses are swapped for GitHub no-reply addresses.
//
// Before anything is pushed, every added line and every commit message is scanned for real names
// and companies (private/public-denylist.txt, never published), UK vehicle registrations, phone
// numbers, emails, postcodes, policy-style numbers, SharePoint links, the live n8n address, and secrets. Any hit stops the run: nothing is pushed.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PUBLIC_URL = "https://github.com/ethan-boostai/company-hub-public.git";
const SOURCE = (process.argv.find((a) => a.startsWith("--source=")) || "").slice(9) || "origin/main"; // --source= only for testing
const EXCLUDE = ["private"]; // paths that never go public
// The H&S policy wording names the director on purpose (Ethan, 30/10/2026).
const NAMES_ALLOWED = new Set(["src/app/(hub)/safety/policy-rules.ts"]);
const push = process.argv.includes("--push");
const fromArg = (process.argv.find((a) => a.startsWith("--from=")) || "").slice(7); // first run only

const git = (args, opts = {}) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts }).trim();
const fail = (msg) => { console.error(`\nSTOP: ${msg}\nNothing was pushed.`); process.exit(1); };

// --- remotes ---
if (!git(["remote"]).split("\n").includes("public")) git(["remote", "add", "public", PUBLIC_URL]);
if (SOURCE === "origin/main") git(["fetch", "-q", "origin", "main"]);
git(["fetch", "-q", "public", "main"]);

// --- where the last run stopped ---
// The public repo started (30/10/2026) as cbs-hub d1f3fb9 with its history cleaned; that first commit
// has no Source-Commit line.
const BASELINE = { public: "dc3a7b6e8c9e9aab07f32fad8a996855b9ad5b10", source: "d1f3fb9bcdd7cc6b4a09899772525b48f9883a33" };
const last = git(["log", "-1", "--format=%(trailers:key=Source-Commit,valueonly)", "public/main"]).trim()
  || fromArg || (git(["rev-parse", "public/main"]) === BASELINE.public ? BASELINE.source : "");
if (!last) fail("the public repo's last commit has no Source-Commit line. Pass --from=<cbs-hub sha it matches>.");
const todo = git(["rev-list", "--reverse", "--first-parent", `${last}..${SOURCE}`]).split("\n").filter(Boolean);
if (!todo.length) { console.log("The public repo is up to date."); process.exit(0); }

// --- trees without private/ ---
const idxDir = mkdtempSync(path.join(tmpdir(), "mirror-"));
const publicTree = (commit) => {
  const env = { ...process.env, GIT_INDEX_FILE: path.join(idxDir, "index") };
  git(["read-tree", commit], { env });
  for (const p of EXCLUDE) git(["rm", "-r", "-q", "--cached", "--ignore-unmatch", p], { env });
  return git(["write-tree"], { env });
};
if (publicTree(last) !== git(["rev-parse", "public/main^{tree}"])) {
  rmSync(idxDir, { recursive: true, force: true });
  fail(`public/main doesn't hold the same files as cbs-hub ${last.slice(0, 7)}. Check by hand before syncing.`);
}

// --- the scan ---
let deny = [];
try {
  deny = git(["show", `${SOURCE}:private/public-denylist.txt`]).split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
} catch {
  fail("private/public-denylist.txt is missing from cbs-hub's main, so the scan can't check real names.");
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (s) => new RegExp(`(?:(?<![A-Za-z0-9])|(?<=\\\\[nrt]))${esc(s)}(?![A-Za-z0-9])`);
const RULES = [
  ...deny.map((d) => ["real name or company", word(d), true]),
  ["UK vehicle registration", /\b(?!ZZ)[A-Z]{2}\d{2} ?[A-Z]{3}\b/],
  ["phone number", /(?:\+44 ?|\b0)7\d{3} ?\d{3} ?\d{3}\b|\b0[12]\d{2,3} ?\d{3} ?\d{3,4}\b/],
  ["email address", /[A-Za-z0-9._%+-]+@(?!example\.(?:com|org)\b|anthropic\.com\b|users\.noreply\.github\.com\b)[A-Za-z0-9-]+\.[A-Za-z.]{2,}/],
  ["postcode", /\b(?!ZZ99)[A-Z]{1,2}\d[\dA-Z]? \d[A-Z]{2}\b/],
  ["policy or licence number", /\b[A-Z]{2,4}\d{3}\/\d{6,}|\b\d{2}[A-Z]{2}\d{8}\b|\bCBDU\d{4,}\b/],
  ["SharePoint link", /https:\/\/(?!example\.)[a-z0-9-]+\.sharepoint\.com/i],
  ["SharePoint drive id", /b![A-Za-z0-9_-]{40,}/],
  ["secret", /-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.|sb_secret_[A-Za-z0-9_-]{10,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|xox[abp]-[A-Za-z0-9-]{10,}/],
  ["key with a value", /\b(APP_SECRET|N8N_[A-Z_]*KEY|TEAM_LINK_KEY|SUPABASE_SERVICE_ROLE_KEY|MS_CLIENT_SECRET|LEGACY_PIN_SALT|[A-Z_]*PASSWORD)\s*[=:]\s*["']?(?!process\.env|\$\{|<|your|change|xxx|example|test|local)[A-Za-z0-9+/_=-]{12,}/],
  ["database URL with a password", /postgres(?:ql)?:\/\/[^:/@\s"']+:(?!pw@|p@|x@|\$\{|<)[^@\s"']{6,}@/],
];
// The live n8n host, kept only as a SHA-256 hash so the address itself is never in the repo.
// Every host name in a new line (and each parent domain of it) is hashed and compared.
const LIVE_N8N_HASHES = new Set(["ba8eee7b935a5e5a41ed26346840bb75bcdedf8e49fe34225d1a66756e7ab628"]);
const hostHit = (text) => {
  for (const host of text.replace(/\\/g, "").toLowerCase().match(/[a-z0-9-]+(?:\.[a-z0-9-]+)+/g) || []) {
    const parts = host.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      if (LIVE_N8N_HASHES.has(createHash("sha256").update(parts.slice(i).join(".")).digest("hex"))) return true;
    }
  }
  return false;
};
// Words that look like a rule but are fine: fake data, public helplines and offices kept on purpose.
const ALLOW = /ZZ99|07700 ?900|0117 ?496|0113 ?496|N18 1QX|SE1 9HS|0345 300 9923|0300 |0800 /;

const findings = [];
const check = (where, text, file = "") => {
  for (const [label, rx, isName] of RULES) {
    if (isName && NAMES_ALLOWED.has(file)) continue;
    const m = text.match(rx);
    if (m && !(ALLOW.test(m[0]))) findings.push(`${where}${file ? ` ${file}` : ""}: ${label}: "${m[0].slice(0, 60)}"`);
  }
  if (hostHit(text)) findings.push(`${where}${file ? ` ${file}` : ""}: the live n8n address`);
};

let prevTree = publicTree(last);
const plan = [];
for (const c of todo) {
  const tree = publicTree(c);
  const short = c.slice(0, 7);
  check(`commit ${short} message`, git(["log", "-1", "--format=%B", c]));
  const diff = git(["diff", "--unified=0", "--no-color", "--no-ext-diff", prevTree, tree]);
  let file = "";
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++ b/")) file = line.slice(6);
    else if (line.startsWith("+") && !line.startsWith("+++")) check(`commit ${short}`, line.slice(1), file);
  }
  plan.push({ c, tree });
  prevTree = tree;
}
rmSync(idxDir, { recursive: true, force: true });

if (findings.length) {
  console.error(findings.slice(0, 50).join("\n"));
  fail(`${findings.length} possible real detail(s) or secret(s) in the new commits. Tell Ethan before going further.`);
}
console.log(`Scanned ${todo.length} commit(s): nothing real or secret found.`);
if (!push) { console.log("Scan only. Run again with --push to publish."); process.exit(0); }

// --- build and push the public commits ---
const noreply = (name, email) =>
  /noreply|example\.(com|org)$/.test(email) ? email : `${name.replace(/[^A-Za-z0-9-]/g, "")}@users.noreply.github.com`;
let parent = git(["rev-parse", "public/main"]);
for (const { c, tree } of plan) {
  const [an, ae, ad, cn, ce, cd] = git(["log", "-1", "--format=%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI", c]).split("\0");
  const msg = `${git(["log", "-1", "--format=%B", c]).trimEnd()}\n\nSource-Commit: ${c}\n`;
  const env = { ...process.env, GIT_AUTHOR_NAME: an, GIT_AUTHOR_EMAIL: noreply(an, ae), GIT_AUTHOR_DATE: ad,
    GIT_COMMITTER_NAME: cn, GIT_COMMITTER_EMAIL: noreply(cn, ce), GIT_COMMITTER_DATE: cd };
  parent = git(["commit-tree", tree, "-p", parent, "-F", "-"], { env, input: msg });
}
git(["push", "-q", "public", `${parent}:refs/heads/main`]);
console.log(`Pushed ${plan.length} commit(s) to company-hub-public (main is now ${parent.slice(0, 7)}).`);
