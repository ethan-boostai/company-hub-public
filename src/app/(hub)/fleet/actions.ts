"use server";

import type postgres from "postgres";
import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { FormValues } from "../_registers/form-values";
import { isIsoDate, LOCAL_DATETIME } from "../_registers/dates";
import {
  ACCIDENT_STATUSES, CHECK_ITEMS, CHECK_STATUSES, FREQUENCIES, nextInspectionAfterCheck, normaliseReg,
  type AccidentStatus, type CheckStatus, type Frequency,
} from "./rules";
import {
  loadAccident, loadCheck, loadService, loadVehicle,
  type AccidentRow, type CheckRow, type ServiceRow, type VehicleRow,
} from "./data";

type Saved<T> = { row: T; vehicle: VehicleRow };
const values = <T extends { value: string }>(list: readonly T[]) => list.map((o) => o.value) as T["value"][];
const CHECK_FIELDS = ["vehicle_id", "checked_on", "checked_by", "odometer", ...CHECK_ITEMS.map((i) => i.key), "defects", "action", "status", "reviewed"];

function invalid(fieldErrors: Record<string, string>): ActionResult<never> {
  return { ok: false, message: "Check the highlighted fields.", fieldErrors };
}
const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };

class Missing extends Error {}

/* ---------- Vehicles ---------- */

const VEHICLE_FIELDS = ["reg", "make_model", "year", "assigned_to_id", "vehicle_tax_due", "mot_expiry", "service_due",
  "inspection_frequency", "next_inspection_on", "holds_stock", "notes"];

export async function saveVehicle(form: FormData): Promise<ActionResult<VehicleRow>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v = {
    reg: normaliseReg(f.required("reg", "Enter the registration.", 20)),
    make_model: f.text("make_model", 120),
    year: f.int("year", { min: 1950, max: 2100 }),
    assigned_to_id: f.id("assigned_to_id"),
    vehicle_tax_due: f.date("vehicle_tax_due"),
    mot_expiry: f.date("mot_expiry"),
    service_due: f.date("service_due"),
    inspection_frequency: f.oneOf<Frequency>("inspection_frequency", values(FREQUENCIES), "monthly"),
    next_inspection_on: f.date("next_inspection_on"),
    holds_stock: f.bool("holds_stock"),
    notes: f.text("notes", 4000),
  };
  if (!v.reg && !f.errors.reg) f.errors.reg = "Enter the registration.";
  if (!f.ok) return invalid(f.errors);

  return guarded<VehicleRow>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const row = await db().begin(async (tx) => {
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(VEHICLE_FIELDS)} from vehicles where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update vehicles set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(normalise(before), v, VEHICLE_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "vehicles", rowId: id, action: "update", changes });
        } else {
          const [r] = await tx<{ id: string }[]>`insert into vehicles ${tx({ ...v, created_by: person.name } as Record<string, unknown>)} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "vehicles", rowId, action: "create", changes: diff(null, v, VEHICLE_FIELDS) });
        }
        return (await loadVehicle(tx, rowId!))!;
      });
      return { ok: true, message: "Saved.", data: row };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      if ((e as { code?: string }).code === "23505") return invalid({ reg: "That vehicle is already on the register." });
      throw e;
    }
  });
}

/* ---------- Vehicle checks ---------- */

export async function saveCheck(form: FormData): Promise<ActionResult<Saved<CheckRow>>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const items = Object.fromEntries(CHECK_ITEMS.map((i) => [i.key, form.get(i.key) !== "fault"])) as Record<string, boolean>;
  const v = {
    vehicle_id: f.id("vehicle_id"),
    checked_on: f.date("checked_on"),
    checked_by: f.text("checked_by", 120),
    odometer: f.int("odometer", { max: 2_000_000 }),
    ...items,
    defects: f.text("defects", 4000),
    action: f.text("action", 4000),
    status: f.oneOf<CheckStatus>("status", values(CHECK_STATUSES), "passed"),
    reviewed: f.bool("reviewed"),
  };
  if (!v.vehicle_id) f.errors.vehicle_id = "Choose the vehicle.";
  if (!v.checked_on && !f.errors.checked_on) f.errors.checked_on = "Enter the date of the check.";
  if (Object.values(items).some((ok) => !ok) && !v.defects) f.errors.defects = "Describe the fault.";
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const data = await db().begin(async (tx) => {
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(CHECK_FIELDS)} from vehicle_checks where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update vehicle_checks set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(normalise(before), v, CHECK_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "vehicle_checks", rowId: id, action: "update", changes });
        } else {
          const [veh] = await tx<{ inspection_frequency: Frequency; next: string | null }[]>`
            select inspection_frequency, next_inspection_on::text as next from vehicles where id = ${v.vehicle_id} for update`;
          if (!veh) throw new Missing();
          const [r] = await tx<{ id: string }[]>`insert into vehicle_checks ${tx({ ...v, source: "office", created_by: person.name } as Record<string, unknown>)} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "vehicle_checks", rowId, action: "create", changes: diff(null, v, CHECK_FIELDS) });
          await rollInspection(tx, v.vehicle_id!, veh, v.checked_on!, person.name);
        }
        const row = (await loadCheck(tx, rowId!))!;
        return { row, vehicle: (await loadVehicle(tx, row.vehicleId))! };
      });
      return { ok: true, message: "Saved.", data };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      throw e;
    }
  });
}

