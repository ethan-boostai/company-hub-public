import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate } from "../../../_registers/form-values";
import { loadLocations } from "../../../equipment/data";
import type { LocationData } from "../../../equipment/parts";
import { locKey, locLabel } from "../../../equipment/rules";
import { vehicleLocationLabel } from "../../../fleet/rules";
import { loadSheets, type Sheet } from "../../../_site/load-up";
import { UNBOOKABLE_STATUSES } from "../../../_site/rules";

export type PickAsset = {
  id: number; tag: string; name: string; category: string; status: string; location: string;
  nextServiceOn: string | null; testTagDue: string | null; onJobNo: string | null;
};
export type PickMaterial = { id: number; name: string; unit: string; category: string; stock: { key: string; label: string; qty: number }[] };

export type LoadUpData = {
  sheets: Sheet[];
  assets: PickAsset[];
  materials: PickMaterial[];
  vans: { id: number; label: string }[];
  locations: LocationData;
  crew: { id: number; name: string }[];
  people: { id: number; name: string }[];
  schedule: { personId: number; from: string; to: string }[]; // the job's ServiceM8 bookings (UK dates)
  ramsCategories: string[]; // equipment categories ticked on the job's RAMS
};

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export async function loadLoadUp(jobId: number, given?: Sql): Promise<LoadUpData> {
  const sql = given ?? (await readDb());
  const [sheets, locations, assets, materials, stock, people, schedule, rams] = await Promise.all([
    loadSheets(sql, { jobId }),
    loadLocations(sql),
    sql`select a.id, a.asset_tag, a.name, a.category, a.status, a.location_place, a.location_vehicle_id, a.location_person_id, a.next_service_on, a.test_tag_due,
               j.job_no as on_job_no
        from assets a left join job_plant p on p.asset_id = a.id and p.returned_at is null left join jobs j on j.id = p.job_id
        where a.status not in ${sql(UNBOOKABLE_STATUSES)}
        order by lower(coalesce(a.category, '')), lower(a.name), a.asset_tag`,
    sql<{ id: string; name: string; unit: string; category: string | null }[]>`select id, name, unit, category from materials where status = 'active' order by lower(name), lower(unit)`,
    sql<{ material_id: string; location_place: string | null; location_vehicle_id: string | null; qty: string }[]>`
      select material_id, location_place, location_vehicle_id, qty from material_stock where qty > 0`,
    sql<{ id: string; name: string; lists: string[] }[]>`select id, name, lists from people where active order by lower(name)`,
    sql<{ person_id: string; from_d: Date; to_d: Date }[]>`
      select p.id as person_id, (b.starts_at at time zone 'Europe/London')::date as from_d, (coalesce(b.ends_at, b.starts_at) at time zone 'Europe/London')::date as to_d
      from sm8_bookings b join jobs j on j.sm8_uuid = b.job_sm8_uuid join people p on p.sm8_staff_uuid = b.staff_sm8_uuid and p.active
      where j.id = ${jobId} and b.active and b.starts_at is not null`,
    sql<{ cats: string[] | null }[]>`
      select array(select jsonb_array_elements_text(coalesce(data->'plantCategories', '[]'::jsonb))) as cats
      from rams where job_id = ${jobId} and kind = 'cbs' and status <> 'superseded'`,
  ]);
  const where = (r: Record<string, unknown>) =>
    locLabel({ place: r.location_place as string | null, vehicleId: n(r.location_vehicle_id), personId: n(r.location_person_id) }, locations.vehicles, locations.people);
  const byMat = new Map<number, PickMaterial["stock"]>();
  for (const r of stock) {
    const l = { place: r.location_place, vehicleId: r.location_vehicle_id ? Number(r.location_vehicle_id) : null };
    byMat.set(Number(r.material_id), [...(byMat.get(Number(r.material_id)) ?? []), { key: locKey(l), label: locLabel(l, locations.vehicles, locations.people), qty: Number(r.qty) }]);
  }
  return {
    sheets,
    locations,
    assets: assets.map((r) => ({
      id: Number(r.id), tag: s(r.asset_tag), name: r.name, category: s(r.category), status: r.status, location: where(r),
      nextServiceOn: isoDate(r.next_service_on), testTagDue: isoDate(r.test_tag_due), onJobNo: r.on_job_no ?? null,
    })),
    materials: materials.map((m) => ({ id: Number(m.id), name: m.name, unit: m.unit || "each", category: s(m.category), stock: byMat.get(Number(m.id)) ?? [] })),
    vans: locations.vehicles.filter((v) => v.holdsStock).map((v) => ({ id: v.id, label: vehicleLocationLabel(v) })),
    crew: people.filter((p) => p.lists?.includes("crew")).map((p) => ({ id: Number(p.id), name: p.name })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    schedule: schedule.map((b) => ({ personId: Number(b.person_id), from: isoDate(b.from_d)!, to: isoDate(b.to_d)! })),
    ramsCategories: [...new Set(rams.flatMap((r) => r.cats ?? []))].sort((a, b) => a.localeCompare(b)),
  };
}
