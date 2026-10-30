// Fleet rules, kept free of the database so they can be tested on their own.
import { addDays, addMonths, daysBetween, dueState, niceDate, type Due } from "../_registers/dates";

export const FREQUENCIES = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "not_required", label: "Not required" },
] as const;
export type Frequency = (typeof FREQUENCIES)[number]["value"];

export const CHECK_STATUSES = [
  { value: "passed", label: "Passed" },
  { value: "defects", label: "Defects logged" },
  { value: "off_road", label: "Off road" },
  { value: "defects_fixed", label: "Defects fixed" },
] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number]["value"];

export const ACCIDENT_STATUSES = [
  { value: "reported", label: "Reported" },
  { value: "claim_lodged", label: "Claim lodged" },
  { value: "repairs_booked", label: "Repairs booked" },
  { value: "closed", label: "Closed" },
] as const;
export type AccidentStatus = (typeof ACCIDENT_STATUSES)[number]["value"];

// The seven checklist items, in the team app's order and wording.
export const CHECK_ITEMS = [
  { key: "tyres_ok", label: "Tyres and wheels" },
  { key: "lights_ok", label: "Lights and indicators" },
  { key: "fluids_ok", label: "Fluids, no leaks" },
  { key: "body_ok", label: "Body, glass and mirrors" },
  { key: "first_aid_ok", label: "First aid kit" },
  { key: "extinguisher_ok", label: "Fire extinguisher" },
  { key: "restraints_ok", label: "Load restraints" },
] as const;
export type CheckItem = (typeof CHECK_ITEMS)[number]["key"];

export function labelOf(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

// Registration plates are stored in capitals with no spaces, so "zz11 zzz" and "ZZ11ZZZ" are one van.
export function normaliseReg(reg: string): string {
  return reg.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

// How a vehicle shows as a stock location: "Ford Transit - ZZ Driver (ZZ33ZZZ)".
export function vehicleLocationLabel(v: { reg: string; makeModel: string; driver: string }): string {
  const left = [v.makeModel, v.driver].filter(Boolean).join(" - ");
  return left ? `${left} (${v.reg})` : v.reg;
}

function step(date: string, f: Frequency): string {
  if (f === "weekly") return addDays(date, 7);
  return addMonths(date, f === "quarterly" ? 3 : 1);
}

// How early a check still counts for the inspection that is due (days before the due date).
function lead(f: Frequency): number {
  return f === "weekly" ? 3 : f === "quarterly" ? 21 : 10;
}

// The next inspection date after a check on checkedOn. A check counts when it falls on or after
// (due date - lead days); the date then moves on by the frequency until it is after the check.
// A check before that window leaves the date alone. With no date yet, it is set from the check.
export function nextInspectionAfterCheck(next: string | null, checkedOn: string, f: Frequency): string | null {
  if (f === "not_required") return next;
  if (!next) return step(checkedOn, f);
  if (checkedOn < addDays(next, -lead(f))) return next;
  let n = next;
  let guard = 0;
  do n = step(n, f);
  while (n <= checkedOn && ++guard < 520);
  return n;
}

// Miles: within 1,000 is due soon, within 3,000 coming up.
export function milesState(dueMiles: number | null, currentMiles: number | null): Due {
  if (dueMiles == null || currentMiles == null) return "none";
  const left = dueMiles - currentMiles;
  if (left < 0) return "overdue";
  if (left <= 1000) return "soon";
  if (left <= 3000) return "up";
  return "ok";
}

export function worst(a: Due, b: Due): Due {
  const order: Due[] = ["overdue", "soon", "up", "ok", "none"];
  return order[Math.min(order.indexOf(a), order.indexOf(b))];
}

export type DueItem = { vehicleId: number; reg: string; what: string; detail: string; tone: Due; open?: { kind: "check" | "accident"; id: number } };

type VehicleForDue = {
  id: number;
  reg: string;
  vehicleTaxDue: string | null;
  motExpiry: string | null;
  serviceDue: string | null;
  serviceDueMiles: number | null;
  latestMiles: number | null;
  inspectionFrequency: Frequency;
  nextInspectionOn: string | null;
};

// The register's own "due and overdue" list (until the Actions board hook exists). Shows what is
// overdue or due within 30 days, unreviewed checks, vehicles off the road and open accidents.
// It never creates or closes tasks.
export function fleetDueItems(
  vehicles: VehicleForDue[],
  checks: { id: number; vehicleId: number; checkedOn: string; status: CheckStatus; reviewed: boolean }[],
  accidents: { id: number; vehicleId: number; occurredAt: string | null; status: AccidentStatus }[],
  today: string,
): DueItem[] {
  const out: DueItem[] = [];
  const date = (v: VehicleForDue, what: string, d: string | null) => {
    const tone = dueState(d, today, 30, 30);
    if (tone === "overdue" || tone === "soon") {
      const n = daysBetween(today, d!);
      out.push({ vehicleId: v.id, reg: v.reg, what, tone, detail: n < 0 ? `Was due ${niceDate(d)}` : `Due ${niceDate(d)}` });
    }
  };
  for (const v of vehicles) {
    date(v, "Vehicle Tax", v.vehicleTaxDue);
    date(v, "MOT", v.motExpiry);
    date(v, "Service", v.serviceDue);
    const m = milesState(v.serviceDueMiles, v.latestMiles);
    if (m === "overdue" || m === "soon") {
      const left = v.serviceDueMiles! - v.latestMiles!;
      out.push({ vehicleId: v.id, reg: v.reg, what: "Service (miles)", tone: m,
        detail: left < 0 ? `${(-left).toLocaleString("en-GB")} miles over` : `${left.toLocaleString("en-GB")} miles left` });
    }
    if (v.inspectionFrequency !== "not_required") date(v, "Vehicle inspection", v.nextInspectionOn);
  }
  const reg = new Map(vehicles.map((v) => [v.id, v.reg]));
  for (const c of checks) {
    if (!c.reviewed) {
      out.push({ vehicleId: c.vehicleId, reg: reg.get(c.vehicleId) ?? "", what: "Check to review", tone: c.status === "passed" || c.status === "defects_fixed" ? "soon" : "overdue",
        detail: `${labelOf(CHECK_STATUSES, c.status)}, ${niceDate(c.checkedOn)}`, open: { kind: "check", id: c.id } });
    }
  }
  // A vehicle is off the road while its latest check says so.
  const latest = new Map<number, (typeof checks)[number]>();
  for (const c of checks) {
    const l = latest.get(c.vehicleId);
    if (!l || c.checkedOn > l.checkedOn || (c.checkedOn === l.checkedOn && c.id > l.id)) latest.set(c.vehicleId, c);
  }
  for (const c of latest.values()) {
    if (c.status === "off_road" && c.reviewed) {
      out.push({ vehicleId: c.vehicleId, reg: reg.get(c.vehicleId) ?? "", what: "Off the road", tone: "overdue", detail: `Since the check on ${niceDate(c.checkedOn)}`, open: { kind: "check", id: c.id } });
    }
  }
  for (const a of accidents) {
    if (a.status !== "closed") {
      out.push({ vehicleId: a.vehicleId, reg: reg.get(a.vehicleId) ?? "", what: "Accident", tone: "overdue",
        detail: labelOf(ACCIDENT_STATUSES, a.status), open: { kind: "accident", id: a.id } });
    }
  }
  const rank = (t: Due) => (t === "overdue" ? 0 : 1);
  return out.sort((a, b) => rank(a.tone) - rank(b.tone) || a.reg.localeCompare(b.reg));
}
