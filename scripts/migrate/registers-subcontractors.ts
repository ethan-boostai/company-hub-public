// Imports the old hub's subcontractors, suppliers and their documents (docs/plan.md section 4).
// Re-runnable: rows are matched on legacy ids, so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, one file per table, named
//   cbs_subcontractors.json, cbs_suppliers.json, cbs_sub_docs.json
// Each file holds an array of rows, or an object with the rows under "rows", "data" or "sample_rows".
//
// Rules (approved 28/10/2026):
// - cbs_subcontractors rows with type "Supplier" become suppliers. If a supplier with the same name
//   is already in cbs_suppliers, the two are merged: blanks are filled, notes are kept.
// - "Other (name it below)" document items take the name typed under it.
// - Documents are matched to their company by name (the old table stored the name, not an id).
// - Old document links become files rows holding the SharePoint link.
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-subcontractors.ts <export-folder>
// Write the rows:
//   DATABASE_URL=... node scripts/migrate/registers-subcontractors.ts <export-folder> --apply
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
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-subcontractors.ts <export-folder> [--apply]");
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
const date = (v: unknown): string | null => {
  const s = text(v)?.slice(0, 10);
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
};
const yes = (v: unknown): boolean => v === true || /^(yes|true|1)$/i.test(String(v ?? "").trim());
const key = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const joinNotes = (...parts: (string | null)[]) => parts.filter(Boolean).join("\n") || null;

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
const unmapped: string[] = [];

try {
  const [subRows, supRows, docRows] = await Promise.all(["cbs_subcontractors", "cbs_suppliers", "cbs_sub_docs"].map(readTable));

  await sql.begin(async (tx) => {
    // Suppliers from cbs_suppliers.
    const supplierIds = new Map<string, number>();
    for (const r of supRows) {
      const name = text(r.name);
      if (!name) {
        unmapped.push(`supplier ${r.id}: no name`);
        continue;
      }
      if (supplierIds.has(key(name))) {
        unmapped.push(`supplier ${r.id}: "${name}" is in the old suppliers list twice (skipped the second)`);
        continue;
      }
      const v: Row = {
        name, contact: text(r.contact), email: text(r.email)?.toLowerCase() ?? null, phone: text(r.phone), address: longText(r.address),
        account_no: text(r.account_no), notes: longText(r.notes), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into suppliers ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["name", "contact", "email", "phone", "address", "account_no", "notes"]))}, updated_by = 'Import'
        returning id`;
      supplierIds.set(key(name), Number(row.id));
    }

    // Subcontractors, and old "Supplier" rows that become (or merge into) suppliers.
    const subIds = new Map<string, number>();
    let subs = 0;
    let merged = 0;
    let movedSuppliers = 0;
    for (const r of subRows) {
      const name = text(r.company);
      if (!name) {
        unmapped.push(`subcontractor ${r.id}: no company name`);
        continue;
      }
      // Licence and insurance-expiry columns were never on the old form; keep anything in them as notes.
      const extra = [
        text(r.licence_type) || text(r.licence_no) ? `Licence: ${[text(r.licence_type), text(r.licence_no), date(r.licence_expiry)].filter(Boolean).join(", ")}` : null,
        date(r.insurance_expiry) ? `Insurance expiry in the old hub: ${date(r.insurance_expiry)}` : null,
      ];
      if (/^supplier$/i.test(String(r.type ?? "").trim())) {
        const existing = supplierIds.get(key(name));
        if (existing) {
          // Same company already in cbs_suppliers: fill blanks only.
          await tx`update suppliers set
              trade = coalesce(trade, ${text(r.trade)}), contact = coalesce(contact, ${text(r.contact)}),
              email = coalesce(email, ${text(r.email)?.toLowerCase() ?? null}), phone = coalesce(phone, ${text(r.mobile)}),
              legacy_subcontractor_id = ${Number(r.id)}, updated_by = 'Import'
            where id = ${existing} and (legacy_subcontractor_id is null or legacy_subcontractor_id = ${Number(r.id)})`;
          merged++;
          continue;
        }
        const v: Row = {
          name, trade: text(r.trade), contact: text(r.contact), email: text(r.email)?.toLowerCase() ?? null, phone: text(r.mobile),
          notes: joinNotes(longText(r.notes), ...extra), legacy_subcontractor_id: Number(r.id), created_by: "Import",
        };
        const [row] = await tx<{ id: string }[]>`
          insert into suppliers ${tx(v)}
          on conflict (legacy_subcontractor_id) do update set ${tx(only(v, ["name", "trade", "contact", "email", "phone", "notes"]))}, updated_by = 'Import'
          returning id`;
        supplierIds.set(key(name), Number(row.id));
        movedSuppliers++;
        continue;
      }
      if (subIds.has(key(name))) {
        unmapped.push(`subcontractor ${r.id}: "${name}" is in the old list twice (skipped the second)`);
        continue;
      }
      const v: Row = {
        company: name, trade: text(r.trade), contact: text(r.contact), email: text(r.email)?.toLowerCase() ?? null, mobile: text(r.mobile),
        approved: yes(r.approved), inducted: yes(r.inducted), notes: joinNotes(longText(r.notes), ...extra), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into subcontractors ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["company", "trade", "contact", "email", "mobile", "approved", "inducted", "notes"]))}, updated_by = 'Import'
        returning id`;
      subIds.set(key(name), Number(row.id));
      subs++;
    }
    report.push(`suppliers (cbs_suppliers): ${supRows.length} in`);
    report.push(`cbs_subcontractors: ${subRows.length} in -> ${subs} subcontractors, ${movedSuppliers} moved to suppliers, ${merged} merged into an existing supplier`);

    // Documents, matched by company name (subcontractor first, then supplier).
    let docs = 0;
    for (const r of docRows) {
      const company = key(r.company);
      const subId = subIds.get(company) ?? null;
      const supId = subId ? null : supplierIds.get(company) ?? null;
      if (!subId && !supId) {
        unmapped.push(`document ${r.id}: company "${r.company}" not found`);
        continue;
      }
      const other = /^other/i.test(String(r.item ?? ""));
      const item = (other ? text(r.custom_name) : text(r.item)) ?? text(r.custom_name) ?? "Other";
      const v: Row = {
        subcontractor_id: subId, supplier_id: supId, item, reference: text(r.reference), issued_on: date(r.issued_on),
        expires_on: date(r.expires_on), notes: longText(r.notes), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into subcontractor_docs ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["subcontractor_id", "supplier_id", "item", "reference", "issued_on", "expires_on", "notes"]))}, updated_by = 'Import'
        returning id`;
      const link = text(r.doc_url);
      if (link) {
        const [exists] = await tx`select 1 from files where entity_table = 'subcontractor_docs' and entity_id = ${row.id} and sharepoint_url = ${link}`;
        if (!exists) {
          await tx`insert into files (name, storage, sharepoint_url, entity_table, entity_id, role, created_by)
                   values (${fileName(link)}, 'sharepoint', ${link}, 'subcontractor_docs', ${row.id}, 'document', 'Import')`;
        }
      }
      docs++;
    }
    report.push(`documents: ${docRows.length} in, ${docs} imported`);

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
