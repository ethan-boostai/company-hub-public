// Imports the old hub's fleet tables into vehicles, vehicle_checks, vehicle_services and
// vehicle_accidents (docs/plan.md section 4). Re-runnable: rows are matched on legacy_id (the old
// n8n row id), so running it again updates rather than duplicates.
//
// Input: a folder of JSON exports of the n8n tables, one file per table, named
//   cbs_vehicles.json, cbs_vehicle_checks.json, cbs_vehicle_services.json, cbs_vehicle_accidents.json
// Each file holds an array of rows, or an object with the rows under "rows", "data" or "sample_rows".
//
// Usage (dry run: reads and reports, writes nothing):
//   DATABASE_URL=... node scripts/migrate/registers-fleet.ts <export-folder>
// Write the rows:
//   DATABASE_URL=... node scripts/migrate/registers-fleet.ts <export-folder> --apply
//
// Old document links (doc_url, receipt_url) become files rows holding the SharePoint link.
// Old check photos (cbs_photos) are not imported: the old check table has no rows today.
import { readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

type Row = Record<string, unknown>;
class DryRun extends Error {}
// The columns to update when a row is imported again.
const only = (v: Row, keys: string[]): Row => Object.fromEntries(keys.map((k) => [k, v[k]]));

const [dir] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const apply = process.argv.includes("--apply");
const url = process.env.DATABASE_URL;
if (!dir || !url) {
  console.error("Usage: DATABASE_URL=... node scripts/migrate/registers-fleet.ts <export-folder> [--apply]");
  process.exit(1);
}

async function readTable(name: string): Promise<Row[]> {
  const file = path.join(dir, `${name}.json`);
  const raw = JSON.parse(await readFile(file, "utf8").catch(() => "[]"));
  const rows = Array.isArray(raw) ? raw : raw.rows ?? raw.data ?? raw.sample_rows ?? [];
  return rows as Row[];
}

/* ---------- value conversions ---------- */

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
const int = (v: unknown): number | null => {
  const s = text(v)?.replace(/[^0-9.]/g, "");
  if (!s) return null;
  const n = Math.round(Number(s));
  return Number.isFinite(n) ? n : null;
};
const money = (v: unknown): string | null => {
  const s = text(v)?.replace(/[£,\s]/g, "");
  return s && /^\d+(\.\d+)?$/.test(s) ? Number(s).toFixed(2) : null;
};
const yes = (v: unknown): boolean => v === true || /^(yes|true|1)$/i.test(String(v ?? "").trim());
const bool = (v: unknown, fallback: boolean): boolean => (v == null || v === "" ? fallback : yes(v));
const reg = (v: unknown): string => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

function frequency(r: Row): string {
  const f = String(r.insp_freq ?? "").trim().toLowerCase();
  if (f === "weekly" || f === "monthly" || f === "quarterly") return f;
  if (f === "not required") return "not_required";
  return yes(r.no_monthly) ? "not_required" : "monthly";
}

function checkStatus(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "off road") return "off_road";
  if (s === "defects logged") return "defects";
  if (s === "defects fixed") return "defects_fixed";
  return "passed";
}

function accidentStatus(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "claim lodged") return "claim_lodged";
  if (s === "repairs booked") return "repairs_booked";
  if (s === "closed") return "closed";
  return "reported";
}

// The old team page's check text "Submitted from the team page" marks crew reports.
const sourceOf = (r: Row) => (/team page/i.test(String(r.notes ?? "")) ? "team" : "office");

function fileName(link: string): string {
  try {
    const last = decodeURIComponent(new URL(link).pathname.split("/").filter(Boolean).pop() ?? "");
    return last || "Document";
  } catch {
    return "Document";
  }
}

