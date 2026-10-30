import "server-only";
import type postgres from "postgres";
import { logActivity } from "@/lib/activity";
import { isoDate } from "../_registers/form-values";
import { labelFor, locationExists, logAssetMove } from "../equipment/stock";
import { locKey, type Loc } from "../equipment/rules";
import { UNBOOKABLE_STATUSES } from "./rules";

// Booking equipment out to a job and back. Used by the job's Plant page, load-up sheets and the yard.
type Tx = postgres.TransactionSql;

export class PlantRefused extends Error {}

type AssetLock = { id: string; name: string; asset_tag: string | null; category: string | null; status: string;
  location_place: string | null; location_vehicle_id: string | null; location_person_id: string | null };

const locOf = (a: AssetLock): Loc | null => {
  if (a.location_place) return { place: a.location_place, vehicleId: null, personId: null };
  if (a.location_vehicle_id) return { place: null, vehicleId: Number(a.location_vehicle_id), personId: null };
  if (a.location_person_id) return { place: null, vehicleId: null, personId: Number(a.location_person_id) };
  return null;
};

// Moves an item and records it (activity log and stock history), unless it is already there.
async function moveAsset(tx: Tx, a: AssetLock, to: Loc, how: { by: string; reason: string; jobId: number; jobNo: string }) {
  const from = locOf(a);
  if (from && locKey(from).toLowerCase() === locKey(to).toLowerCase()) return labelFor(tx, to);
  const fromLabel = await labelFor(tx, from);
  const toLabel = await labelFor(tx, to);
  await tx`update assets set location_place = ${to.place}, location_vehicle_id = ${to.vehicleId}, location_person_id = ${to.personId},
             updated_by = ${how.by} where id = ${a.id}`;
  await logActivity(tx, { person: how.by, table: "assets", rowId: Number(a.id), action: "update", changes: { location: [fromLabel, toLabel] } });
  await logAssetMove(tx, Number(a.id), fromLabel, toLabel, to, { by: how.by, reason: how.reason, jobRef: how.jobNo, jobId: how.jobId });
  return toLabel;
}

// Books items out to a job, with whoever takes them (a van or a person). Each item moves there.
// Lost and retired items, and items already out on a job, are refused.
export async function bookPlant(tx: Tx, b: {
  jobId: number; assetIds: number[]; to: Loc; dueBack: string | null; notes: string | null; by: string;
  source: "job" | "load_up" | "yard"; loadUpSheetId?: number | null;
}): Promise<number[]> {
  const [job] = await tx<{ job_no: string }[]>`select job_no from jobs where id = ${b.jobId}`;
  if (!job) throw new PlantRefused("That job no longer exists.");
  if (!(await locationExists(tx, b.to))) throw new PlantRefused("Who has it no longer exists. Choose again.");
  const ids: number[] = [];
  for (const assetId of [...new Set(b.assetIds)]) {
    const [a] = await tx<AssetLock[]>`
      select id, name, asset_tag, category, status, location_place, location_vehicle_id, location_person_id from assets where id = ${assetId} for update`;
    const label = a ? (a.asset_tag ? `${a.asset_tag} ${a.name}` : a.name) : "An item";
    if (!a) throw new PlantRefused("Some equipment is no longer on the register. Refresh and try again.");
    if (UNBOOKABLE_STATUSES.includes(a.status)) throw new PlantRefused(`${label} is ${a.status === "lost" ? "lost" : "retired"}, so it can't be booked out.`);
    const [open] = await tx<{ job_no: string }[]>`
      select j.job_no from job_plant p join jobs j on j.id = p.job_id where p.asset_id = ${assetId} and p.returned_at is null`;
    if (open) throw new PlantRefused(`${label} is already out on job ${open.job_no}. Return it first.`);
    const toLabel = await moveAsset(tx, a, b.to, { by: b.by, reason: `Booked to job ${job.job_no}`, jobId: b.jobId, jobNo: job.job_no });
    const row = {
      job_id: b.jobId, asset_id: assetId, asset_name: a.name, asset_tag: a.asset_tag, category: a.category, source: b.source,
      load_up_sheet_id: b.loadUpSheetId ?? null, out_with_label: toLabel, booked_by: b.by, due_back: b.dueBack, notes: b.notes,
    };
    const [r] = await tx<{ id: string }[]>`insert into job_plant ${tx(row as Record<string, unknown>)} returning id`;
    await logActivity(tx, { person: b.by, table: "job_plant", rowId: Number(r.id), action: "create",
      changes: { job: [null, job.job_no], item: [null, label], out_with: [null, toLabel], due_back: [null, b.dueBack] } });
    ids.push(Number(r.id));
  }
  return ids;
}

