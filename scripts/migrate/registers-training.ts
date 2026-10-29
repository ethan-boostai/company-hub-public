// Imports the old hub's training records (cbs_training) into training_records (docs/plan.md section 4).
// Re-runnable: rows are matched on legacy ids, so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, holding cbs_training.json (an array of rows, or
// an object with the rows under "rows", "data" or "sample_rows").
// Run Core's People import first: each record is matched to a person on People by name.
//
// Rules (plan approved by Ethan 30/10/2026; "flag, don't guess"):
// - The old table stored the person's name. It must match exactly one person on People (case and
//   extra spaces ignored); otherwise the record is flagged and skipped. No near matches.
// - "Other" tickets take the name typed under them; if none was typed, the record is flagged and skipped.
// - A record that expires before it was issued is flagged; its expiry is kept in the notes.
// - Old document links (docs_json) become files rows holding the SharePoint link.
// - Every old record is kept. Where a person has more than one record for a ticket, the matrix shows
//   the latest and keeps the others as history, as the old matrix did.
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-training.ts <export-folder>
// Write the rows (only at switch-over, when Ethan says so):
//   DATABASE_URL=... node scripts/migrate/registers-training.ts <export-folder> --apply
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
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-training.ts <export-folder> [--apply]");
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

function dateOf(v: unknown, what: string, flags: string[]): string | null {
  const s = text(v)?.slice(0, 10);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T12:00:00Z`))) return s;
  flags.push(`${what}: "${text(v)}" is not a date (left blank)`);
  return null;
}

function fileName(link: string): string {
  try {
    return decodeURIComponent(new URL(link).pathname.split("/").filter(Boolean).pop() ?? "") || "Document";
  } catch {
    return "Document";
  }
}

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
  const rows = await readTable("cbs_training");

  await sql.begin(async (tx) => {
    const people = new Map<string, number>();
    for (const p of await tx<{ id: string; name: string }[]>`select id, name from people`) people.set(key(p.name), Number(p.id));

    let records = 0;
    let files = 0;
    const missingPeople = new Map<string, number>();
    const newTickets = new Set<string>();
    for (const r of rows) {
      const what = `training ${r.id}`;
      const name = text(r.person);
      const personId = name ? people.get(key(name)) : undefined;
      if (!personId) {
        missingPeople.set(name ?? "(blank)", (missingPeople.get(name ?? "(blank)") ?? 0) + 1);
        flags.push(`${what}: person "${name ?? ""}" is not on People (skipped)`);
        continue;
      }
      const other = /^other\b/i.test(String(r.qualification ?? "").trim());
      const qualification = other ? text(r.qual_other) : text(r.qualification);
      if (!qualification) {
        flags.push(`${what} (${name}): ${other ? '"Other" with no ticket name typed under it' : "no ticket"} (skipped)`);
        continue;
      }
      if (other) newTickets.add(qualification);
      const notes: (string | null)[] = [longText(r.notes)];
      const issued = dateOf(r.issued_on, `${what} (${name}, ${qualification}) issued date`, flags);
      let expires = dateOf(r.expires_on, `${what} (${name}, ${qualification}) expiry`, flags);
      if (issued && expires && expires < issued) {
        flags.push(`${what} (${name}, ${qualification}): expires (${expires}) before it was issued (${issued}); expiry kept in the notes`);
        notes.push(`Expiry in the old hub: ${expires}`);
        expires = null;
      }
      const v: Row = {
        person_id: personId, qualification, provider: text(r.provider), reference: text(r.reference), issued_on: issued, expires_on: expires,
        notes: notes.filter(Boolean).join("\n") || null, legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into training_records ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["person_id", "qualification", "provider", "reference", "issued_on", "expires_on", "notes"]))}, updated_by = 'Import'
        returning id`;
      const id = Number(row.id);

      let docs: Row[] = [];
      try {
        const parsed = typeof r.docs_json === "string" ? JSON.parse(r.docs_json || "[]") : r.docs_json ?? [];
        docs = Array.isArray(parsed) ? parsed : [];
      } catch {
        flags.push(`${what} (${name}, ${qualification}): its document list can't be read (no files linked)`);
      }
      for (const d of docs) {
        const link = text(d?.url);
        if (!link) continue;
        const [exists] = await tx`select 1 from files where entity_table = 'training_records' and entity_id = ${id} and sharepoint_url = ${link}`;
        if (!exists) {
          await tx`insert into files (name, storage, sharepoint_url, entity_table, entity_id, role, created_by)
                   values (${text(d?.name) ?? fileName(link)}, 'sharepoint', ${link}, 'training_records', ${id}, 'document', 'Import')`;
        }
        files++;
      }
      records++;
    }
    report.push(`training records: ${rows.length} in, ${records} imported, ${files} document link(s)`);
    if (newTickets.size) report.push(`  "Other" tickets that become ticket names: ${[...newTickets].sort().join(", ")}`);
    if (missingPeople.size) {
      report.push(`  people not on People: ${[...missingPeople].map(([n, c]) => `${n} (${c} record${c === 1 ? "" : "s"})`).join(", ")}`);
    }

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
