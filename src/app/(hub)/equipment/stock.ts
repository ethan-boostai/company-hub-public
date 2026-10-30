import "server-only";
import type postgres from "postgres";
import { logActivity } from "@/lib/activity";
import { locLabel, qty as fmt, round3, assetStatusAfterReport, labelOf, ASSET_STATUSES, reportUrgency, requestFor, type Loc, type ToolKind, type ToolWants } from "./rules";

type Tx = postgres.TransactionSql;

export class NotEnough extends Error {
  constructor(public what: string, public have: number, public unit: string, public where: string) {
    super(`Only ${fmt(have)} ${unit} of ${what} at ${where}.`);
  }
}

// The label a location has now ("CBS Warehouse", "Ford Transit - ZZ Driver (ZZ33ZZZ)", "With ZZ Person").
export async function labelFor(tx: Tx, l: Loc | null): Promise<string> {
  if (!l) return "No location";
  if (l.place) return l.place;
  if (l.vehicleId) {
    const [v] = await tx<{ id: string; reg: string; make_model: string | null; driver: string | null }[]>`
      select v.id, v.reg, v.make_model, p.name as driver from vehicles v left join people p on p.id = v.assigned_to_id where v.id = ${l.vehicleId}`;
    return locLabel(l, v ? [{ id: Number(v.id), reg: v.reg, makeModel: v.make_model ?? "", driver: v.driver ?? "" }] : [], []);
  }
  const [p] = await tx<{ id: string; name: string }[]>`select id, name from people where id = ${l.personId}`;
  return locLabel(l, [], p ? [{ id: Number(p.id), name: p.name }] : []);
}

// Is this a location stock can be at? Vehicles must exist; people must exist and be active.
export async function locationExists(tx: Tx, l: Loc): Promise<boolean> {
  if (l.place) return true;
  if (l.vehicleId) return (await tx`select 1 from vehicles where id = ${l.vehicleId}`).length > 0;
  return (await tx`select 1 from people where id = ${l.personId} and active`).length > 0;
}

// The job a move belongs to: the given job, else the job whose number was typed (if the hub has it).
function jobIdSql(tx: Tx, how: { jobRef?: string | null; jobId?: number | null }) {
  if (how.jobId) return tx`${how.jobId}`;
  return how.jobRef ? tx`(select id from jobs where job_no = ${how.jobRef})` : tx`null`;
}

// Current stock of one material at one location (locking the row for the rest of the transaction).
export async function stockAt(tx: Tx, materialId: number, l: Loc): Promise<number> {
  const [r] = await tx<{ qty: string }[]>`
    select qty from material_stock where material_id = ${materialId}
      and coalesce(lower(location_place), '') = ${(l.place ?? "").toLowerCase()} and coalesce(location_vehicle_id, 0) = ${l.vehicleId ?? 0}
    for update`;
  return r ? Number(r.qty) : 0;
}

// Changes stock of one material at one location by `delta`, records the stock move, and returns
// the new quantity. Refuses to go below zero.
export async function changeStock(
  tx: Tx,
  m: { id: number; name: string; unit: string },
  l: Loc,
  delta: number,
  how: { by: string; reason: string; label?: string; jobRef?: string | null; jobId?: number | null; notes?: string | null; moveGroup?: string | null; stocktakeId?: number | null },
): Promise<number> {
  const label = how.label ?? (await labelFor(tx, l));
  const before = await stockAt(tx, m.id, l);
  const after = round3(before + delta);
  if (after < 0) throw new NotEnough(m.name, before, m.unit, label);
  await tx`
    insert into material_stock (material_id, location_place, location_vehicle_id, qty)
    values (${m.id}, ${l.place}, ${l.vehicleId}, ${after})
    on conflict (material_id, coalesce(lower(location_place), ''), coalesce(location_vehicle_id, 0)) do update set qty = excluded.qty`;
  await tx`
    insert into stock_moves (by, material_id, location_label, location_place, location_vehicle_id, change, qty_after, reason, job_ref, job_id, move_group, stocktake_id, notes)
    values (${how.by}, ${m.id}, ${label}, ${l.place}, ${l.vehicleId}, ${round3(delta)}, ${after}, ${how.reason}, ${how.jobRef ?? null},
            ${jobIdSql(tx, how)}, ${how.moveGroup ?? null}, ${how.stocktakeId ?? null}, ${how.notes ?? null})`;
  return after;
}