// Returns a booked item (to the yard by default). It moves there and the booking closes.
export async function returnPlant(tx: Tx, r: { bookingId: number; to: Loc; by: string; jobId?: number }): Promise<void> {
  const [b] = await tx<{ job_id: string; asset_id: string | null; returned_at: Date | null; job_no: string }[]>`
    select p.job_id, p.asset_id, p.returned_at, j.job_no from job_plant p join jobs j on j.id = p.job_id where p.id = ${r.bookingId} for update of p`;
  if (!b || (r.jobId && Number(b.job_id) !== r.jobId)) throw new PlantRefused("That booking no longer exists. Refresh the page.");
  if (b.returned_at) throw new PlantRefused("That item has already been returned.");
  if (!(await locationExists(tx, r.to))) throw new PlantRefused("That location no longer exists. Choose another.");
  let toLabel = await labelFor(tx, r.to);
  if (b.asset_id) {
    const [a] = await tx<AssetLock[]>`
      select id, name, asset_tag, category, status, location_place, location_vehicle_id, location_person_id from assets where id = ${b.asset_id} for update`;
    if (a) toLabel = await moveAsset(tx, a, r.to, { by: r.by, reason: `Returned from job ${b.job_no}`, jobId: Number(b.job_id), jobNo: b.job_no });
  }
  await tx`update job_plant set returned_at = now(), returned_by = ${r.by}, returned_to_label = ${toLabel}, updated_by = ${r.by} where id = ${r.bookingId}`;
  await logActivity(tx, { person: r.by, table: "job_plant", rowId: r.bookingId, action: "update", changes: { returned: [null, toLabel] } });
}

// Extend: a new due back date for an item out on a job.
export async function extendPlant(tx: Tx, r: { bookingId: number; dueBack: string; by: string; jobId?: number }): Promise<void> {
  const [b] = await tx<{ job_id: string; due_back: Date | null; returned_at: Date | null }[]>`
    select job_id, due_back, returned_at from job_plant where id = ${r.bookingId} for update`;
  if (!b || (r.jobId && Number(b.job_id) !== r.jobId)) throw new PlantRefused("That booking no longer exists. Refresh the page.");
  if (b.returned_at) throw new PlantRefused("That item has already been returned.");
  await tx`update job_plant set due_back = ${r.dueBack}, updated_by = ${r.by} where id = ${r.bookingId}`;
  await logActivity(tx, { person: r.by, table: "job_plant", rowId: r.bookingId, action: "update",
    changes: { due_back: [isoDate(b.due_back), r.dueBack] } });
}

// Move: the item goes straight from one job to another (with whoever has it now, or someone else).
// The old booking closes ("Moved to job N") and a new one opens on the other job.
export async function movePlant(tx: Tx, r: { bookingId: number; toJobId: number; to: Loc | null; dueBack: string | null; by: string; jobId?: number }): Promise<number> {
  const [b] = await tx<{ job_id: string; asset_id: string | null; returned_at: Date | null; location_place: string | null;
    location_vehicle_id: string | null; location_person_id: string | null }[]>`
    select p.job_id, p.asset_id, p.returned_at, a.location_place, a.location_vehicle_id, a.location_person_id
    from job_plant p left join assets a on a.id = p.asset_id where p.id = ${r.bookingId} for update of p`;
  if (!b || (r.jobId && Number(b.job_id) !== r.jobId)) throw new PlantRefused("That booking no longer exists. Refresh the page.");
  if (b.returned_at) throw new PlantRefused("That item has already been returned.");
  if (!b.asset_id) throw new PlantRefused("That item is no longer on the register.");
  if (Number(b.job_id) === r.toJobId) throw new PlantRefused("It's already on that job. Use Extend to change the due back date.");
  const [to] = await tx<{ job_no: string }[]>`select job_no from jobs where id = ${r.toJobId}`;
  if (!to) throw new PlantRefused("That job isn't in the hub.");
  const here: Loc | null = b.location_place ? { place: b.location_place, vehicleId: null, personId: null }
    : b.location_vehicle_id ? { place: null, vehicleId: Number(b.location_vehicle_id), personId: null }
      : b.location_person_id ? { place: null, vehicleId: null, personId: Number(b.location_person_id) } : null;
  const dest = r.to ?? here;
  if (!dest) throw new PlantRefused("Choose who has it.");
  await tx`update job_plant set returned_at = now(), returned_by = ${r.by}, returned_to_label = ${`Moved to job ${to.job_no}`}, updated_by = ${r.by}
           where id = ${r.bookingId}`;
  await logActivity(tx, { person: r.by, table: "job_plant", rowId: r.bookingId, action: "update", changes: { moved: [null, `job ${to.job_no}`] } });
  const [id] = await bookPlant(tx, { jobId: r.toJobId, assetIds: [Number(b.asset_id)], to: dest, dueBack: r.dueBack, notes: null, by: r.by, source: "job" });
  return id;
}