// A logged check moves the vehicle's next inspection date on (the office can still edit it).
async function rollInspection(
  tx: postgres.TransactionSql,
  vehicleId: number,
  veh: { inspection_frequency: Frequency; next: string | null },
  checkedOn: string,
  by: string,
) {
  const next = nextInspectionAfterCheck(veh.next, checkedOn, veh.inspection_frequency);
  if (next === veh.next) return;
  await tx`update vehicles set next_inspection_on = ${next}, updated_by = ${by} where id = ${vehicleId}`;
  await logActivity(tx, { person: by, table: "vehicles", rowId: vehicleId, action: "update", changes: { next_inspection_on: [veh.next, next] } });
}

/* ---------- Services ---------- */

const SERVICE_FIELDS = ["vehicle_id", "serviced_on", "workshop", "work_done", "odometer", "cost", "next_due", "next_due_miles", "notes"];

export async function saveService(form: FormData): Promise<ActionResult<Saved<ServiceRow>>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v = {
    vehicle_id: f.id("vehicle_id"),
    serviced_on: f.date("serviced_on"),
    workshop: f.text("workshop", 200),
    work_done: f.text("work_done", 4000),
    odometer: f.int("odometer", { max: 2_000_000 }),
    cost: f.money("cost"),
    next_due: f.date("next_due"),
    next_due_miles: f.int("next_due_miles", { max: 2_000_000 }),
    notes: f.text("notes", 4000),
  };
  if (!v.vehicle_id) f.errors.vehicle_id = "Choose the vehicle.";
  if (!v.serviced_on && !f.errors.serviced_on) f.errors.serviced_on = "Enter the service date.";
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const data = await db().begin(async (tx) => {
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(SERVICE_FIELDS)} from vehicle_services where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update vehicle_services set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(normalise(before), v, SERVICE_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "vehicle_services", rowId: id, action: "update", changes });
        } else {
          const [veh] = await tx`select id from vehicles where id = ${v.vehicle_id} for update`;
          if (!veh) throw new Missing();
          const [r] = await tx<{ id: string }[]>`insert into vehicle_services ${tx({ ...v, created_by: person.name } as Record<string, unknown>)} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "vehicle_services", rowId, action: "create", changes: diff(null, v, SERVICE_FIELDS) });
        }
        // The latest service's next due date becomes the vehicle's service due date.
        if (v.next_due) {
          const [latest] = await tx<{ id: string }[]>`
            select id from vehicle_services where vehicle_id = ${v.vehicle_id} order by serviced_on desc, id desc limit 1`;
          if (Number(latest.id) === rowId) {
            const [veh] = await tx<{ due: string | null }[]>`select service_due::text as due from vehicles where id = ${v.vehicle_id}`;
            if (veh.due !== v.next_due) {
              await tx`update vehicles set service_due = ${v.next_due}, updated_by = ${person.name} where id = ${v.vehicle_id}`;
              await logActivity(tx, { person: person.name, table: "vehicles", rowId: v.vehicle_id!, action: "update", changes: { service_due: [veh.due, v.next_due] } });
            }
          }
        }
        const row = (await loadService(tx, rowId!))!;
        return { row, vehicle: (await loadVehicle(tx, row.vehicleId))! };
      });
      return { ok: true, message: "Saved.", data };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      throw e;
    }
  });
}

/* ---------- Accidents ---------- */

const ACCIDENT_FIELDS = ["vehicle_id", "occurred_at", "driver", "location", "description", "damage", "injuries", "third_party",
  "third_party_reg", "third_party_insurer", "police_event_no", "status", "notes"];

export async function saveAccident(form: FormData): Promise<ActionResult<Saved<AccidentRow>>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const when = f.text("occurred_at", 20);
  if (when && !(LOCAL_DATETIME.test(when) && isIsoDate(when.slice(0, 10)))) f.errors.occurred_at = "Enter a valid date and time.";
  const v = {
    vehicle_id: f.id("vehicle_id"),
    driver: f.text("driver", 120),
    location: f.text("location", 300),
    description: f.required("description", "Say what happened.", 4000),
    damage: f.text("damage", 4000),
    injuries: f.text("injuries", 4000),
    third_party: f.text("third_party", 300),
    third_party_reg: f.text("third_party_reg", 20),
    third_party_insurer: f.text("third_party_insurer", 200),
    police_event_no: f.text("police_event_no", 60),
    status: f.oneOf<AccidentStatus>("status", values(ACCIDENT_STATUSES), "reported"),
    notes: f.text("notes", 4000),
  };
  if (!v.vehicle_id) f.errors.vehicle_id = "Choose the vehicle.";
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const data = await db().begin(async (tx) => {
        // The time is typed in UK time.
        const [{ at }] = await tx<{ at: Date | null }[]>`
          select case when ${when}::text is null then null else (${when}::timestamp at time zone 'Europe/London') end as at`;
        const row = { ...v, occurred_at: at };
        let rowId = id;
        if (id) {
          const [before] = await tx`select ${tx(ACCIDENT_FIELDS)} from vehicle_accidents where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update vehicle_accidents set ${tx(row as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(normalise(before), normalise(row), ACCIDENT_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "vehicle_accidents", rowId: id, action: "update", changes });
        } else {
          const [veh] = await tx`select id from vehicles where id = ${v.vehicle_id}`;
          if (!veh) throw new Missing();
          const [r] = await tx<{ id: string }[]>`insert into vehicle_accidents ${tx({ ...row, source: "office", created_by: person.name } as Record<string, unknown>)} returning id`;
          rowId = Number(r.id);
          await logActivity(tx, { person: person.name, table: "vehicle_accidents", rowId, action: "create", changes: diff(null, normalise(row), ACCIDENT_FIELDS) });
        }
        const saved = (await loadAccident(tx, rowId!))!;
        return { row: saved, vehicle: (await loadVehicle(tx, saved.vehicleId))! };
      });
      return { ok: true, message: "Saved.", data };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      throw e;
    }
  });
}

