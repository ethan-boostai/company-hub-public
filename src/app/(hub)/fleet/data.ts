import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate, isoTime } from "../_registers/form-values";
import type { AccidentStatus, CheckStatus, Frequency } from "./rules";

export type VehicleRow = {
  id: number;
  reg: string;
  makeModel: string;
  year: number | null;
  assignedToId: number | null;
  driver: string;
  vehicleTaxDue: string | null;
  motExpiry: string | null;
  serviceDue: string | null;
  inspectionFrequency: Frequency;
  nextInspectionOn: string | null;
  holdsStock: boolean;
  notes: string;
  latestMiles: number | null;      // highest reading from checks and services
  serviceDueMiles: number | null;  // from the latest service that gave one
};

export type CheckRow = {
  id: number;
  vehicleId: number;
  checkedOn: string;
  checkedBy: string;
  odometer: number | null;
  items: Record<string, boolean>;
  defects: string;
  action: string;
  status: CheckStatus;
  reviewed: boolean;
  source: "office" | "team";
};

export type ServiceRow = {
  id: number;
  vehicleId: number;
  servicedOn: string;
  workshop: string;
  workDone: string;
  odometer: number | null;
  cost: string | null;
  nextDue: string | null;
  nextDueMiles: number | null;
  notes: string;
};

export type AccidentRow = {
  id: number;
  vehicleId: number;
  occurredAt: string | null;
  driver: string;
  location: string;
  description: string;
  damage: string;
  injuries: string;
  thirdParty: string;
  thirdPartyReg: string;
  thirdPartyInsurer: string;
  policeEventNo: string;
  status: AccidentStatus;
  source: "office" | "team";
  notes: string;
};

export type FleetData = {
  vehicles: VehicleRow[];
  checks: CheckRow[];
  services: ServiceRow[];
  accidents: AccidentRow[];
  people: { id: number; name: string }[];
};

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

/* eslint-disable @typescript-eslint/no-explicit-any */
function toVehicle(r: any): VehicleRow {
  return {
    id: Number(r.id), reg: r.reg, makeModel: s(r.make_model), year: n(r.year), assignedToId: n(r.assigned_to_id), driver: s(r.driver),
    vehicleTaxDue: isoDate(r.vehicle_tax_due), motExpiry: isoDate(r.mot_expiry), serviceDue: isoDate(r.service_due),
    inspectionFrequency: r.inspection_frequency, nextInspectionOn: isoDate(r.next_inspection_on), holdsStock: r.holds_stock,
    notes: s(r.notes), latestMiles: n(r.latest_miles), serviceDueMiles: n(r.service_due_miles),
  };
}

function toCheck(r: any): CheckRow {
  return {
    id: Number(r.id), vehicleId: Number(r.vehicle_id), checkedOn: isoDate(r.checked_on)!, checkedBy: s(r.checked_by), odometer: n(r.odometer),
    items: {
      tyres_ok: r.tyres_ok, lights_ok: r.lights_ok, fluids_ok: r.fluids_ok, body_ok: r.body_ok,
      first_aid_ok: r.first_aid_ok, extinguisher_ok: r.extinguisher_ok, restraints_ok: r.restraints_ok,
    },
    defects: s(r.defects), action: s(r.action), status: r.status, reviewed: r.reviewed, source: r.source,
  };
}

function toService(r: any): ServiceRow {
  return {
    id: Number(r.id), vehicleId: Number(r.vehicle_id), servicedOn: isoDate(r.serviced_on)!, workshop: s(r.workshop), workDone: s(r.work_done),
    odometer: n(r.odometer), cost: r.cost == null ? null : String(r.cost), nextDue: isoDate(r.next_due), nextDueMiles: n(r.next_due_miles), notes: s(r.notes),
  };
}

function toAccident(r: any): AccidentRow {
  return {
    id: Number(r.id), vehicleId: Number(r.vehicle_id), occurredAt: isoTime(r.occurred_at), driver: s(r.driver), location: s(r.location),
    description: s(r.description), damage: s(r.damage), injuries: s(r.injuries), thirdParty: s(r.third_party), thirdPartyReg: s(r.third_party_reg),
    thirdPartyInsurer: s(r.third_party_insurer), policeEventNo: s(r.police_event_no), status: r.status, source: r.source, notes: s(r.notes),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function vehicleQuery(sql: Sql, id: number | null) {
  return sql`
    select v.*, p.name as driver,
      (select max(o) from (
         select odometer as o from vehicle_checks where vehicle_id = v.id
         union all select odometer from vehicle_services where vehicle_id = v.id) m) as latest_miles,
      (select next_due_miles from vehicle_services
         where vehicle_id = v.id and next_due_miles is not null
         order by serviced_on desc, id desc limit 1) as service_due_miles
    from vehicles v left join people p on p.id = v.assigned_to_id
    ${id ? sql`where v.id = ${id}` : sql``}
    order by v.reg`;
}

export async function loadFleet(): Promise<FleetData> {
  const sql = await readDb();
  const [vehicles, checks, services, accidents, people] = await Promise.all([
    vehicleQuery(sql, null),
    sql`select * from vehicle_checks order by checked_on desc, id desc`,
    sql`select * from vehicle_services order by serviced_on desc, id desc`,
    sql`select * from vehicle_accidents order by occurred_at desc nulls last, id desc`,
    sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
  ]);
  return {
    vehicles: vehicles.map(toVehicle),
    checks: checks.map(toCheck),
    services: services.map(toService),
    accidents: accidents.map(toAccident),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
  };
}

// Single rows, read back after a save (inside or outside the save's transaction).
export async function loadVehicle(sql: Sql, id: number): Promise<VehicleRow | null> {
  const [r] = await vehicleQuery(sql, id);
  return r ? toVehicle(r) : null;
}
export async function loadCheck(sql: Sql, id: number): Promise<CheckRow | null> {
  const [r] = await sql`select * from vehicle_checks where id = ${id}`;
  return r ? toCheck(r) : null;
}
export async function loadService(sql: Sql, id: number): Promise<ServiceRow | null> {
  const [r] = await sql`select * from vehicle_services where id = ${id}`;
  return r ? toService(r) : null;
}
export async function loadAccident(sql: Sql, id: number): Promise<AccidentRow | null> {
  const [r] = await sql`select * from vehicle_accidents where id = ${id}`;
  return r ? toAccident(r) : null;
}
