// Imports the old hub's time off (cbs_time_off) into time_off (docs/plan.md section 4).
// Re-runnable: rows are matched on legacy ids, so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, holding cbs_time_off.json (an array of rows, or
// an object with the rows under "rows", "data" or "sample_rows").
// Run Core's People import first: each record is matched to a person on People by name.
//
// Rules (plan approved by Ethan 30/10/2026; "flag, don't guess"):
// - The old table stored the person's name ("worker"). It must match exactly one person on People
//   (case and extra spaces ignored); otherwise the record is flagged and skipped.
// - Type: "Other" with nothing to name it is flagged and imported as "Other".
// - Status must be Pending, Under review, Approved or Declined (blank is Pending, listed); anything
//   else is flagged and the record is skipped.
// - Working days: the old number is kept. Where it differs from the new count (Mon-Fri, skipping
//   England and Wales bank holidays) it is kept as an office override and listed for checking.
// - "Morning only" / "Afternoon only" over more than one day can't be stored: flagged, imported as full days.
// - The old table didn't say whether a request came from the team page, so all come in as Office.
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-time-off.ts <export-folder>
// Write the rows (only at switch-over, when Ethan says so):
//   DATABASE_URL=... node scripts/migrate/registers-time-off.ts <export-folder> --apply
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

// The app's stored bank holiday list, loaded by file path (plain Node can't follow the app's imports).
const { BANK_HOLIDAYS } = (await import(new URL("../../src/app/(hub)/people/time-off/bank-holidays.ts", import.meta.url).href)) as { BANK_HOLIDAYS: Record<string, string> };

type PartDay = "full" | "morning" | "afternoon";
// The same count as the app (src/app/(hub)/people/time-off/rules.ts): Mon to Fri, skipping England
// and Wales bank holidays; a morning or afternoon is half a day. Kept here because scripts run in
// plain Node, which can't follow the app's import paths.
function workingDays(from: string, to: string, part: PartDay): { days: number } {
  let days = 0;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !BANK_HOLIDAYS[iso]) days++;
  }
  return { days: part !== "full" && from === to ? (days ? 0.5 : 0) : days };
}

type Row = Record<string, unknown>;
class DryRun extends Error {}
const only = (v: Row, keys: string[]): Row => Object.fromEntries(keys.map((k) => [k, v[k]]));

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!dir || !url) {
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-time-off.ts <export-folder> [--apply]");
  process.exit(1);
}

async function readTable(name: string): Promise<Row[]> {
  const raw = JSON.parse(await readFile(path.join(dir, `${name}.json`), "utf8").catch(() => "[]"));
  return (Array.isArray(raw) ? raw : raw.rows ?? raw.data ?? raw.sample_rows ?? []) as Row[];
}

const text = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
  return s || null;
};
const longText = (v: unknown): string | null => {
  const s = v == null ? "" : String(v).trim();
  return s || null;
};
const key = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
function dateOf(v: unknown): string | null {
  const s = text(v)?.slice(0, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`)) ? s : null;
}

const STATUSES: Record<string, string> = { pending: "pending", "under review": "under_review", approved: "approved", declined: "declined" };
const PARTS: Record<string, PartDay> = { "full days": "full", "full day": "full", "morning only": "morning", "afternoon only": "afternoon" };

const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const host = (() => {
  try {
    return new URL(url).host;
  } catch {
    return "(unknown)";
  }
})();
console.log(`${apply ? "IMPORTING INTO" : "Dry run against"} ${host}, from ${dir}`);
const report: string[] = [];
const flags: string[] = [];

try {
  const rows = await readTable("cbs_time_off");

  await sql.begin(async (tx) => {
    const people = new Map<string, number>();
    for (const p of await tx<{ id: string; name: string }[]>`select id, name from people`) people.set(key(p.name), Number(p.id));

    let imported = 0;
    for (const r of rows) {
      const name = text(r.worker);
      const what = `time off ${r.id}${name ? ` (${name})` : ""}`;
      const personId = name ? people.get(key(name)) : undefined;
      if (!personId) {
        flags.push(`${what}: person "${name ?? ""}" is not on People (skipped)`);
        continue;
      }
      const from = dateOf(r.from_date);
      const to = dateOf(r.to_date) ?? from;
      if (!from || !to || to < from) {
        flags.push(`${what}: dates "${text(r.from_date) ?? ""}" to "${text(r.to_date) ?? ""}" can't be read (skipped)`);
        continue;
      }
      let kind = text(r.kind);
      if (!kind || /^other$/i.test(kind)) {
        flags.push(`${what}: type "${kind ?? ""}" doesn't say what it was (imported as "Other")`);
        kind = "Other";
      }
      const statusRaw = key(r.status);
      const status = statusRaw ? STATUSES[statusRaw] : "pending";
      if (!status) {
        flags.push(`${what}: status "${text(r.status)}" isn't one of the old statuses (skipped)`);
        continue;
      }
      if (!statusRaw) report.push(`  ${what}: blank status set to Pending`);
      let part: PartDay = PARTS[key(r.part_day)] ?? "full";
      if (text(r.part_day) && !PARTS[key(r.part_day)]) flags.push(`${what}: part day "${text(r.part_day)}" not recognised (imported as full days)`);
      if (part !== "full" && from !== to) {
        flags.push(`${what}: "${text(r.part_day)}" over more than one day can't be stored (imported as full days)`);
        part = "full";
      }
      const counted = workingDays(from, to, part).days;
      const oldDays = Number(String(r.days ?? "").replace(/[^\d.]/g, ""));
      const haveOld = String(r.days ?? "").trim() !== "" && Number.isFinite(oldDays);
      if (haveOld && oldDays !== counted) report.push(`  ${what}: old count ${oldDays} kept as an office override (new count ${counted})`);
      const requested = text(r.requested_at);
      const v: Row = {
        person_id: personId, kind, from_date: from, to_date: to, part_day: part, days: haveOld ? oldDays : counted,
        days_overridden: haveOld && oldDays !== counted, notes: longText(r.notes), status, response: longText(r.response),
        source: "office", legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into time_off ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["person_id", "kind", "from_date", "to_date", "part_day", "days", "days_overridden", "notes", "status", "response"]))}, updated_by = 'Import'
        returning id`;
      if (requested && !Number.isNaN(Date.parse(requested))) await tx`update time_off set requested_at = ${new Date(requested)} where id = ${row.id}`;
      imported++;
    }
    report.unshift(`time off: ${rows.length} in, ${imported} imported (all as Office: the old table didn't record where a request came from)`);

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
if (flags.length) {
  console.log(`\nNeeds checking (${flags.length}):`);
  for (const line of flags) console.log(`  - ${line}`);
}
console.log(apply ? "\nDone." : "\nDry run only: nothing was saved. Add --apply to write.");