/* ---------- import ---------- */

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
  const [vehicles, checks, services, accidents] = await Promise.all(
    ["cbs_vehicles", "cbs_vehicle_checks", "cbs_vehicle_services", "cbs_vehicle_accidents"].map(readTable),
  );
  const people = new Map(
    (await sql<{ id: string; name: string }[]>`select id, name from people`).map((p) => [p.name.trim().toLowerCase(), Number(p.id)]),
  );

  await sql.begin(async (tx) => {
    const files = async (table: string, id: number, link: unknown, role: string) => {
      const u = text(link);
      if (!u) return;
      const [exists] = await tx`select 1 from files where entity_table = ${table} and entity_id = ${id} and sharepoint_url = ${u}`;
      if (exists) return;
      await tx`insert into files (name, storage, sharepoint_url, entity_table, entity_id, role, created_by)
               values (${fileName(u)}, 'sharepoint', ${u}, ${table}, ${id}, ${role}, 'Import')`;
    };

    // Vehicles
    const vehicleIds = new Map<string, number>();
    let n = 0;
    for (const r of vehicles) {
      const plate = reg(r.reg);
      if (!plate) {
        unmapped.push(`vehicle ${r.id}: no reg`);
        continue;
      }
      const driver = text(r.assigned_to);
      const driverId = driver ? people.get(driver.toLowerCase()) ?? null : null;
      if (driver && !driverId) unmapped.push(`vehicle ${plate}: driver "${driver}" is not in People (left blank, kept in notes)`);
      const notes = [longText(r.notes), driver && !driverId ? `Driver in the old hub: ${driver}` : null].filter(Boolean).join("\n") || null;
      const v = {
        reg: plate, make_model: text(r.make_model), year: int(r.year), assigned_to_id: driverId,
        vehicle_tax_due: date(r.tax_due), mot_expiry: date(r.mot_expiry), service_due: date(r.service_due),
        inspection_frequency: frequency(r), next_inspection_on: date(r.insp_next),
        holds_stock: !yes(r.fleet_only), notes, legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into vehicles ${tx(v as Row)}
        on conflict (legacy_id) do update set ${tx(only(v, ["reg", "make_model", "year", "assigned_to_id", "vehicle_tax_due", "mot_expiry",
          "service_due", "inspection_frequency", "next_inspection_on", "holds_stock", "notes"]))}, updated_by = 'Import'
        returning id`;
      vehicleIds.set(plate, Number(row.id));
      await files("vehicles", Number(row.id), r.doc_url, "document");
      n++;
    }
    report.push(`vehicles: ${vehicles.length} in, ${n} imported`);

    const vehicleOf = (label: unknown, what: string): number | null => {
      // Old rows hold the reg, sometimes inside a label like "Ford Transit (ZZ01ZZA)".
      const s = String(label ?? "");
      const id = vehicleIds.get(reg(s)) ?? vehicleIds.get(reg(s.match(/\(([^)]+)\)/)?.[1] ?? ""));
      if (!id) unmapped.push(`${what}: vehicle "${s}" not found`);
      return id ?? null;
    };

    // Checks
    n = 0;
    for (const r of checks) {
      const vehicleId = vehicleOf(r.vehicle, `check ${r.id}`);
      const checkedOn = date(r.checked_on);
      if (!vehicleId) continue;
      if (!checkedOn) {
        unmapped.push(`check ${r.id}: no date`);
        continue;
      }
      const v = {
        vehicle_id: vehicleId, checked_on: checkedOn, checked_by: text(r.checked_by), odometer: int(r.odometer),
        tyres_ok: bool(r.tyres_ok, true), lights_ok: bool(r.lights_ok, true), fluids_ok: bool(r.fluids_ok, true), body_ok: bool(r.body_ok, true),
        restraints_ok: bool(r.restraints_ok, true), first_aid_ok: bool(r.first_aid_ok, true), extinguisher_ok: bool(r.extinguisher_ok, true),
        defects: longText(r.defects), action: longText(r.action), status: checkStatus(r.status), reviewed: yes(r.reviewed),
        source: sourceOf(r), legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into vehicle_checks ${tx(v as Row)}
        on conflict (legacy_id) do update set ${tx(only(v, ["vehicle_id", "checked_on", "checked_by", "odometer", "tyres_ok", "lights_ok", "fluids_ok",
          "body_ok", "restraints_ok", "first_aid_ok", "extinguisher_ok", "defects", "action", "status", "reviewed", "source"]))}, updated_by = 'Import'
        returning id`;
      await files("vehicle_checks", Number(row.id), r.doc_url, "photo");
      n++;
    }
    report.push(`vehicle checks: ${checks.length} in, ${n} imported`);

    // Services (the old next_due_km column always held miles)
    n = 0;
    for (const r of services) {
      const vehicleId = vehicleOf(r.vehicle, `service ${r.id}`);
      const servicedOn = date(r.serviced_on);
      if (!vehicleId) continue;
      if (!servicedOn) {
        unmapped.push(`service ${r.id}: no date`);
        continue;
      }
      const v = {
        vehicle_id: vehicleId, serviced_on: servicedOn, workshop: text(r.workshop), work_done: longText(r.work_done), odometer: int(r.odometer),
        cost: money(r.cost), next_due: date(r.next_due), next_due_miles: int(r.next_due_km), notes: longText(r.notes),
        legacy_id: Number(r.id), created_by: "Import",
      };
      if (text(r.cost) && !v.cost) unmapped.push(`service ${r.id}: cost "${r.cost}" isn't an amount (left blank)`);
      const [row] = await tx<{ id: string }[]>`
        insert into vehicle_services ${tx(v as Row)}
        on conflict (legacy_id) do update set ${tx(only(v, ["vehicle_id", "serviced_on", "workshop", "work_done", "odometer", "cost", "next_due",
          "next_due_miles", "notes"]))}, updated_by = 'Import'
        returning id`;
      await files("vehicle_services", Number(row.id), r.receipt_url, "receipt");
      n++;
    }
    report.push(`vehicle services: ${services.length} in, ${n} imported`);

    // Accidents (old times are UK local time with no zone)
    n = 0;
    for (const r of accidents) {
      const vehicleId = vehicleOf(r.vehicle, `accident ${r.id}`);
      if (!vehicleId) continue;
      const when = text(r.occurred_at);
      const local = when && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) ? when.slice(0, 16) : null;
      const claimNo = text(r.claim_no);
      const v = {
        vehicle_id: vehicleId, driver: text(r.driver), location: text(r.location), description: longText(r.description),
        damage: longText(r.damage), injuries: longText(r.injuries), third_party: text(r.third_party), third_party_reg: text(r.third_party_reg),
        third_party_insurer: text(r.third_party_insurer), police_event_no: text(r.police_event_no), status: accidentStatus(r.status),
        source: sourceOf(r), notes: [longText(r.notes), claimNo ? `Claim number in the old hub: ${claimNo}` : null].filter(Boolean).join("\n") || null,
        legacy_id: Number(r.id), created_by: "Import",
      };
      const [row] = await tx<{ id: string }[]>`
        insert into vehicle_accidents ${tx(v as Row)}
        on conflict (legacy_id) do update set ${tx(only(v, ["vehicle_id", "driver", "location", "description", "damage", "injuries", "third_party",
          "third_party_reg", "third_party_insurer", "police_event_no", "status", "source", "notes"]))}, updated_by = 'Import'
        returning id`;
      await tx`update vehicle_accidents set occurred_at = case when ${local}::text is null then null
               else (${local}::timestamp at time zone 'Europe/London') end where id = ${row.id}`;
      await files("vehicle_accidents", Number(row.id), r.doc_url, "photo");
      n++;
    }
    report.push(`vehicle accidents: ${accidents.length} in, ${n} imported`);

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

