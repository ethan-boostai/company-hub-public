"use server";

import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { getCurrentPerson } from "@/lib/auth/session";
import { addMonths, isIsoDate, LOCAL_DATETIME } from "../_registers/dates";
import { forLog, FormValues } from "../_registers/form-values";
import {
  approvedQty, ASSET_STATUSES, locKey, MATERIAL_STATUSES, parseLocKey, REPORT_STATUSES, round3, TOOL_KINDS, TOOL_WANTS, qty as fmt,
  type AssetStatus, type Loc, type MaterialStatus, type ReportStatus, type ToolKind, type ToolWants,
} from "./rules";
import { loadEquipment, loadMoves, type EquipmentData, type MoveRow } from "./data";
import { changeStock, createToolReport, labelFor, locationExists, logAssetMove, NotEnough, stockAt } from "./stock";

// Every save hands back the whole register as it now is (one move can change several lists) and
// the id of the record to show.
export type Saved = { all: EquipmentData; id: number | null };

const values = <T extends { value: string }>(list: readonly T[]) => list.map((o) => o.value) as T["value"][];
function invalid(fieldErrors: Record<string, string>, message = "Check the highlighted fields."): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}
const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}
class Refused extends Error {}

// A quantity: up to 3 decimal places, not negative.
function decimal(f: FormValues, name: string, { required = false, positive = false } = {}): number | null {
  const s = f.text(name, 20)?.replace(/[,\s]/g, "");
  if (!s) {
    if (required) f.errors[name] = "Enter a quantity.";
    return null;
  }
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(s) || (positive && Number(s) <= 0)) {
    f.errors[name] = positive ? "Enter a quantity above 0." : "Enter a number (up to 3 decimal places).";
    return null;
  }
  return Number(s);
}

function location(f: FormValues, name: string, { required = false, person = true } = {}): Loc | null {
  const raw = f.text(name, 100);
  if (!raw) {
    if (required) f.errors[name] = "Choose where it is.";
    return null;
  }
  const l = parseLocKey(raw, person);
  if (!l) f.errors[name] = "Choose where it is.";
  return l;
}

const done = async (id: number | null): Promise<ActionResult<Saved>> => ({ ok: true, message: "Saved.", data: { all: await loadEquipment(db()), id } });

function failed(e: unknown): ActionResult<Saved> {
  if (e instanceof Missing) return GONE;
  if (e instanceof NotEnough) return { ok: false, message: e.message };
  if (e instanceof Refused) return { ok: false, message: e.message };
  throw e;
}

/* ---------- Equipment ---------- */

const ASSET_FIELDS = ["asset_tag", "name", "category", "make_model", "serial_no", "status", "location_place", "location_vehicle_id", "location_person_id",
  "purchased_on", "service_interval_months", "last_service_on", "next_service_on", "test_tag_due", "hav_magnitude", "hav_trigger_mins", "hav_ref", "notes"];

