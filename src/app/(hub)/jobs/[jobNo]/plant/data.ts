import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate, isoTime } from "../../../_registers/form-values";
import { loadLocations } from "../../../equipment/data";
import type { LocationData } from "../../../equipment/parts";
import { locLabel } from "../../../equipment/rules";
import { UNBOOKABLE_STATUSES } from "../../../_site/rules";

export type Booking = {
  id: number;
  assetId: number | null;
  assetName: string;
  assetTag: string;
  category: string;
  source: "job" | "load_up" | "yard";
  outWith: string;
  bookedAt: string;
  bookedBy: string;
  dueBack: string | null;
  returnedAt: string | null;
  returnedBy: string;
  returnedTo: string;
  notes: string;
  // The item as it is now (null once deleted from the register).
  asset: { status: string; location: string; nextServiceOn: string | null; testTagDue: string | null } | null;
};

export type FreeAsset = { id: number; tag: string; name: string; category: string; status: string; location: string; nextServiceOn: string | null; testTagDue: string | null };

export type PlantData = { bookings: Booking[]; free: FreeAsset[]; locations: LocationData };

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export async function loadJobPlant(jobId: number, given?: Sql): Promise<PlantData> {
  const sql = given ?? (await readDb());
  const [locations, bookings, free] = await Promise.all([
    loadLocations(sql),
    sql`select p.*, a.status as a_status, a.location_place, a.location_vehicle_id, a.location_person_id, a.next_service_on, a.test_tag_due
        from job_plant p left join assets a on a.id = p.asset_id
        where p.job_id = ${jobId} order by (p.returned_at is null) desc, p.booked_at desc, p.id desc`,
    sql`select a.id, a.asset_tag, a.name, a.category, a.status, a.location_place, a.location_vehicle_id, a.location_person_id, a.next_service_on, a.test_tag_due
        from assets a
        where a.status not in ${sql(UNBOOKABLE_STATUSES)} and not exists (select 1 from job_plant p where p.asset_id = a.id and p.returned_at is null)
        order by lower(coalesce(a.category, '')), lower(a.name), a.asset_tag`,
  ]);
  const where = (r: Record<string, unknown>) =>
    locLabel({ place: r.location_place as string | null, vehicleId: n(r.location_vehicle_id), personId: n(r.location_person_id) }, locations.vehicles, locations.people);
  return {
    locations,
    bookings: bookings.map((r) => ({
      id: Number(r.id), assetId: n(r.asset_id), assetName: r.asset_name, assetTag: s(r.asset_tag), category: s(r.category), source: r.source,
      outWith: s(r.out_with_label), bookedAt: isoTime(r.booked_at)!, bookedBy: s(r.booked_by), dueBack: isoDate(r.due_back),
      returnedAt: isoTime(r.returned_at), returnedBy: s(r.returned_by), returnedTo: s(r.returned_to_label), notes: s(r.notes),
      asset: r.asset_id && r.a_status ? { status: r.a_status, location: where(r), nextServiceOn: isoDate(r.next_service_on), testTagDue: isoDate(r.test_tag_due) } : null,
    })),
    free: free.map((r) => ({
      id: Number(r.id), tag: s(r.asset_tag), name: r.name, category: s(r.category), status: r.status, location: where(r),
      nextServiceOn: isoDate(r.next_service_on), testTagDue: isoDate(r.test_tag_due),
    })),
  };
}
