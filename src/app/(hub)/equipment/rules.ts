// Equipment and materials rules, kept free of the database so they can be tested on their own.
import { daysBetween, dueState, niceDate, type Due } from "../_registers/dates";
import { vehicleLocationLabel } from "../fleet/rules";

export const PLACE_LIST = "equipment.place";
export const DEFAULT_PLACES = ["CBS Warehouse", "CBS Office"];
export const ASSET_CATEGORY_LIST = "equipment.category";
export const MATERIAL_CATEGORY_LIST = "materials.category";
export const UNIT_LIST = "materials.unit";
export const REASON_LIST = "stock.reason";
// Reasons for adding or removing stock by hand. "Moved" and "Stocktake adjustment" are set by the hub.
export const DEFAULT_REASONS = ["Delivered", "Returned from job", "Used on job", "Damaged / written off", "Correction"];
export const DEFAULT_UNITS = ["each", "box", "bag", "tin", "tub", "roll", "pack", "litre", "metre", "sheet", "pallet"];

export const ASSET_STATUSES = [
  { value: "in_service", label: "In service" },
  { value: "needs_repair", label: "Needs repair" },
  { value: "out_for_service", label: "Out for service" },
  { value: "lost", label: "Lost" },
  { value: "retired", label: "Retired" },
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number]["value"];

export const MATERIAL_STATUSES = [
  { value: "active", label: "Active" },
  { value: "discontinued", label: "Discontinued" },
] as const;
export type MaterialStatus = (typeof MATERIAL_STATUSES)[number]["value"];

export const STOCKTAKE_STATUSES = [
  { value: "pending", label: "Waiting for approval" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
] as const;
export type StocktakeStatus = (typeof STOCKTAKE_STATUSES)[number]["value"];

// What the office and team app can report. The yard can also report equipment as found.
export const TOOL_KINDS = [
  { value: "lost", label: "Lost" },
  { value: "stolen", label: "Stolen" },
  { value: "damaged", label: "Damaged" },
] as const;
export const REPORT_KINDS = [...TOOL_KINDS, { value: "found", label: "Found" }] as const;
export type ToolKind = (typeof REPORT_KINDS)[number]["value"];

export const TOOL_WANTS = [
  { value: "none", label: "No" },
  { value: "replace", label: "Yes - request a replacement" },
  { value: "repair", label: "Repair it - it can be fixed" },
] as const;
export type ToolWants = (typeof TOOL_WANTS)[number]["value"];

export const REPORT_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "closed", label: "Closed" },
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number]["value"];