export async function saveAsset(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const loc = location(f, "location");
  const hav = f.text("hav_magnitude", 10);
  if (hav && !/^\d{1,3}(\.\d{1,2})?$/.test(hav)) f.errors.hav_magnitude = "Enter the vibration in m/s², e.g. 7.5.";
  const v = {
    asset_tag: f.text("asset_tag", 40),
    name: f.required("name", "Enter what the equipment is.", 200),
    category: f.text("category", 80),
    make_model: f.text("make_model", 120),
    serial_no: f.text("serial_no", 80),
    status: f.oneOf<AssetStatus>("status", values(ASSET_STATUSES), "in_service"),
    location_place: loc?.place ?? null,
    location_vehicle_id: loc?.vehicleId ?? null,
    location_person_id: loc?.personId ?? null,
    purchased_on: f.date("purchased_on"),
    service_interval_months: f.int("service_interval_months", { min: 1, max: 120 }),
    last_service_on: f.date("last_service_on"),
    next_service_on: f.date("next_service_on"),
    test_tag_due: f.date("test_tag_due"),
    hav_magnitude: hav && !f.errors.hav_magnitude ? hav : null,
    hav_trigger_mins: f.int("hav_trigger_mins", { min: 1, max: 1440 }),
    hav_ref: f.text("hav_ref", 120),
    notes: f.text("notes", 4000),
  };
  if (!f.ok) return invalid(f.errors);

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        if (loc && !(await locationExists(tx, loc))) throw new Refused("That location no longer exists. Choose another.");
        if (id) {
          const [before] = await tx`select ${tx(ASSET_FIELDS)} from assets where id = ${id} for update`;
          if (!before) throw new Missing();
          const was = parseLocKey(locKey({ place: before.location_place, vehicleId: before.location_vehicle_id && Number(before.location_vehicle_id), personId: before.location_person_id && Number(before.location_person_id) }));
          await tx`update assets set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, ASSET_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "assets", rowId: id, action: "update", changes });
          if (locKey(was) !== locKey(loc)) {
            await logAssetMove(tx, id, await labelFor(tx, was), await labelFor(tx, loc), loc, { by: person.name });
          }
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into assets ${tx({ ...v, created_by: person.name } as Record<string, unknown>)} returning id`;
        const newId = Number(r.id);
        await logActivity(tx, { person: person.name, table: "assets", rowId: newId, action: "create", changes: diff(null, v, ASSET_FIELDS) });
        if (loc) await logAssetMove(tx, newId, "", await labelFor(tx, loc), loc, { by: person.name, reason: "Added to the register" });
        return newId;
      });
      return done(rowId);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return invalid({ asset_tag: "Another item already has that tag." });
      return failed(e);
    }
  });
}

