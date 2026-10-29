// Imports the old hub's equipment and materials (docs/plan.md section 4): cbs_assets,
// cbs_asset_services, cbs_materials, cbs_stock_moves and cbs_stocktakes.
// Re-runnable: rows are matched on legacy ids, so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, one file per table, named
//   cbs_assets.json, cbs_asset_services.json, cbs_materials.json, cbs_stock_moves.json, cbs_stocktakes.json
// Each file holds an array of rows, or an object with the rows under "rows", "data" or "sample_rows".
// Import Fleet (vehicles), Subcontractors and suppliers, and People first: locations, suppliers and
// "with worker" names are matched against them.
//
// Rules (plan approved by Ethan 29/10/2026):
// - Locations: "Make model - Driver (REG)" is matched to the vehicle by its reg; "With worker" uses the
//   asset's assigned_to name; anything else is kept as a place (CBS Warehouse, CBS Office, ...).
// - The old hub kept one materials row per location. Rows with the same name and unit become one
//   material, with its stock at each location.
// - Plant out on a job (yard_status, out_job, out_with, due_back) is Site work (job_plant); it is kept
//   as a dated line in the equipment's notes until plant bookings are built.
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-equipment.ts <export-folder>
// Write the rows:
//   DATABASE_URL=... node scripts/migrate/registers-equipment.ts <export-folder> --apply
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
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-equipment.ts <export-folder> [--apply]");
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
const num = (v: unknown): number | null => {
  const s = text(v)?.replace(/[£,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
};
const key = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase();
const joinNotes = (...parts: (string | null)[]) => parts.filter(Boolean).join("\n") || null;

const STATUS: Record<string, string> = {
  "in service": "in_service", "needs repair": "needs_repair", "out for service": "out_for_service", lost: "lost", retired: "retired",
  disposed: "retired", "written off": "retired",
};
const STOCKTAKE: Record<string, string> = { pending: "pending", approved: "approved", rejected: "rejected" };

function months(v: unknown): number | null {
  const s = key(v);
  if (!s || s === "none") return null;
  const m = s.match(/(\d+)\s*(month|mth|m\b)?/);
  if (!m) return /year|annual/.test(s) ? 12 : null;
  const n = Number(m[1]) * (/year/.test(s) ? 12 : 1);
  return n >= 1 && n <= 120 ? n : null;
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

type Loc = { place: string | null; vehicleId: number | null; personId: number | null; label: string };

try {
  const [assetRows, serviceRows, materialRows, moveRows, stocktakeRows] = await Promise.all(
    ["cbs_assets", "cbs_asset_services", "cbs_materials", "cbs_stock_moves", "cbs_stocktakes"].map(readTable),
  );
  const vehicles = new Map((await sql<{ id: string; reg: string }[]>`select id, reg from vehicles`).map((v) => [v.reg, Number(v.id)]));
  const people = new Map((await sql<{ id: string; name: string }[]>`select id, name from people`).map((p) => [key(p.name), Number(p.id)]));
  const suppliers = new Map((await sql<{ id: string; name: string }[]>`select id, name from suppliers`).map((s) => [key(s.name), Number(s.id)]));

  // Old location text -> a place, a vehicle (by the reg in brackets) or a person.
  function location(raw: unknown, assignedTo: unknown, what: string): Loc | null {
    const t = text(raw);
    if (!t) return null;
    const reg = t.match(/\(([A-Za-z0-9 ]{2,10})\)\s*$/)?.[1]?.toUpperCase().replace(/\s/g, "");
    if (reg) {
      const id = vehicles.get(reg);
      if (id) return { place: null, vehicleId: id, personId: null, label: t };
      unmapped.push(`${what}: vehicle ${reg} ("${t}") isn't in Fleet, kept as a place`);
    }
    if (/^with worker$/i.test(t)) {
      const name = text(assignedTo);
      const id = name ? people.get(key(name)) : undefined;
      if (id) return { place: null, vehicleId: null, personId: id, label: `With ${name}` };
      unmapped.push(`${what}: "With worker" but ${name ? `"${name}" isn't in People` : "no name"}, left with no location`);
      return null;
    }
    return { place: t.slice(0, 80), vehicleId: null, personId: null, label: t };
  }

  await sql.begin(async (tx) => {
    // Equipment.
    const assetIds = new Map<string, number>(); // by legacy id, tag and name
    let assets = 0;
    for (const r of assetRows) {
      const name = text(r.name);
      if (!name) {
        unmapped.push(`asset ${r.id}: no name`);
        continue;
      }
      const status = STATUS[key(r.status)];
      if (r.status && !status) unmapped.push(`asset ${r.id} (${name}): status "${r.status}" not known, set to In service`);
      const loc = location(r.location, r.assigned_to, `asset ${r.id} (${name})`);
      const out = key(r.yard_status) === "out"
        ? `Out on job ${text(r.out_job) ?? "?"}${text(r.out_with) ? ` with ${text(r.out_with)}` : ""}${date(r.out_since) ? ` since ${date(r.out_since)}` : ""}${date(r.due_back) ? `, due back ${date(r.due_back)}` : ""} (old hub)`
        : null;
      const v: Row = {
        asset_tag: text(r.asset_tag), name, category: text(r.category), make_model: text(r.make_model), serial_no: text(r.serial_no),
        status: status ?? "in_service", location_place: loc?.place ?? null, location_vehicle_id: loc?.vehicleId ?? null, location_person_id: loc?.personId ?? null,
        purchased_on: date(r.purchased_on), service_interval_months: months(r.service_interval), last_service_on: date(r.last_service),
        next_service_on: date(r.next_service), test_tag_due: date(r.test_tag_due), hav_magnitude: num(r.hav_magnitude),
        hav_trigger_mins: num(r.hav_trigger_mins) == null ? null : Math.round(num(r.hav_trigger_mins)!), hav_ref: text(r.hav_ref),
        notes: joinNotes(longText(r.notes), out), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into assets ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, Object.keys(v).filter((k) => k !== "legacy_id" && k !== "created_by")))}, updated_by = 'Import'
        returning id`;
      const id = Number(row.id);
      assetIds.set(`id:${r.id}`, id);
      if (v.asset_tag) assetIds.set(`tag:${key(v.asset_tag)}`, id);
      assetIds.set(`name:${key(name)}`, id);
      assets++;
    }
    report.push(`equipment (cbs_assets): ${assetRows.length} in, ${assets} imported`);

    // Equipment services, matched by tag or name.
    let services = 0;
    for (const r of serviceRows) {
      const a = key(r.asset);
      const assetId = assetIds.get(`tag:${a}`) ?? assetIds.get(`name:${a}`) ?? assetIds.get(`id:${text(r.asset)}`);
      const on = date(r.serviced_on);
      if (!assetId || !on) {
        unmapped.push(`asset service ${r.id}: ${!assetId ? `equipment "${r.asset}" not found` : "no service date"}`);
        continue;
      }
      const v: Row = {
        asset_id: assetId, serviced_on: on, serviced_by: text(r.serviced_by), work_done: longText(r.work_done), cost: num(r.cost),
        next_due: date(r.next_due), notes: longText(r.notes), legacy_id: Number(r.id), created_by: "Import",
      };
      await tx`insert into asset_services ${tx(v)}
               on conflict (legacy_id) do update set ${tx(only(v, ["asset_id", "serviced_on", "serviced_by", "work_done", "cost", "next_due", "notes"]))}, updated_by = 'Import'`;
      services++;
    }
    report.push(`equipment services: ${serviceRows.length} in, ${services} imported`);

    // Materials: one per name and unit, stock per location.
    const groups = new Map<string, Row[]>();
    for (const r of materialRows) {
      const name = text(r.name);
      if (!name) {
        unmapped.push(`material ${r.id}: no name`);
        continue;
      }
      const k = `${key(name)}|${key(r.unit) || "each"}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }
    const materialByLegacy = new Map<string, number>();
    let stockRows = 0;
    for (const rows of groups.values()) {
      const first = rows[0];
      const legacy = rows.map((r) => Number(r.id));
      const latestCount = rows.filter((r) => date(r.last_counted_on)).sort((a, b) => String(b.last_counted_on).localeCompare(String(a.last_counted_on)))[0];
      const supplierName = rows.map((r) => text(r.supplier)).find(Boolean) ?? null;
      const supplierId = supplierName ? suppliers.get(key(supplierName)) ?? null : null;
      if (supplierName && !supplierId) unmapped.push(`material "${first.name}": supplier "${supplierName}" not found, kept in notes`);
      const pick = (f: string) => rows.map((r) => r[f]).find((x) => text(x) != null);
      const v: Row = {
        name: text(first.name), category: text(pick("category")), unit: text(first.unit) ?? "each", supplier_id: supplierId,
        supplier_code: text(pick("supplier_code")), cost: num(pick("cost")), min_level: num(pick("min_level")), reorder_qty: num(pick("reorder_qty")),
        sm8_uuid: text(pick("sm8_uuid")), status: rows.every((r) => key(r.status) === "discontinued") ? "discontinued" : "active",
        last_counted_on: latestCount ? date(latestCount.last_counted_on) : null, last_counted_by: latestCount ? text(latestCount.last_counted_by) : null,
        notes: joinNotes(...[...new Set(rows.map((r) => longText(r.notes)))], supplierName && !supplierId ? `Supplier in the old hub: ${supplierName}` : null,
          text(pick("sds_product")) ? `Safety data sheet product: ${text(pick("sds_product"))}` : null),
        legacy_ids: legacy, created_by: "Import",
      };
      const [existing] = await tx<{ id: string }[]>`select id from materials where legacy_ids && ${legacy}::bigint[] limit 1`;
      let id: number;
      if (existing) {
        id = Number(existing.id);
        await tx`update materials set ${tx(only(v, Object.keys(v).filter((k) => k !== "created_by")))}, updated_by = 'Import' where id = ${id}`;
      } else {
        const [row] = await tx<{ id: string }[]>`
          insert into materials ${tx(v)}
          on conflict (lower(name), lower(unit)) do update set legacy_ids = materials.legacy_ids || excluded.legacy_ids, updated_by = 'Import'
          returning id`;
        id = Number(row.id);
      }
      for (const r of rows) {
        materialByLegacy.set(String(r.id), id);
        const loc = location(r.location, null, `material ${r.id} (${first.name})`);
        const q = num(r.qty_on_hand) ?? 0;
        if (!loc || loc.personId) {
          if (q) unmapped.push(`material ${r.id} (${first.name}): ${q} with no usable location, not imported`);
          continue;
        }
        if (q < 0) {
          unmapped.push(`material ${r.id} (${first.name}): negative stock ${q} set to 0`);
        }
        await tx`
          insert into material_stock (material_id, location_place, location_vehicle_id, qty)
          values (${id}, ${loc.place}, ${loc.vehicleId}, ${Math.max(0, q)})
          on conflict (material_id, coalesce(lower(location_place), ''), coalesce(location_vehicle_id, 0)) do update set qty = excluded.qty`;
        stockRows++;
      }
    }
    report.push(`materials (cbs_materials): ${materialRows.length} rows in -> ${groups.size} materials, stock at ${stockRows} location(s)`);

    // Stock history.
    let moves = 0;
    for (const r of moveRows) {
      const materialId = materialByLegacy.get(String(r.material_id ?? "")) ?? null;
      const reason = text(r.reason) ?? "Imported";
      if (!materialId) {
        unmapped.push(`stock move ${r.id}: material "${r.material ?? r.material_id}" not found`);
        continue;
      }
      const loc = location(r.location, null, `stock move ${r.id}`);
      const v: Row = {
        at: text(r.at) ?? new Date().toISOString(), by: text(r.by), material_id: materialId, location_label: loc?.label ?? "Not recorded",
        location_place: loc?.place ?? null, location_vehicle_id: loc?.vehicleId ?? null, change: num(r.change), qty_after: num(r.qty_after),
        reason, job_ref: text(r.job_no) ?? text(r.ref)?.replace(/^job\s*/i, "") ?? null, notes: longText(r.notes), legacy_id: Number(r.id),
      };
      await tx`insert into stock_moves ${tx(v)} on conflict (legacy_id) do nothing`;
      moves++;
    }
    report.push(`stock moves: ${moveRows.length} in, ${moves} imported`);

    // Stocktakes and their lines.
    let takes = 0;
    for (const r of stocktakeRows) {
      const loc = location(r.location, null, `stocktake ${r.id}`);
      const status = STOCKTAKE[key(r.status)] ?? "pending";
      let lines: Row[] = [];
      try {
        lines = JSON.parse(String(r.lines_json ?? "[]"));
      } catch {
        unmapped.push(`stocktake ${r.id}: lines could not be read`);
      }
      const v: Row = {
        location_label: loc?.label ?? text(r.location) ?? "Not recorded", location_place: loc?.place ?? null, location_vehicle_id: loc?.vehicleId ?? null,
        status, counted_by: text(r.counted_by) ?? "Unknown", counted_at: text(r.created_at) ?? new Date().toISOString(),
        decided_by: text(r.decided_by), decided_at: text(r.decided_at), notes: longText(r.notes), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into stocktakes ${tx(v)}
        on conflict (legacy_id) do update set ${tx(only(v, ["location_label", "location_place", "location_vehicle_id", "status", "counted_by", "decided_by", "decided_at", "notes"]))}
        returning id`;
      await tx`delete from stocktake_lines where stocktake_id = ${row.id}`;
      for (const l of lines) {
        const materialId = materialByLegacy.get(String(l.id ?? ""));
        const counted = num(l.counted);
        if (!materialId || counted == null) continue;
        await tx`insert into stocktake_lines (stocktake_id, material_id, expected, counted, applied)
                 values (${row.id}, ${materialId}, ${num(l.system) ?? 0}, ${Math.max(0, counted)}, ${status !== "rejected"})`;
      }
      takes++;
    }
    report.push(`stocktakes: ${stocktakeRows.length} in, ${takes} imported`);

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