/* ---------- Deleting (after the in-app "are you sure") ---------- */

const DELETABLE = {
  vehicles: { table: "vehicles", label: "vehicle" },
  vehicle_checks: { table: "vehicle_checks", label: "check" },
  vehicle_services: { table: "vehicle_services", label: "service" },
  vehicle_accidents: { table: "vehicle_accidents", label: "accident" },
} as const;

// Deletes one fleet record. Deleting a vehicle also deletes its checks, services and accidents
// (the confirm step says so). Files stay in SharePoint. Returns the vehicle as it now is (null when
// the vehicle itself was deleted).
export async function deleteFleetRecord(kind: keyof typeof DELETABLE, id: number, requestKey: string): Promise<ActionResult<VehicleRow | null>> {
  const d = DELETABLE[kind];
  if (!d || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded(requestKey, async (person) => {
    // A vehicle still holding equipment or stock can't be deleted (Equipment and materials).
    if (kind === "vehicles") {
      const [held] = await db()<{ n: number }[]>`
        select (select count(*) from assets where location_vehicle_id = ${id})::int
             + (select count(*) from material_stock where location_vehicle_id = ${id} and qty > 0)::int as n`;
      if (held?.n) return { ok: false, message: "This vehicle still holds equipment or materials. Move them off it first (Equipment and materials, Move stock)." };
    }
    return db().begin(async (tx) => {
      const [before] = await tx`select * from ${tx(d.table)} where id = ${id} for update`;
      if (!before) return GONE;
      if (kind === "vehicles") await tx`delete from material_stock where location_vehicle_id = ${id} and qty = 0`;
      await tx`delete from ${tx(d.table)} where id = ${id}`;
      const snapshot = Object.fromEntries(
        Object.entries(normalise(before)).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]),
      );
      await logActivity(tx, { person: person.name, table: d.table, rowId: id, action: "delete", changes: snapshot });
      if (kind === "vehicles") return { ok: true, message: "Vehicle deleted.", data: null };
      return { ok: true, message: `The ${d.label} was deleted.`, data: await loadVehicle(tx, Number(before.vehicle_id)) };
    });
  });
}

// Makes database values comparable with form values for the activity log (dates as YYYY-MM-DD,
// numbers as numbers, money as "0.00").
function normalise(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row)) {
    if (val instanceof Date) out[k] = k === "occurred_at" || k.endsWith("_at") ? val.toISOString() : val.toISOString().slice(0, 10);
    else if (typeof val === "string" && /^\d+$/.test(val) && (k.endsWith("_id") || k === "id")) out[k] = Number(val);
    else out[k] = val;
  }
  return out;
}
