import "server-only";
import { readDb } from "@/lib/db";
import { jobTitle } from "@/lib/jobs/stages";
import { ukToday } from "../(hub)/_registers/dates";
import { isoDate } from "../(hub)/_registers/form-values";
import { loadLocations } from "../(hub)/equipment/data";
import type { LocationData } from "../(hub)/equipment/parts";
import { locKey, locLabel } from "../(hub)/equipment/rules";
import { loadSheets, type Sheet } from "../(hub)/_site/load-up";

// What the yard tablet shows: today's load-ups, plant out on jobs, equipment to report, materials to
// return or count, and the crew names (picked for each action, never remembered).
export type YardData = {
  today: string;
  names: string[];
  sheets: Sheet[];
  out: { id: number; label: string; category: string; jobNo: string; outWith: string; dueBack: string | null }[];
  assets: { id: number; label: string; status: string; location: string }[];
  materials: { id: number; name: string; unit: string; stock: { key: string; label: string; qty: number }[] }[];
  jobs: { id: number; jobNo: string; title: string }[];
  locations: LocationData;
};

export async function loadYardData(): Promise<YardData> {
  const sql = await readDb();
  const today = ukToday();
  const [people, sheets, out, assets, materials, stock, jobs, locations] = await Promise.all([
    sql<{ name: string }[]>`select name from people where active and 'crew' = any(lists) order by lower(name)`,
    loadSheets(sql, { yard: today }),
    sql`select p.id, p.asset_name, p.asset_tag, p.category, p.out_with_label, p.due_back, j.job_no
        from job_plant p join jobs j on j.id = p.job_id where p.returned_at is null order by p.due_back nulls last, lower(p.asset_name)`,
    sql`select id, name, asset_tag, status, location_place, location_vehicle_id, location_person_id from assets where status <> 'retired' order by lower(name), asset_tag`,
    sql<{ id: string; name: string; unit: string }[]>`select id, name, unit from materials where status = 'active' order by lower(name), lower(unit)`,
    sql<{ material_id: string; location_place: string | null; location_vehicle_id: string | null; qty: string }[]>`
      select material_id, location_place, location_vehicle_id, qty from material_stock where qty <> 0`,
    sql<{ id: string; job_no: string; sm8_description: string | null }[]>`
      select id, job_no, sm8_description from jobs where stage = 'approved' order by length(job_no) desc, job_no desc limit 300`,
    loadLocations(sql),
  ]);
  const byMat = new Map<number, YardData["materials"][number]["stock"]>();
  for (const r of stock) {
    const l = { place: r.location_place, vehicleId: r.location_vehicle_id ? Number(r.location_vehicle_id) : null };
    byMat.set(Number(r.material_id), [...(byMat.get(Number(r.material_id)) ?? []), { key: locKey(l), label: locLabel(l, locations.vehicles, locations.people), qty: Number(r.qty) }]);
  }
  return {
    today,
    names: people.map((p) => p.name),
    sheets,
    out: out.map((r) => ({
      id: Number(r.id), label: r.asset_tag ? `${r.asset_tag} ${r.asset_name}` : r.asset_name, category: r.category ?? "", jobNo: r.job_no,
      outWith: r.out_with_label ?? "", dueBack: isoDate(r.due_back),
    })),
    assets: assets.map((a) => ({
      id: Number(a.id), label: a.asset_tag ? `${a.asset_tag} ${a.name}` : a.name, status: a.status,
      location: locLabel({ place: a.location_place, vehicleId: a.location_vehicle_id ? Number(a.location_vehicle_id) : null, personId: a.location_person_id ? Number(a.location_person_id) : null },
        locations.vehicles, locations.people),
    })),
    materials: materials.map((m) => ({ id: Number(m.id), name: m.name, unit: m.unit || "each", stock: byMat.get(Number(m.id)) ?? [] })),
    jobs: jobs.map((j) => ({ id: Number(j.id), jobNo: j.job_no, title: jobTitle(j.sm8_description ?? "") })),
    locations,
  };
}
