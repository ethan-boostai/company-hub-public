import "server-only";
import { readDb } from "@/lib/db";
import { jobTitle } from "@/lib/jobs/stages";
import { ukToday } from "../(hub)/_registers/dates";
import { isoDate, isoTime } from "../(hub)/_registers/form-values";
import { loadLocations } from "../(hub)/equipment/data";
import type { LocationData } from "../(hub)/equipment/parts";
import { locKey, locLabel } from "../(hub)/equipment/rules";
import { loadSheets, type Sheet } from "../(hub)/_site/load-up";

// What the yard tablet shows, as the old hub's four tabs: Load-ups, Deliveries, Plant and Stock.
// The crew names are picked for each action and never remembered (a shared device).
export type YardAsset = {
  id: number; name: string; tag: string; category: string; makeModel: string; serialNo: string; status: string;
  locKey: string; location: string; inVehicle: boolean;
  nextServiceOn: string | null; testTagDue: string | null;
  booking: { id: number; jobId: number; jobNo: string; outWith: string; dueBack: string | null } | null;
};
export type YardMaterial = { id: number; name: string; unit: string; category: string; minLevel: number | null; stock: { key: string; label: string; qty: number }[] };
export type YardStocktake = { id: number; location: string; countedBy: string; countedAt: string; status: string; decidedBy: string; decidedAt: string | null; lines: number; differ: number };

export type YardData = {
  today: string;
  names: string[];
  sheets: Sheet[];
  assets: YardAsset[];
  materials: YardMaterial[];
  stocktakes: YardStocktake[];
  jobs: { id: number; jobNo: string; title: string }[];
  locations: LocationData;
};

const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export async function loadYardData(): Promise<YardData> {
  const sql = await readDb();
  const today = ukToday();
  const [people, sheets, assets, materials, stock, stocktakes, jobs, locations] = await Promise.all([
    sql<{ name: string }[]>`select name from people where active and 'crew' = any(lists) order by lower(name)`,
    loadSheets(sql, { yard: today }),
    sql`select a.*, p.id as booking_id, p.job_id as booking_job_id, j.job_no as booking_job_no, p.out_with_label, p.due_back
        from assets a left join job_plant p on p.asset_id = a.id and p.returned_at is null left join jobs j on j.id = p.job_id
        where a.status <> 'retired' order by lower(a.name), a.asset_tag`,
    sql<{ id: string; name: string; unit: string; category: string | null; min_level: string | null }[]>`
      select id, name, unit, category, min_level from materials where status = 'active' order by lower(name), lower(unit)`,
    sql<{ material_id: string; location_place: string | null; location_vehicle_id: string | null; qty: string }[]>`
      select material_id, location_place, location_vehicle_id, qty from material_stock`,
    sql`select t.id, t.location_label, t.counted_by, t.counted_at, t.status, t.decided_by, t.decided_at,
               (select count(*)::int from stocktake_lines l where l.stocktake_id = t.id) as lines,
               (select count(*)::int from stocktake_lines l where l.stocktake_id = t.id and l.counted <> l.expected) as differ
        from stocktakes t where t.status = 'pending' or t.decided_at > now() - interval '14 days' order by t.counted_at desc limit 10`,
    sql<{ id: string; job_no: string; sm8_description: string | null }[]>`
      select id, job_no, sm8_description from jobs where stage = 'approved' order by length(job_no) desc, job_no desc limit 300`,
    loadLocations(sql),
  ]);
  const byMat = new Map<number, YardMaterial["stock"]>();
  for (const r of stock) {
    const l = { place: r.location_place, vehicleId: r.location_vehicle_id ? Number(r.location_vehicle_id) : null };
    byMat.set(Number(r.material_id), [...(byMat.get(Number(r.material_id)) ?? []), { key: locKey(l), label: locLabel(l, locations.vehicles, locations.people), qty: Number(r.qty) }]);
  }
  return {
    today,
    names: people.map((p) => p.name),
    sheets,
    assets: assets.map((a) => {
      const l = { place: a.location_place as string | null, vehicleId: n(a.location_vehicle_id), personId: n(a.location_person_id) };
      return {
        id: Number(a.id), name: a.name, tag: s(a.asset_tag), category: s(a.category), makeModel: s(a.make_model), serialNo: s(a.serial_no),
        status: a.status, locKey: locKey(l), location: locLabel(l, locations.vehicles, locations.people), inVehicle: !!l.vehicleId,
        nextServiceOn: isoDate(a.next_service_on), testTagDue: isoDate(a.test_tag_due),
        booking: a.booking_id ? { id: Number(a.booking_id), jobId: Number(a.booking_job_id), jobNo: a.booking_job_no, outWith: s(a.out_with_label), dueBack: isoDate(a.due_back) } : null,
      };
    }),
    materials: materials.map((m) => ({
      id: Number(m.id), name: m.name, unit: m.unit || "each", category: s(m.category), minLevel: n(m.min_level), stock: byMat.get(Number(m.id)) ?? [],
    })),
    stocktakes: stocktakes.map((t) => ({
      id: Number(t.id), location: t.location_label, countedBy: t.counted_by, countedAt: isoTime(t.counted_at)!, status: t.status,
      decidedBy: s(t.decided_by), decidedAt: isoTime(t.decided_at), lines: t.lines, differ: t.differ,
    })),
    jobs: jobs.map((j) => ({ id: Number(j.id), jobNo: j.job_no, title: jobTitle(j.sm8_description ?? "") })),
    locations,
  };
}
