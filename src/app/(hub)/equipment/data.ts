import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate, isoTime } from "../_registers/form-values";
import { mergeOptions } from "../subcontractors/rules";
import {
  ASSET_CATEGORY_LIST, DEFAULT_PLACES, DEFAULT_REASONS, DEFAULT_UNITS, MATERIAL_CATEGORY_LIST, PLACE_LIST, REASON_LIST, UNIT_LIST,
  type AssetStatus, type MaterialStatus, type ReportStatus, type StocktakeStatus, type ToolKind, type ToolWants,
} from "./rules";

export type AssetRow = {
  id: number;
  assetTag: string;
  name: string;
  category: string;
  makeModel: string;
  serialNo: string;
  status: AssetStatus;
  place: string | null;
  vehicleId: number | null;
  personId: number | null;
  purchasedOn: string | null;
  serviceIntervalMonths: number | null;
  lastServiceOn: string | null;
  nextServiceOn: string | null;
  testTagDue: string | null;
  havMagnitude: string | null;
  havTriggerMins: number | null;
  havRef: string;
  notes: string;
  // Out on a job now (its open booking on the job's Plant page).
  onJob: { jobNo: string; dueBack: string | null; outWith: string } | null;
};

export type AssetServiceRow = {
  id: number;
  assetId: number;
  servicedOn: string;
  servicedBy: string;
  workDone: string;
  cost: string | null;
  nextDue: string | null;
  notes: string;
};

export type StockAt = { place: string | null; vehicleId: number | null; qty: number };

export type MaterialRow = {
  id: number;
  name: string;
  category: string;
  unit: string;
  supplierId: number | null;
  supplierName: string;
  supplierCode: string;
  sdsSubstanceId: number | null;
  sdsProduct: string;
  cost: string | null;
  minLevel: number | null;
  reorderQty: number | null;
  status: MaterialStatus;
  lastCountedOn: string | null;
  lastCountedBy: string;
  notes: string;
  stock: StockAt[];
  total: number;
};

export type StocktakeLine = { id: number; materialId: number; name: string; unit: string; expected: number; counted: number; applied: boolean; newQty: number | null };

export type StocktakeRow = {
  id: number;
  locationLabel: string;
  place: string | null;
  vehicleId: number | null;
  status: StocktakeStatus;
  countedBy: string;
  countedAt: string;
  decidedBy: string;
  decidedAt: string | null;
  notes: string;
  decisionNotes: string;
  lines: StocktakeLine[];
};

export type ToolReportRow = {
  id: number;
  kind: ToolKind;
  assetId: number | null;
  toolName: string;
  occurredAt: string | null;
  location: string;
  policeRef: string;
  details: string;
  wants: ToolWants;
  urgency: string | null;
  repairNotes: string;
  replaceNotes: string;
  reportedBy: string;
  source: "office" | "team" | "yard";
  status: ReportStatus;
  pendingStatus: AssetStatus | null; // yard reports: the status waiting for the office to confirm
  pendingPlace: string;
  statusConfirmedBy: string;
  statusConfirmedAt: string | null;
  requestId: number | null;
  closedAt: string | null;
  closedBy: string;
  officeNotes: string;
  createdAt: string;
};

export type MoveRow = {
  id: number;
  at: string;
  by: string;
  locationLabel: string;
  change: number | null;
  qtyAfter: number | null;
  reason: string;
  jobRef: string;
  notes: string;
};

export type VehicleLoc = { id: number; reg: string; makeModel: string; driver: string; holdsStock: boolean };

