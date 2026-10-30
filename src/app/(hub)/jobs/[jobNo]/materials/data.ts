import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoTime } from "../../../_registers/form-values";
import { loadLocations } from "../../../equipment/data";
import type { LocationData } from "../../../equipment/parts";
import { locKey, locLabel } from "../../../equipment/rules";

export type JobMoveRow = {
  id: number;
  at: string;
  by: string;
  materialId: number | null;
  name: string;
  unit: string;
  cost: number | null;
  where: string;
  change: number;
  qtyAfter: number | null;
  reason: string;
  notes: string;
  inMove: boolean; // half of a move between two locations that only mentions the job
};

export type StockMaterial = { id: number; name: string; unit: string; stock: { key: string; label: string; qty: number }[] };

export type JobMaterialsData = { moves: JobMoveRow[]; materials: StockMaterial[]; locations: LocationData };

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function loadJobMaterials(jobId: number, given?: Sql): Promise<JobMaterialsData> {
  const sql = given ?? (await readDb());
  const [locations, moves, materials, stock] = await Promise.all([
    loadLocations(sql),
    sql`select m.id, m.at, m.by, m.material_id, m.location_label, m.change, m.qty_after, m.reason, m.notes, m.move_group,
               t.name, t.unit, t.cost
        from stock_moves m join materials t on t.id = m.material_id
        where m.job_id = ${jobId} order by m.at desc, m.id desc limit 1000`,
    sql<{ id: string; name: string; unit: string }[]>`select id, name, unit from materials where status = 'active' order by lower(name), lower(unit)`,
    sql<{ material_id: string; location_place: string | null; location_vehicle_id: string | null; qty: string }[]>`
      select material_id, location_place, location_vehicle_id, qty from material_stock where qty > 0`,
  ]);
  const byMat = new Map<number, StockMaterial["stock"]>();
  for (const r of stock) {
    const l = { place: r.location_place, vehicleId: r.location_vehicle_id ? Number(r.location_vehicle_id) : null };
    const list = byMat.get(Number(r.material_id)) ?? [];
    list.push({ key: locKey(l), label: locLabel(l, locations.vehicles, locations.people), qty: Number(r.qty) });
    byMat.set(Number(r.material_id), list);
  }
  return {
    locations,
    moves: moves.map((r) => ({
      id: Number(r.id), at: isoTime(r.at)!, by: s(r.by), materialId: Number(r.material_id), name: r.name, unit: s(r.unit) || "each",
      cost: r.cost == null ? null : Number(r.cost), where: s(r.location_label), change: Number(r.change ?? 0),
      qtyAfter: r.qty_after == null ? null : Number(r.qty_after), reason: s(r.reason), notes: s(r.notes), inMove: !!r.move_group,
    })),
    materials: materials.map((m) => ({ id: Number(m.id), name: m.name, unit: m.unit || "each", stock: byMat.get(Number(m.id)) ?? [] })),
  };
}