export function labelOf(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

/* ---------- Locations ---------- */

// Where something is: a place (CBS Warehouse, CBS Office, or one the office adds), a vehicle that
// holds stock, or (equipment only) a person. In forms it travels as one key: "p:CBS Warehouse",
// "v:12" or "u:5".
export type Loc = { place: string; vehicleId: null; personId: null }
  | { place: null; vehicleId: number; personId: null }
  | { place: null; vehicleId: null; personId: number };

export function locKey(l: { place: string | null; vehicleId: number | null; personId?: number | null } | null): string {
  if (!l) return "";
  if (l.place) return `p:${l.place}`;
  if (l.vehicleId) return `v:${l.vehicleId}`;
  if (l.personId) return `u:${l.personId}`;
  return "";
}

export function parseLocKey(key: string | null | undefined, allowPerson = true): Loc | null {
  const k = String(key ?? "");
  if (k.startsWith("p:")) {
    const place = k.slice(2).trim().replace(/\s+/g, " ");
    return place && place.length <= 80 ? { place, vehicleId: null, personId: null } : null;
  }
  const n = Number(k.slice(2));
  if (!Number.isInteger(n) || n <= 0) return null;
  if (k.startsWith("v:")) return { place: null, vehicleId: n, personId: null };
  if (k.startsWith("u:") && allowPerson) return { place: null, vehicleId: null, personId: n };
  return null;
}

export type VehicleForLoc = { id: number; reg: string; makeModel: string; driver: string };

export function locLabel(
  l: { place: string | null; vehicleId: number | null; personId?: number | null } | null,
  vehicles: VehicleForLoc[],
  people: { id: number; name: string }[],
): string {
  if (!l) return "No location";
  if (l.place) return l.place;
  if (l.vehicleId) {
    const v = vehicles.find((x) => x.id === l.vehicleId);
    return v ? vehicleLocationLabel(v) : "A vehicle no longer on the fleet";
  }
  if (l.personId) {
    const p = people.find((x) => x.id === l.personId);
    return p ? `With ${p.name}` : "With someone who has left";
  }
  return "No location";
}

/* ---------- Numbers ---------- */

// Quantities are kept to 3 decimal places (e.g. 2.5 litres) and shown without trailing zeros.
export function qty(n: number): string {
  const r = Math.round(n * 1000) / 1000;
  return r.toLocaleString("en-GB", { maximumFractionDigits: 3 });
}

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Approving a stocktake keeps any stock moved since the count was entered:
// new stock = counted + (stock now - stock when counted). Never below zero.
export function approvedQty(counted: number, expectedAtCount: number, now: number): number {
  return Math.max(0, round3(counted + (now - expectedAtCount)));
}

export function isLow(total: number, minLevel: number | null): boolean {
  return minLevel != null && total <= minLevel;
}

/* ---------- Tool reports ---------- */

// What a tool report does to the equipment it names: damaged needs repair, lost or stolen is lost,
// found is back in service.
export function assetStatusAfterReport(kind: ToolKind): AssetStatus {
  return kind === "damaged" ? "needs_repair" : kind === "found" ? "in_service" : "lost";
}

// A stolen tool is always urgent; otherwise the reporter's choice (This week if not given).
export function reportUrgency(kind: ToolKind, wants: ToolWants, urgency: string | null): "today" | "this_week" | "no_rush" | null {
  if (wants === "none") return null;
  if (kind === "stolen") return "today";
  return urgency === "today" || urgency === "no_rush" ? urgency : "this_week";
}

// The Team request a replacement or repair raises, linked back to the report.
export function requestFor(r: {
  id: number; kind: ToolKind; wants: ToolWants; toolName: string; replaceNotes: string; repairNotes: string;
}): { category: string; details: string } | null {
  if (r.wants === "none") return null;
  const k = labelOf(REPORT_KINDS, r.kind).toLowerCase();
  if (r.wants === "replace") {
    return {
      category: "Tools or equipment",
      details: `Replace: ${r.toolName} (${k}).${r.replaceNotes ? ` ${r.replaceNotes}` : ""}\nSee tool report ${r.id}.`,
    };
  }
  return {
    category: "Tool repair",
    details: `Repair: ${r.toolName} (${k}).${r.repairNotes ? ` ${r.repairNotes}` : ""}\nSee tool report ${r.id}.`,
  };
}

/* ---------- Due and overdue ---------- */

export type DueItem = { what: string; name: string; detail: string; tone: Due; open: { kind: "asset" | "material" | "stocktake" | "report"; id: number } };

// The register's own "due and overdue" list. It never creates or closes tasks.
export function equipmentDueItems(
  assets: { id: number; name: string; assetTag: string; status: AssetStatus; nextServiceOn: string | null; testTagDue: string | null;
    onJob?: { jobNo: string; dueBack: string | null } | null }[],
  materials: { id: number; name: string; status: MaterialStatus; minLevel: number | null; total: number; unit: string }[],
  stocktakes: { id: number; locationLabel: string; status: StocktakeStatus; countedAt: string }[],
  reports: { id: number; toolName: string; kind: ToolKind; status: ReportStatus }[],
  today: string,
): DueItem[] {
  const out: DueItem[] = [];
  for (const a of assets) {
    if (a.status === "retired" || a.status === "lost") continue;
    const name = a.assetTag ? `${a.assetTag} ${a.name}` : a.name;
    for (const [what, d] of [["Service", a.nextServiceOn], ["PAT test", a.testTagDue]] as const) {
      const tone = dueState(d, today, 30, 30);
      if (tone === "overdue" || tone === "soon") {
        out.push({ what, name, tone, detail: daysBetween(today, d!) < 0 ? `Was due ${niceDate(d)}` : `Due ${niceDate(d)}`, open: { kind: "asset", id: a.id } });
      }
    }
    if (a.status === "needs_repair") out.push({ what: "Needs repair", name, tone: "overdue", detail: a.onJob ? `On job ${a.onJob.jobNo}` : "", open: { kind: "asset", id: a.id } });
    if (a.onJob?.dueBack) {
      const left = daysBetween(today, a.onJob.dueBack);
      if (left <= 2) out.push({ what: "Due back", name, tone: left < 0 ? "overdue" : "soon", open: { kind: "asset", id: a.id },
        detail: `Job ${a.onJob.jobNo}, ${left < 0 ? `was due back ${niceDate(a.onJob.dueBack)}` : left === 0 ? "due back today" : `due back ${niceDate(a.onJob.dueBack)}`}` });
    }
  }
  for (const m of materials) {
    if (m.status === "active" && isLow(m.total, m.minLevel)) {
      out.push({ what: "Low stock", name: m.name, tone: m.total <= 0 ? "overdue" : "soon", detail: `${qty(m.total)} ${m.unit} left (minimum ${qty(m.minLevel!)})`, open: { kind: "material", id: m.id } });
    }
  }
  for (const s of stocktakes) {
    if (s.status === "pending") out.push({ what: "Stocktake to approve", name: s.locationLabel, tone: "soon", detail: `Counted ${niceDate(s.countedAt.slice(0, 10))}`, open: { kind: "stocktake", id: s.id } });
  }
  for (const r of reports) {
    if (r.status === "new") out.push({ what: "Tool report", name: r.toolName, tone: "overdue", detail: labelOf(REPORT_KINDS, r.kind), open: { kind: "report", id: r.id } });
  }
  const rank = (t: Due) => (t === "overdue" ? 0 : 1);
  return out.sort((a, b) => rank(a.tone) - rank(b.tone) || a.name.localeCompare(b.name));
}