export type EquipmentData = {
  assets: AssetRow[];
  services: AssetServiceRow[];
  materials: MaterialRow[];
  stocktakes: StocktakeRow[];
  reports: ToolReportRow[];
  vehicles: VehicleLoc[];
  people: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  // CoSHH substances from Hazards and CoSHH (added there, not here).
  substances: { id: number; label: string }[];
  places: string[];
  assetCategories: string[];
  materialCategories: string[];
  units: string[];
  reasons: string[];
  // Load-up sheets with problems the office hasn't sorted (shown under Needs attention).
  loadUpProblems: { sheetId: number; jobNo: string; date: string }[];
  // Materials returned at the yard that aren't on the register, waiting for the office.
  yardReturns: { id: number; name: string; qty: number; unit: string; jobNo: string; location: string; returnedBy: string; notes: string; at: string }[];
};

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
function toAsset(r: any): AssetRow {
  return {
    id: Number(r.id), assetTag: s(r.asset_tag), name: r.name, category: s(r.category), makeModel: s(r.make_model), serialNo: s(r.serial_no),
    status: r.status, place: r.location_place ?? null, vehicleId: n(r.location_vehicle_id), personId: n(r.location_person_id),
    purchasedOn: isoDate(r.purchased_on), serviceIntervalMonths: n(r.service_interval_months), lastServiceOn: isoDate(r.last_service_on),
    nextServiceOn: isoDate(r.next_service_on), testTagDue: isoDate(r.test_tag_due), havMagnitude: r.hav_magnitude == null ? null : String(Number(r.hav_magnitude)),
    havTriggerMins: n(r.hav_trigger_mins), havRef: s(r.hav_ref), notes: s(r.notes),
    onJob: r.on_job_no ? { jobNo: r.on_job_no, dueBack: isoDate(r.on_job_due_back), outWith: s(r.on_job_with) } : null,
  };
}

function toService(r: any): AssetServiceRow {
  return {
    id: Number(r.id), assetId: Number(r.asset_id), servicedOn: isoDate(r.serviced_on)!, servicedBy: s(r.serviced_by), workDone: s(r.work_done),
    cost: r.cost == null ? null : String(r.cost), nextDue: isoDate(r.next_due), notes: s(r.notes),
  };
}

function toMaterial(r: any, stock: StockAt[]): MaterialRow {
  return {
    id: Number(r.id), name: r.name, category: s(r.category), unit: s(r.unit) || "each", supplierId: n(r.supplier_id), supplierName: s(r.supplier_name),
    supplierCode: s(r.supplier_code), sdsSubstanceId: n(r.sds_substance_id), sdsProduct: s(r.sds_product), cost: r.cost == null ? null : String(r.cost), minLevel: n(r.min_level), reorderQty: n(r.reorder_qty),
    status: r.status, lastCountedOn: isoDate(r.last_counted_on), lastCountedBy: s(r.last_counted_by), notes: s(r.notes),
    stock, total: Math.round(stock.reduce((t, x) => t + x.qty, 0) * 1000) / 1000,
  };
}