// Found: wherever it turns up, any open job booking closes straight away and the item moves there.
// (The status change, if it was lost or needing repair, waits for the office: see createToolReport.)
export async function foundPlant(tx: Tx, r: { assetId: number; to: Loc; by: string }): Promise<{ closedJobNo: string | null; label: string }> {
  if (!(await locationExists(tx, r.to))) throw new PlantRefused("That location no longer exists.");
  const [a] = await tx<AssetLock[]>`
    select id, name, asset_tag, category, status, location_place, location_vehicle_id, location_person_id from assets where id = ${r.assetId} for update`;
  if (!a) throw new PlantRefused("That equipment isn't on the register any more.");
  const [b] = await tx<{ id: string; job_id: string; job_no: string }[]>`
    select p.id, p.job_id, j.job_no from job_plant p join jobs j on j.id = p.job_id where p.asset_id = ${r.assetId} and p.returned_at is null for update of p`;
  let label: string;
  if (b) {
    label = await moveAsset(tx, a, r.to, { by: r.by, reason: `Found (job ${b.job_no} closed)`, jobId: Number(b.job_id), jobNo: b.job_no });
    await tx`update job_plant set returned_at = now(), returned_by = ${r.by}, returned_to_label = ${`Found: ${label}`}, updated_by = ${r.by} where id = ${b.id}`;
    await logActivity(tx, { person: r.by, table: "job_plant", rowId: Number(b.id), action: "update", changes: { found: [null, label] } });
  } else {
    const from = locOf(a);
    const fromLabel = await labelFor(tx, from);
    label = await labelFor(tx, r.to);
    if (!from || locKey(from).toLowerCase() !== locKey(r.to).toLowerCase()) {
      await tx`update assets set location_place = ${r.to.place}, location_vehicle_id = ${r.to.vehicleId}, location_person_id = ${r.to.personId},
                 updated_by = ${r.by} where id = ${r.assetId}`;
      await logActivity(tx, { person: r.by, table: "assets", rowId: r.assetId, action: "update", changes: { location: [fromLabel, label] } });
      await logAssetMove(tx, r.assetId, fromLabel, label, r.to, { by: r.by, reason: "Found" });
    }
  }
  return { closedJobNo: b?.job_no ?? null, label };
}

export type OverduePlant = { bookingId: number; assetId: number | null; item: string; jobId: number; jobNo: string; outWith: string; dueBack: string };

// Plant overdue back (due back before today, still out), oldest first. The hook for Core's Actions
// board cards (docs/parallel-work.md, "Plant overdue back"); the job and yard pages use it too.
export async function overduePlant(sql: postgres.Sql | Tx, today: string): Promise<OverduePlant[]> {
  const rows = await sql<{ id: string; asset_id: string | null; asset_name: string; asset_tag: string | null; job_id: string; job_no: string; out_with_label: string | null; due_back: Date }[]>`
    select p.id, p.asset_id, p.asset_name, p.asset_tag, p.job_id, j.job_no, p.out_with_label, p.due_back
    from job_plant p join jobs j on j.id = p.job_id
    where p.returned_at is null and p.due_back < ${today}::date order by p.due_back, p.id`;
  return rows.map((r) => ({
    bookingId: Number(r.id), assetId: r.asset_id ? Number(r.asset_id) : null, item: r.asset_tag ? `${r.asset_tag} ${r.asset_name}` : r.asset_name,
    jobId: Number(r.job_id), jobNo: r.job_no, outWith: r.out_with_label ?? "", dueBack: isoDate(r.due_back)!,
  }));
}