// Records an equipment move (or a change of where it is) in the stock history.
export async function logAssetMove(tx: Tx, assetId: number, fromLabel: string, toLabel: string, to: Loc | null,
  how: { by: string; reason?: string; jobRef?: string | null; jobId?: number | null; notes?: string | null; moveGroup?: string | null }) {
  await tx`
    insert into stock_moves (by, asset_id, location_label, location_place, location_vehicle_id, reason, job_ref, job_id, move_group, notes)
    values (${how.by}, ${assetId}, ${toLabel}, ${to?.place ?? null}, ${to?.vehicleId ?? null},
            ${how.reason ?? `Moved: ${fromLabel} → ${toLabel}`}, ${how.jobRef ?? null}, ${jobIdSql(tx, how)}, ${how.moveGroup ?? null}, ${how.notes ?? null})`;
}

export type NewToolReport = {
  kind: ToolKind;
  assetId: number | null;
  toolName: string;
  occurredAt: string | null; // local date-time "YYYY-MM-DDTHH:MM" (UK time), or null for now
  location: string | null;
  policeRef: string | null;
  details: string | null;
  wants: ToolWants;
  urgency: string | null;
  repairNotes: string | null;
  replaceNotes: string | null;
  reportedBy: string;
  reportedById: number | null;
  source: "office" | "team" | "yard";
  // Yard reports: the equipment's status waits for the office to confirm (found: and where it is).
  confirmFirst?: boolean;
  foundAtPlace?: string | null;
};

// Saves a lost, stolen, damaged (or, from the yard, found) tool report. On the equipment it names,
// damaged sets Needs repair and lost or stolen sets Lost; a yard report only proposes the status and
// the office confirms it (confirmToolReportStatus). A replacement or repair raises a Team request, linked both ways.
// Saving a report never closes anything: the office closes the report and the request by hand.
export async function createToolReport(tx: Tx, r: NewToolReport, by: string): Promise<number> {
  let toolName = r.toolName;
  if (r.assetId) {
    const [a] = await tx<{ id: string; name: string; asset_tag: string | null; status: string }[]>`
      select id, name, asset_tag, status from assets where id = ${r.assetId} for update`;
    if (!a) throw new Error("tool-gone");
    toolName = a.asset_tag ? `${a.name} (${a.asset_tag})` : a.name;
  }
  const urgency = reportUrgency(r.kind, r.wants, r.urgency);
  const row = {
    kind: r.kind, asset_id: r.assetId, tool_name: toolName, location: r.location, police_ref: r.kind === "stolen" ? r.policeRef : null,
    details: r.details, wants: r.wants, urgency, repair_notes: r.wants === "repair" ? r.repairNotes : null,
    replace_notes: r.wants !== "none" ? r.replaceNotes : null, reported_by: r.reportedBy, reported_by_id: r.reportedById,
    source: r.source, status: "new", created_by: by,
    pending_status: r.confirmFirst && r.assetId ? assetStatusAfterReport(r.kind) : null,
    pending_location_place: r.confirmFirst && r.assetId && r.kind === "found" ? r.foundAtPlace ?? null : null,
  };
  const [ins] = await tx<{ id: string }[]>`insert into tool_reports ${tx(row as Record<string, unknown>)} returning id`;
  const id = Number(ins.id);
  if (r.occurredAt) await tx`update tool_reports set occurred_at = (${r.occurredAt}::timestamp at time zone 'Europe/London') where id = ${id}`;
  else await tx`update tool_reports set occurred_at = now() where id = ${id}`;
  await logActivity(tx, { person: by, table: "tool_reports", rowId: id, action: "create", changes: { kind: [null, r.kind], tool_name: [null, toolName], wants: [null, r.wants] } });

  if (r.assetId && !r.confirmFirst) {
    const [a] = await tx<{ status: string }[]>`select status from assets where id = ${r.assetId}`;
    const next = assetStatusAfterReport(r.kind);
    if (a.status !== next) {
      await tx`update assets set status = ${next}, updated_by = ${by} where id = ${r.assetId}`;
      await logActivity(tx, { person: by, table: "assets", rowId: r.assetId, action: "update",
        changes: { status: [a.status, next], reason: [null, `Tool report ${id}: ${labelOf(ASSET_STATUSES, next)}`] } });
    }
  }

  const req = requestFor({ id, kind: r.kind, wants: r.wants, toolName, replaceNotes: r.replaceNotes ?? "", repairNotes: r.repairNotes ?? "" });
  if (req && urgency) {
    const [q] = await tx<{ id: string }[]>`
      insert into requests (requested_by, requested_by_id, category, urgency, details, status, source, created_by)
      values (${r.reportedBy}, ${r.reportedById}, ${req.category}, ${urgency}, ${req.details}, 'new', ${r.source}, ${by})
      returning id`;
    await tx`update tool_reports set request_id = ${q.id} where id = ${id}`;
    await logActivity(tx, { person: by, table: "requests", rowId: Number(q.id), action: "create", changes: { category: [null, req.category], tool_report: [null, id] } });
  }
  return id;
}

