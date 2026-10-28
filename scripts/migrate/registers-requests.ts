// Imports the old hub's team requests (cbs_requests) into requests (docs/plan.md section 4).
// Re-runnable: rows are matched on legacy_id. Tool reports that the old team page saved as requests
// come across as requests too.
//
// Input: a folder with cbs_requests.json (an array of rows, or an object with "rows", "data" or "sample_rows").
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-requests.ts <export-folder>
// Write the rows:
//   DATABASE_URL=... node scripts/migrate/registers-requests.ts <export-folder> --apply
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

type Row = Record<string, unknown>;
class DryRun extends Error {}
const only = (v: Row, keys: string[]): Row => Object.fromEntries(keys.map((k) => [k, v[k]]));

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!dir || !url) {
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-requests.ts <export-folder> [--apply]");
  process.exit(1);
}

const text = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};
const urgency = (v: unknown) => ({ today: "today", "this week": "this_week", "no rush": "no_rush" })[String(v ?? "").trim().toLowerCase()] ?? "this_week";
const status = (v: unknown) => ({ new: "new", "in progress": "in_progress", done: "done", declined: "declined" })[String(v ?? "").trim().toLowerCase()] ?? "new";
// Old dates are "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" in UK time.
const ukTime = (v: unknown): string | null => {
  const s = text(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  return /T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : `${s.slice(0, 10)}T12:00`;
};

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const report: string[] = [];
const unmapped: string[] = [];
console.log(`${apply ? "IMPORTING INTO" : "Dry run against"} ${(() => { try { return new URL(url).host; } catch { return "(unknown)"; } })()}, from ${dir}`);

try {
  const raw = JSON.parse(await readFile(path.join(dir, "cbs_requests.json"), "utf8").catch(() => "[]"));
  const rows = (Array.isArray(raw) ? raw : raw.rows ?? raw.data ?? raw.sample_rows ?? []) as Row[];
  const people = new Map((await sql<{ id: string; name: string }[]>`select id, name from people`).map((p) => [p.name.trim().toLowerCase(), Number(p.id)]));

  await sql.begin(async (tx) => {
    let n = 0;
    for (const r of rows) {
      const by = text(r.requested_by);
      const details = text(r.details);
      if (!by || !details) {
        unmapped.push(`request ${r.id}: no name or no details`);
        continue;
      }
      const personId = people.get(by.toLowerCase()) ?? null;
      if (!personId) unmapped.push(`request ${r.id}: "${by}" is not in People (name kept, no person link)`);
      const v: Row = {
        requested_by: by, requested_by_id: personId, category: text(r.category) ?? "Other", urgency: urgency(r.urgency), details,
        status: status(r.status), response: text(r.response), source: "team", legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into requests ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["requested_by", "requested_by_id", "category", "urgency", "details", "status", "response"]))}, updated_by = 'Import'
        returning id`;
      const at = ukTime(r.requested_at);
      const closed = ukTime(r.closed_at);
      await tx`update requests set
          requested_at = coalesce((${at}::text)::timestamp at time zone 'Europe/London', requested_at),
          closed_at = case when ${closed}::text is null then null else (${closed}::text)::timestamp at time zone 'Europe/London' end
        where id = ${row.id}`;
      n++;
    }
    report.push(`requests: ${rows.length} in, ${n} imported`);
    if (!apply) throw new DryRun();
  });
} catch (e) {
  if (!(e instanceof DryRun)) {
    console.error("Import failed, nothing was saved:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  }
} finally {
  await sql.end();
}

for (const line of report) console.log(line);
if (unmapped.length) {
  console.log(`\nCould not map ${unmapped.length}:`);
  for (const line of unmapped) console.log(`  - ${line}`);
}
console.log(apply ? "\nDone." : "\nDry run only: nothing was saved. Add --apply to write.");