// Found, or back from repair: In service again, at a location.
export async function returnToService(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const loc = location(f, "location", { required: true });
  const notes = f.text("notes", 1000);
  if (!id) return GONE;
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      await db().begin(async (tx) => {
        const [a] = await tx`select status, location_place, location_vehicle_id, location_person_id from assets where id = ${id} for update`;
        if (!a) throw new Missing();
        if (!(await locationExists(tx, loc!))) throw new Refused("That location no longer exists. Choose another.");
        const was = parseLocKey(locKey({ place: a.location_place, vehicleId: a.location_vehicle_id && Number(a.location_vehicle_id), personId: a.location_person_id && Number(a.location_person_id) }));
        await tx`update assets set status = 'in_service', location_place = ${loc!.place}, location_vehicle_id = ${loc!.vehicleId},
                   location_person_id = ${loc!.personId}, updated_by = ${person.name} where id = ${id}`;
        await logActivity(tx, { person: person.name, table: "assets", rowId: id, action: "update", changes: { status: [a.status, "in_service"] } });
        const toLabel = await labelFor(tx, loc);
        await logAssetMove(tx, id, await labelFor(tx, was), toLabel, loc, {
          by: person.name, notes, reason: a.status === "lost" ? `Found, back in service at ${toLabel}` : `Back in service at ${toLabel}`,
        });
      });
      return done(id);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Equipment services ---------- */

const SERVICE_FIELDS = ["asset_id", "serviced_on", "serviced_by", "work_done", "cost", "next_due", "notes"];

export async function saveAssetService(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v = {
    asset_id: f.id("asset_id"),
    serviced_on: f.date("serviced_on"),
    serviced_by: f.text("serviced_by", 120),
    work_done: f.text("work_done", 4000),
    cost: f.money("cost"),
    next_due: f.date("next_due"),
    notes: f.text("notes", 4000),
  };
  if (!v.asset_id) f.errors.asset_id = "Choose the equipment.";
  if (!v.serviced_on && !f.errors.serviced_on) f.errors.serviced_on = "Enter the date of the service.";
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        const [a] = await tx<{ last: string | null; next: string | null; months: number | null }[]>`
          select last_service_on::text as last, next_service_on::text as next, service_interval_months as months from assets where id = ${v.asset_id} for update`;
        if (!a) throw new Missing();
        let rid = id;
        if (id) {
          const [before] = await tx`select ${tx(SERVICE_FIELDS)} from asset_services where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update asset_services set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, SERVICE_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "asset_services", rowId: id, action: "update", changes });
        } else {
          const [r] = await tx<{ id: string }[]>`insert into asset_services ${tx({ ...v, created_by: person.name } as Record<string, unknown>)} returning id`;
          rid = Number(r.id);
          await logActivity(tx, { person: person.name, table: "asset_services", rowId: rid, action: "create", changes: diff(null, v, SERVICE_FIELDS) });
        }
        // The latest service sets the equipment's last service and, from its next due date or the
        // service interval, the next one (the office can still edit both on the equipment).
        if (!a.last || v.serviced_on! >= a.last) {
          const next = v.next_due ?? (a.months ? addMonths(v.serviced_on!, a.months) : a.next);
          if (v.serviced_on !== a.last || next !== a.next) {
            await tx`update assets set last_service_on = ${v.serviced_on}, next_service_on = ${next}, updated_by = ${person.name} where id = ${v.asset_id}`;
            await logActivity(tx, { person: person.name, table: "assets", rowId: v.asset_id!, action: "update",
              changes: { last_service_on: [a.last, v.serviced_on], next_service_on: [a.next, next] } });
          }
        }
        return rid!;
      });
      return done(rowId);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Materials ---------- */

const MATERIAL_FIELDS = ["name", "category", "unit", "supplier_id", "supplier_code", "cost", "min_level", "reorder_qty", "status", "notes"];

export async function saveMaterial(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const v = {
    name: f.required("name", "Enter the material's name.", 200),
    category: f.text("category", 80),
    unit: f.text("unit", 30) ?? "each",
    supplier_id: f.id("supplier_id"),
    supplier_code: f.text("supplier_code", 80),
    cost: f.money("cost"),
    min_level: decimal(f, "min_level"),
    reorder_qty: decimal(f, "reorder_qty"),
    status: f.oneOf<MaterialStatus>("status", values(MATERIAL_STATUSES), "active"),
    notes: f.text("notes", 4000),
  };
  const opening = id ? null : decimal(f, "opening_qty");
  const openingAt = opening ? location(f, "opening_location", { required: true, person: false }) : null;
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        if (id) {
          const [before] = await tx`select ${tx(MATERIAL_FIELDS)} from materials where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update materials set ${tx(v as Record<string, unknown>)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, MATERIAL_FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "materials", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into materials ${tx({ ...v, created_by: person.name } as Record<string, unknown>)} returning id`;
        const newId = Number(r.id);
        await logActivity(tx, { person: person.name, table: "materials", rowId: newId, action: "create", changes: diff(null, v, MATERIAL_FIELDS) });
        if (opening && openingAt) {
          if (!(await locationExists(tx, openingAt))) throw new Refused("That location no longer exists. Choose another.");
          await changeStock(tx, { id: newId, name: v.name, unit: v.unit }, openingAt, opening, { by: person.name, reason: "Opening stock" });
        }
        return newId;
      });
      return done(rowId);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return invalid({ name: "A material with that name and unit is already on the register." });
      return failed(e);
    }
  });
}

// Add or remove stock of one material at one location, with a reason.
export async function adjustStock(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const materialId = f.id("material_id");
  const loc = location(f, "location", { required: true, person: false });
  const dir = f.oneOf<"add" | "remove">("direction", ["add", "remove"], "add");
  const amount = decimal(f, "qty", { required: true, positive: true });
  const reason = f.required("reason", "Choose a reason.", 80);
  const jobRef = f.text("job_ref", 20);
  const notes = f.text("notes", 1000);
  if (!materialId) return GONE;
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      await db().begin(async (tx) => {
        const [m] = await tx<{ name: string; unit: string }[]>`select name, unit from materials where id = ${materialId} for update`;
        if (!m) throw new Missing();
        if (!(await locationExists(tx, loc!))) throw new Refused("That location no longer exists. Choose another.");
        await changeStock(tx, { id: materialId, ...m }, loc!, dir === "add" ? amount! : -amount!, { by: person.name, reason, jobRef, notes });
      });
      return done(materialId);
    } catch (e) {
      return failed(e);
    }
  });
}

type MoveLine = { t: "m" | "a"; id: number; qty?: number };

// Move equipment and materials from one location to another. Every line is logged as a move.
export async function moveStock(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const from = location(f, "from", { required: true });
  const to = location(f, "to", { required: true });
  const jobRef = f.text("job_ref", 20);
  const notes = f.text("notes", 1000);
  let lines: MoveLine[] = [];
  try {
    const raw = JSON.parse(String(form.get("items") ?? "[]"));
    if (Array.isArray(raw)) lines = raw.filter((x) => (x?.t === "m" || x?.t === "a") && Number.isInteger(x?.id) && x.id > 0).slice(0, 500);
  } catch {
    /* handled below */
  }
  if (from && to && locKey(from) === locKey(to)) f.errors.to = "From and To can't be the same.";
  if (to && to.personId && lines.some((l) => l.t === "m")) f.errors.to = "Materials can only go to a place or a vehicle.";
  if (!lines.length) return invalid(f.errors, "Tick at least one item to move.");
  for (const l of lines) {
    if (l.t === "m" && !(typeof l.qty === "number" && l.qty > 0 && round3(l.qty) === l.qty)) return invalid(f.errors, "Every ticked material needs a quantity above 0.");
  }
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      await db().begin(async (tx) => {
        if (!(await locationExists(tx, to!))) throw new Refused("The To location no longer exists. Choose another.");
        const fromLabel = await labelFor(tx, from);
        const toLabel = await labelFor(tx, to);
        const group = randomUUID();
        for (const l of lines) {
          if (l.t === "a") {
            const [a] = await tx`select location_place, location_vehicle_id, location_person_id from assets where id = ${l.id} for update`;
            if (!a) throw new Missing();
            const at = locKey({ place: a.location_place, vehicleId: a.location_vehicle_id && Number(a.location_vehicle_id), personId: a.location_person_id && Number(a.location_person_id) });
            if (at.toLowerCase() !== locKey(from).toLowerCase()) throw new Refused("Some equipment has already been moved by someone else. Refresh and try again.");
            await tx`update assets set location_place = ${to!.place}, location_vehicle_id = ${to!.vehicleId}, location_person_id = ${to!.personId},
                       updated_by = ${person.name} where id = ${l.id}`;
            await logActivity(tx, { person: person.name, table: "assets", rowId: l.id, action: "update", changes: { location: [fromLabel, toLabel] } });
            await logAssetMove(tx, l.id, fromLabel, toLabel, to, { by: person.name, jobRef, notes, moveGroup: group });
          } else {
            const [m] = await tx<{ name: string; unit: string }[]>`select name, unit from materials where id = ${l.id} for update`;
            if (!m) throw new Missing();
            const how = { by: person.name, jobRef, notes, moveGroup: group };
            await changeStock(tx, { id: l.id, ...m }, from!, -l.qty!, { ...how, label: fromLabel, reason: `Moved to ${toLabel}` });
            await changeStock(tx, { id: l.id, ...m }, to!, l.qty!, { ...how, label: toLabel, reason: `Moved from ${fromLabel}` });
          }
        }
      });
      return done(null);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Stocktakes ---------- */

// A count of materials at one location. Saved as waiting for approval; stock doesn't change yet.
export async function saveStocktake(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const loc = location(f, "location", { required: true, person: false });
  const countedBy = f.required("counted_by", "Choose who counted.", 120);
  const notes = f.text("notes", 2000);
  let counts: { materialId: number; counted: number }[] = [];
  try {
    const raw = JSON.parse(String(form.get("counts") ?? "[]"));
    if (Array.isArray(raw)) {
      counts = raw.filter((c) => Number.isInteger(c?.materialId) && c.materialId > 0 && typeof c?.counted === "number" && c.counted >= 0 && round3(c.counted) === c.counted && c.counted < 1e9);
    }
  } catch {
    /* handled below */
  }
  if (!f.ok) return invalid(f.errors);
  if (!counts.length) return invalid({}, "Enter at least one count.");
  if (new Set(counts.map((c) => c.materialId)).size !== counts.length) return invalid({}, "Each material can only be counted once.");
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const id = await db().begin(async (tx) => {
        if (!(await locationExists(tx, loc!))) throw new Refused("That location no longer exists. Choose another.");
        const label = await labelFor(tx, loc);
        const [st] = await tx<{ id: string }[]>`
          insert into stocktakes (location_label, location_place, location_vehicle_id, counted_by, notes, created_by)
          values (${label}, ${loc!.place}, ${loc!.vehicleId}, ${countedBy}, ${notes}, ${person.name}) returning id`;
        const sid = Number(st.id);
        for (const c of counts) {
          const [m] = await tx`select 1 from materials where id = ${c.materialId}`;
          if (!m) throw new Missing();
          const expected = await stockAt(tx, c.materialId, loc!);
          await tx`insert into stocktake_lines (stocktake_id, material_id, expected, counted) values (${sid}, ${c.materialId}, ${expected}, ${c.counted})`;
        }
        await logActivity(tx, { person: person.name, table: "stocktakes", rowId: sid, action: "create", changes: { location: [null, label], lines: [null, counts.length] } });
        return sid;
      });
      return done(id);
    } catch (e) {
      return failed(e);
    }
  });
}

// The office approves (only the ticked lines) or rejects a waiting stocktake. Decided once only.
export async function decideStocktake(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const decision = f.oneOf<"approve" | "reject">("decision", ["approve", "reject"], "approve");
  const decisionNotes = f.text("decision_notes", 2000);
  const applied = new Set(form.getAll("apply").map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0));
  if (!id) return GONE;
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      await db().begin(async (tx) => {
        const [st] = await tx`select * from stocktakes where id = ${id} for update`;
        if (!st) throw new Missing();
        if (st.status !== "pending") throw new Refused("This stocktake has already been decided.");
        const loc = (st.location_place ? { place: st.location_place, vehicleId: null, personId: null } : st.location_vehicle_id
          ? { place: null, vehicleId: Number(st.location_vehicle_id), personId: null } : null) as Loc | null;
        if (decision === "approve") {
          if (!loc) throw new Refused("The vehicle this stocktake was for is no longer on the fleet. Reject it instead.");
          const lines = await tx`select l.*, m.name, m.unit from stocktake_lines l join materials m on m.id = l.material_id where l.stocktake_id = ${id} order by l.id`;
          if (!lines.some((l) => applied.has(Number(l.id)))) throw new Refused("Tick at least one line to approve, or reject the stocktake.");
          for (const l of lines) {
            const use = applied.has(Number(l.id));
            if (!use) {
              await tx`update stocktake_lines set applied = false where id = ${l.id}`;
              continue;
            }
            const now = await stockAt(tx, Number(l.material_id), loc);
            const next = approvedQty(Number(l.counted), Number(l.expected), now);
            if (next !== now) {
              await changeStock(tx, { id: Number(l.material_id), name: l.name, unit: l.unit }, loc, round3(next - now), {
                by: person.name, label: st.location_label, reason: "Stocktake adjustment", stocktakeId: id, notes: `Counted ${fmt(Number(l.counted))} by ${st.counted_by}`,
              });
            }
            await tx`update stocktake_lines set applied = true, new_qty = ${next} where id = ${l.id}`;
            await tx`update materials set last_counted_on = (${st.counted_at}::timestamptz at time zone 'Europe/London')::date, last_counted_by = ${st.counted_by},
                       updated_by = ${person.name} where id = ${l.material_id}`;
          }
        }
        const status = decision === "approve" ? "approved" : "rejected";
        await tx`update stocktakes set status = ${status}, decided_by = ${person.name}, decided_at = now(), decision_notes = ${decisionNotes} where id = ${id}`;
        await logActivity(tx, { person: person.name, table: "stocktakes", rowId: id, action: "update", changes: { status: ["pending", status] } });
      });
      return done(id);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Tool reports ---------- */

export async function saveToolReport(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  if (id) {
    // An existing report: the office updates its status and notes. What was reported stays as sent.
    const status = f.oneOf<ReportStatus>("status", values(REPORT_STATUSES), "new");
    const officeNotes = f.text("office_notes", 4000);
    if (!f.ok) return invalid(f.errors);
    return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
      try {
        await db().begin(async (tx) => {
          const [before] = await tx`select status, office_notes from tool_reports where id = ${id} for update`;
          if (!before) throw new Missing();
          const closing = status === "closed" && before.status !== "closed";
          const reopening = status !== "closed" && before.status === "closed";
          await tx`update tool_reports set status = ${status}, office_notes = ${officeNotes}, updated_by = ${person.name},
                     closed_at = ${closing ? tx`now()` : reopening ? null : tx`closed_at`},
                     closed_by = ${closing ? person.name : reopening ? null : tx`closed_by`} where id = ${id}`;
          const changes = diff(before, { status, office_notes: officeNotes }, ["status", "office_notes"]);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "tool_reports", rowId: id, action: "update", changes });
        });
        return done(id);
      } catch (e) {
        return failed(e);
      }
    });
  }

  const kind = f.oneOf<ToolKind>("kind", values(TOOL_KINDS), "lost");
  const assetId = f.id("asset_id");
  const toolName = f.text("tool_name", 200);
  const when = f.text("occurred_at", 20);
  if (when && !(LOCAL_DATETIME.test(when) && isIsoDate(when.slice(0, 10)))) f.errors.occurred_at = "Enter a valid date and time.";
  const wants = f.oneOf<ToolWants>("wants", values(TOOL_WANTS), "none");
  const reportedById = f.id("reported_by_id");
  if (!assetId && !toolName) f.errors.tool_name = "Pick the tool, or type its name.";
  if (!reportedById) f.errors.reported_by_id = "Choose who is reporting it.";
  const input = {
    kind, assetId, toolName: toolName ?? "", occurredAt: when && !f.errors.occurred_at ? when : null,
    location: f.text("location", 300), policeRef: f.text("police_ref", 60), details: f.text("details", 4000), wants,
    urgency: f.text("urgency", 20), repairNotes: f.text("repair_notes", 2000), replaceNotes: f.text("replace_notes", 2000),
  };
  if (!f.ok) return invalid(f.errors);
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rid = await db().begin(async (tx) => {
        const [p] = await tx<{ name: string }[]>`select name from people where id = ${reportedById}`;
        if (!p) throw new Refused("Choose who is reporting it.");
        try {
          return await createToolReport(tx, { ...input, reportedBy: p.name, reportedById, source: "office" }, person.name);
        } catch (e) {
          if (e instanceof Error && e.message === "tool-gone") throw new Missing();
          throw e;
        }
      });
      return done(rid);
    } catch (e) {
      return failed(e);
    }
  });
}

/* ---------- Delete ---------- */

const DELETABLE = {
  assets: "equipment",
  asset_services: "service",
  materials: "material",
  stocktakes: "stocktake",
  tool_reports: "tool report",
} as const;

export async function deleteEquipmentRecord(kind: keyof typeof DELETABLE, id: number, requestKey: string): Promise<ActionResult<Saved>> {
  if (!(kind in DELETABLE) || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded(requestKey, async (person) => {
    const gone = await db().begin(async (tx) => {
      const [before] = await tx`select * from ${tx(kind)} where id = ${id} for update`;
      if (!before) return true;
      await tx`delete from ${tx(kind)} where id = ${id}`;
      const snapshot = Object.fromEntries(
        Object.entries(forLog(before)).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]),
      );
      await logActivity(tx, { person: person.name, table: kind, rowId: id, action: "delete", changes: snapshot });
      return false;
    });
    if (gone) return GONE;
    return { ok: true, message: `The ${DELETABLE[kind]} was deleted.`, data: { all: await loadEquipment(db()), id: null } };
  });
}

/* ---------- History ---------- */

export async function listMoves(kind: "material" | "asset", id: number): Promise<ActionResult<MoveRow[]>> {
  if (!(await getCurrentPerson())) return { ok: false, message: "You have been signed out. Sign in again." };
  if ((kind !== "material" && kind !== "asset") || !Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return { ok: true, data: await loadMoves(db(), kind, id) };
}