// The office confirms a yard report: the equipment gets the status the report asked for (found: back
// in service, where the yard said it is). The report itself stays open until the office closes it.
export async function confirmReportStatus(tx: Tx, reportId: number, by: string): Promise<string> {
  const [r] = await tx<{ asset_id: string | null; pending_status: string | null; pending_location_place: string | null }[]>`
    select asset_id, pending_status, pending_location_place from tool_reports where id = ${reportId} for update`;
  if (!r) throw new Error("report-gone");
  if (!r.pending_status || !r.asset_id) throw new Error("nothing-to-confirm");
  const [a] = await tx<{ status: string; location_place: string | null; location_vehicle_id: string | null; location_person_id: string | null }[]>`
    select status, location_place, location_vehicle_id, location_person_id from assets where id = ${r.asset_id} for update`;
  if (a) {
    const changes: Record<string, [unknown, unknown]> = {};
    if (a.status !== r.pending_status) changes.status = [a.status, r.pending_status];
    await tx`update assets set status = ${r.pending_status}, updated_by = ${by} where id = ${r.asset_id}`;
    if (r.pending_location_place) {
      const from = a.location_place ? { place: a.location_place, vehicleId: null, personId: null } as Loc
        : a.location_vehicle_id ? { place: null, vehicleId: Number(a.location_vehicle_id), personId: null } as Loc
          : a.location_person_id ? { place: null, vehicleId: null, personId: Number(a.location_person_id) } as Loc : null;
      const to: Loc = { place: r.pending_location_place, vehicleId: null, personId: null };
      const fromLabel = await labelFor(tx, from);
      if (fromLabel.toLowerCase() !== r.pending_location_place.toLowerCase()) {
        await tx`update assets set location_place = ${to.place}, location_vehicle_id = null, location_person_id = null where id = ${r.asset_id}`;
        await logAssetMove(tx, Number(r.asset_id), fromLabel, to.place!, to, { by, reason: `Found (tool report ${reportId})` });
        changes.location = [fromLabel, to.place];
      }
    }
    changes.reason = [null, `Tool report ${reportId} confirmed`];
    await logActivity(tx, { person: by, table: "assets", rowId: Number(r.asset_id), action: "update", changes });
  }
  await tx`update tool_reports set pending_status = null, pending_location_place = null, status_confirmed_by = ${by}, status_confirmed_at = now(), updated_by = ${by}
           where id = ${reportId}`;
  await logActivity(tx, { person: by, table: "tool_reports", rowId: reportId, action: "update", changes: { confirmed: [null, r.pending_status] } });
  return r.pending_status;
}

// A count of materials at one location, saved as Pending for the office to approve (stock doesn't
// change yet). Returns the stocktake's id, or null if a material is no longer on the register.
export async function createStocktake(tx: Tx, loc: Loc, counts: { materialId: number; counted: number }[], countedBy: string, notes: string | null, by: string): Promise<number | null> {
  const label = await labelFor(tx, loc);
  const [st] = await tx<{ id: string }[]>`
    insert into stocktakes (location_label, location_place, location_vehicle_id, counted_by, notes, created_by)
    values (${label}, ${loc.place}, ${loc.vehicleId}, ${countedBy}, ${notes}, ${by}) returning id`;
  const sid = Number(st.id);
  for (const c of counts) {
    const [m] = await tx`select 1 from materials where id = ${c.materialId}`;
    if (!m) return null;
    const expected = await stockAt(tx, c.materialId, loc);
    await tx`insert into stocktake_lines (stocktake_id, material_id, expected, counted) values (${sid}, ${c.materialId}, ${expected}, ${c.counted})`;
  }
  await logActivity(tx, { person: by, table: "stocktakes", rowId: sid, action: "create", changes: { location: [null, label], lines: [null, counts.length] } });
  return sid;
}