function toReport(r: any): ToolReportRow {
  return {
    id: Number(r.id), kind: r.kind, assetId: n(r.asset_id), toolName: r.tool_name, occurredAt: isoTime(r.occurred_at), location: s(r.location),
    policeRef: s(r.police_ref), details: s(r.details), wants: r.wants, urgency: r.urgency ?? null, repairNotes: s(r.repair_notes),
    replaceNotes: s(r.replace_notes), reportedBy: r.reported_by, source: r.source, status: r.status, requestId: n(r.request_id),
    pendingStatus: r.pending_status ?? null, pendingPlace: s(r.pending_location_place), statusConfirmedBy: s(r.status_confirmed_by),
    statusConfirmedAt: isoTime(r.status_confirmed_at),
    closedAt: isoTime(r.closed_at), closedBy: s(r.closed_by), officeNotes: s(r.office_notes), createdAt: isoTime(r.created_at)!,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// The office's added options for one dropdown list (same as getOptions, on the given connection).
async function optionsOf(sql: Sql, list: string): Promise<string[]> {
  const rows = await sql<{ value: string }[]>`select value from select_options where list = ${list} order by sort nulls last, lower(value)`;
  return rows.map((r) => r.value);
}

async function stockFor(sql: Sql, materialId: number | null): Promise<Map<number, StockAt[]>> {
  const rows = await sql<{ material_id: string; location_place: string | null; location_vehicle_id: string | null; qty: string }[]>`
    select material_id, location_place, location_vehicle_id, qty from material_stock
    where qty <> 0 ${materialId ? sql`and material_id = ${materialId}` : sql``}
    order by location_place nulls last, location_vehicle_id`;
  const m = new Map<number, StockAt[]>();
  for (const r of rows) {
    const id = Number(r.material_id);
    if (!m.has(id)) m.set(id, []);
    m.get(id)!.push({ place: r.location_place, vehicleId: n(r.location_vehicle_id), qty: Number(r.qty) });
  }
  return m;
}

function materialQuery(sql: Sql, id: number | null) {
  return sql`
    select m.*, s.name as supplier_name, c.product as sds_product from materials m left join suppliers s on s.id = m.supplier_id
    left join substances c on c.id = m.sds_substance_id
    ${id ? sql`where m.id = ${id}` : sql``}
    order by lower(m.name), lower(m.unit)`;
}

async function stocktakeRows(sql: Sql, id: number | null): Promise<StocktakeRow[]> {
  const heads = await sql`select * from stocktakes ${id ? sql`where id = ${id}` : sql``} order by counted_at desc, id desc limit 200`;
  if (!heads.length) return [];
  const ids = heads.map((h) => Number(h.id));
  const lines = await sql`
    select l.*, m.name, m.unit from stocktake_lines l join materials m on m.id = l.material_id
    where l.stocktake_id in ${sql(ids)} order by lower(m.name)`;
  return heads.map((h) => ({
    id: Number(h.id), locationLabel: h.location_label, place: h.location_place ?? null, vehicleId: n(h.location_vehicle_id), status: h.status,
    countedBy: h.counted_by, countedAt: isoTime(h.counted_at)!, decidedBy: s(h.decided_by), decidedAt: isoTime(h.decided_at),
    notes: s(h.notes), decisionNotes: s(h.decision_notes),
    lines: lines.filter((l) => Number(l.stocktake_id) === Number(h.id)).map((l) => ({
      id: Number(l.id), materialId: Number(l.material_id), name: l.name, unit: s(l.unit), expected: Number(l.expected), counted: Number(l.counted),
      applied: l.applied, newQty: l.new_qty == null ? null : Number(l.new_qty),
    })),
  }));
}

// Everything the page shows. Saves return it fresh too, since one stock move can change several lists.
export async function loadEquipment(given?: Sql): Promise<EquipmentData> {
  const sql = given ?? (await readDb());
  const [assets, services, materials, stock, stocktakes, reports, vehicles, people, suppliers, places, assetCats, matCats, units, reasons, usedPlaces, substances, loadUpProblems, yardReturns] = await Promise.all([
    sql`select a.*, j.job_no as on_job_no, p.due_back as on_job_due_back, p.out_with_label as on_job_with
      from assets a left join job_plant p on p.asset_id = a.id and p.returned_at is null left join jobs j on j.id = p.job_id
      order by lower(a.name), a.asset_tag`,
    sql`select * from asset_services order by serviced_on desc, id desc`,
    materialQuery(sql, null),
    stockFor(sql, null),
    stocktakeRows(sql, null),
    sql`select * from tool_reports order by created_at desc, id desc`,
    sql<{ id: string; reg: string; make_model: string | null; driver: string | null; holds_stock: boolean }[]>`
      select v.id, v.reg, v.make_model, p.name as driver, v.holds_stock from vehicles v left join people p on p.id = v.assigned_to_id order by v.reg`,
    sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
    sql<{ id: string; name: string }[]>`select id, name from suppliers order by lower(name)`,
    optionsOf(sql, PLACE_LIST),
    optionsOf(sql, ASSET_CATEGORY_LIST),
    optionsOf(sql, MATERIAL_CATEGORY_LIST),
    optionsOf(sql, UNIT_LIST),
    optionsOf(sql, REASON_LIST),
    sql<{ p: string }[]>`select distinct location_place as p from assets where location_place is not null
                         union select distinct location_place from material_stock where location_place is not null`,
    sql<{ id: string; product: string; supplier: string | null }[]>`
      select c.id, c.product, s.name as supplier from substances c left join suppliers s on s.id = c.supplier_id order by lower(c.product), c.id`,
    sql<{ id: string; job_no: string; at: Date }[]>`
      select s.id, j.job_no, coalesce(s.loaded_at, s.updated_at, s.created_at) as at from load_up_sheets s join jobs j on j.id = s.job_id
      where s.problems_open order by at`,
    sql`select r.*, j.job_no from yard_returns r left join jobs j on j.id = r.job_id where r.status = 'new' order by r.created_at`,
  ]);
  return {
    assets: assets.map(toAsset),
    services: services.map(toService),
    materials: materials.map((m) => toMaterial(m, stock.get(Number(m.id)) ?? [])),
    stocktakes,
    reports: reports.map(toReport),
    vehicles: vehicles.map((v) => ({ id: Number(v.id), reg: v.reg, makeModel: s(v.make_model), driver: s(v.driver), holdsStock: v.holds_stock })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    suppliers: suppliers.map((x) => ({ id: Number(x.id), name: x.name })),
    substances: substances.map((x) => ({ id: Number(x.id), label: x.supplier ? `${x.product} (${x.supplier})` : x.product })),
    places: mergeOptions(DEFAULT_PLACES, [...places, ...usedPlaces.map((r) => r.p)]),
    assetCategories: mergeOptions([], [...assetCats, ...assets.map((a) => s(a.category)).filter(Boolean)]),
    materialCategories: mergeOptions([], [...matCats, ...materials.map((m) => s(m.category)).filter(Boolean)]),
    units: mergeOptions(DEFAULT_UNITS, units),
    reasons: mergeOptions(DEFAULT_REASONS, reasons),
    yardReturns: yardReturns.map((r) => ({
      id: Number(r.id), name: r.name, qty: Number(r.qty), unit: s(r.unit), jobNo: s(r.job_no), location: r.location_label, returnedBy: r.returned_by,
      notes: s(r.notes), at: isoTime(r.created_at)!,
    })),
    loadUpProblems: loadUpProblems.map((p) => ({ sheetId: Number(p.id), jobNo: p.job_no, date: isoTime(p.at)!.slice(0, 10) })),
  };
}

// Single rows, read back after a save (inside or outside the save's transaction).
export async function loadAsset(sql: Sql, id: number): Promise<AssetRow | null> {
  const [r] = await sql`select a.*, j.job_no as on_job_no, p.due_back as on_job_due_back, p.out_with_label as on_job_with
      from assets a left join job_plant p on p.asset_id = a.id and p.returned_at is null left join jobs j on j.id = p.job_id where a.id = ${id}`;
  return r ? toAsset(r) : null;
}
export async function loadAssetService(sql: Sql, id: number): Promise<AssetServiceRow | null> {
  const [r] = await sql`select * from asset_services where id = ${id}`;
  return r ? toService(r) : null;
}
export async function loadMaterial(sql: Sql, id: number): Promise<MaterialRow | null> {
  const [[r], stock] = await Promise.all([materialQuery(sql, id), stockFor(sql, id)]);
  return r ? toMaterial(r, stock.get(id) ?? []) : null;
}
export async function loadStocktake(sql: Sql, id: number): Promise<StocktakeRow | null> {
  return (await stocktakeRows(sql, id))[0] ?? null;
}
export async function loadToolReport(sql: Sql, id: number): Promise<ToolReportRow | null> {
  const [r] = await sql`select * from tool_reports where id = ${id}`;
  return r ? toReport(r) : null;
}

export async function loadMoves(sql: Sql, kind: "material" | "asset", id: number): Promise<MoveRow[]> {
  const rows = kind === "material"
    ? await sql`select * from stock_moves where material_id = ${id} order by at desc, id desc limit 200`
    : await sql`select * from stock_moves where asset_id = ${id} order by at desc, id desc limit 200`;
  return rows.map((r) => ({
    id: Number(r.id), at: isoTime(r.at)!, by: s(r.by), locationLabel: r.location_label, change: n(r.change), qtyAfter: n(r.qty_after),
    reason: r.reason, jobRef: s(r.job_ref), notes: s(r.notes),
  }));
}

// Just the locations (places, vehicles, people), for location dropdowns outside this page.
export async function loadLocations(given?: Sql): Promise<Pick<EquipmentData, "places" | "vehicles" | "people">> {
  const sql = given ?? (await readDb());
  const [vehicles, people, places, usedPlaces] = await Promise.all([
    sql<{ id: string; reg: string; make_model: string | null; driver: string | null; holds_stock: boolean }[]>`
      select v.id, v.reg, v.make_model, p.name as driver, v.holds_stock from vehicles v left join people p on p.id = v.assigned_to_id order by v.reg`,
    sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
    optionsOf(sql, PLACE_LIST),
    sql<{ p: string }[]>`select distinct location_place as p from assets where location_place is not null
                         union select distinct location_place from material_stock where location_place is not null`,
  ]);
  return {
    vehicles: vehicles.map((v) => ({ id: Number(v.id), reg: v.reg, makeModel: s(v.make_model), driver: s(v.driver), holdsStock: v.holds_stock })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    places: mergeOptions(DEFAULT_PLACES, [...places, ...usedPlaces.map((r) => r.p)]),
  };
}
