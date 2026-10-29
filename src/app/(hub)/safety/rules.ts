// Hazards and CoSHH: the fixed lists and the rules both libraries use. Pure (no database), so the
// screens, the server and the unit tests share them.
import { daysBetween, dueState, niceDate } from "../_registers/dates";

/* ---------- Risk ---------- */

export const LIKELIHOOD = [
  { value: 1, label: "Rare" },
  { value: 2, label: "Unlikely" },
  { value: 3, label: "Possible" },
  { value: 4, label: "Likely" },
  { value: 5, label: "Almost certain" },
] as const;

export const CONSEQUENCE = [
  { value: 1, label: "Insignificant" },
  { value: 2, label: "Minor" },
  { value: 3, label: "Moderate" },
  { value: 4, label: "Major" },
  { value: 5, label: "Catastrophic" },
] as const;

export type Rating = "Low" | "Medium" | "High" | "Extreme";

// The same rule as the database (safety_risk_rating) and the old hub: L x C.
export function riskRating(l: number | null, c: number | null): Rating | null {
  if (!l || !c) return null;
  const s = l * c;
  return s >= 20 ? "Extreme" : s >= 10 ? "High" : s >= 5 ? "Medium" : "Low";
}

export const RATING_TONE: Record<Rating, "green" | "amber" | "red" | "grey"> = { Low: "green", Medium: "amber", High: "red", Extreme: "red" };

// Control hierarchy, most effective first.
export const CONTROL_CODES = [
  { value: "E", label: "Eliminate" },
  { value: "S", label: "Substitute" },
  { value: "I", label: "Isolate" },
  { value: "G", label: "Engineering" },
  { value: "A", label: "Administrative" },
  { value: "P", label: "PPE" },
] as const;
export type ControlCode = (typeof CONTROL_CODES)[number]["value"];

export const HAZARD_STATUSES = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
] as const;
export type HazardStatus = (typeof HAZARD_STATUSES)[number]["value"];

export const ACTIVITY_LIST = "hazards.activity";
export const DEFAULT_ACTIVITIES = ["General site work", "Demolition", "Groundworks", "Working at height", "Electrical", "Plant and tools", "Hot works", "Roofing", "Decorating", "Cleaning"];

// The key the RAMS builder uses for a hazard: lower case, a-z 0-9 and _.
export function ramsKey(name: string): string {
  const k = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);
  return k || "hazard";
}

/* ---------- CoSHH ---------- */

export const GHS = [
  { value: "explosive", label: "Explosive" },
  { value: "flammable", label: "Flammable" },
  { value: "oxidising", label: "Oxidising" },
  { value: "gas", label: "Gas under pressure" },
  { value: "corrosive", label: "Corrosive" },
  { value: "toxic", label: "Acute toxicity" },
  { value: "harmful", label: "Harmful or irritant" },
  { value: "health", label: "Serious health hazard" },
  { value: "environment", label: "Hazardous to the environment" },
] as const;
export type Ghs = (typeof GHS)[number]["value"];

export const ROUTES = [
  { value: "inhaled", label: "Breathed in" },
  { value: "swallowed", label: "Swallowed" },
  { value: "skin", label: "Skin contact" },
  { value: "eyes", label: "Eye contact" },
] as const;
export type Route = (typeof ROUTES)[number]["value"];
export type RouteDetail = { effect: string; control: string; firstAid: string };
export type Exposure = Record<Route, RouteDetail>;

export function emptyExposure(): Exposure {
  return { inhaled: blank(), swallowed: blank(), skin: blank(), eyes: blank() };
}
const blank = (): RouteDetail => ({ effect: "", control: "", firstAid: "" });

// Reads the stored jsonb safely (missing routes or fields become empty).
export function readExposure(v: unknown): Exposure {
  const out = emptyExposure();
  if (!v || typeof v !== "object") return out;
  for (const r of ROUTES) {
    const d = (v as Record<string, unknown>)[r.value];
    if (d && typeof d === "object") {
      const o = d as Record<string, unknown>;
      out[r.value] = { effect: str(o.effect), control: str(o.control), firstAid: str(o.firstAid) };
    }
  }
  return out;
}
const str = (v: unknown) => (typeof v === "string" ? v : "");

export const WHO = [
  { value: "employees", label: "Employees" },
  { value: "others", label: "Others (public, other trades)" },
] as const;

export const PPE = [
  { value: "eye", label: "Safety glasses or goggles" },
  { value: "face", label: "Face shield" },
  { value: "gloves", label: "Chemical-resistant gloves" },
  { value: "respiratory", label: "Mask or respirator" },
  { value: "body", label: "Overalls or apron" },
  { value: "feet", label: "Safety boots" },
  { value: "hearing", label: "Ear protection" },
] as const;

export const SUBSTANCE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "assessed", label: "Assessed" },
] as const;
export type SubstanceStatus = (typeof SUBSTANCE_STATUSES)[number]["value"];

// The assessment content (Ethan, 29/10/2026): hazard classes, ingredients, exposure, controls,
// storage, spills, PPE and the SDS. Only a change to these makes a new pack and a new version.
export type AssessmentContent = {
  ghs: string[];
  ingredients: string;
  exposure: Exposure;
  whoExposed: string[];
  frequency: string;
  duration: string;
  controls: string;
  storage: string;
  spillsDisposal: string;
  ppe: string[];
  ppeOther: string;
  sdsFileId: number | null;
};

// A stable fingerprint of the assessment content (order of ticks doesn't matter, spacing is trimmed).
export function contentKey(c: AssessmentContent): string {
  const t = (s: string) => s.replace(/\s+/g, " ").trim();
  const ex = ROUTES.map((r) => [t(c.exposure[r.value].effect), t(c.exposure[r.value].control), t(c.exposure[r.value].firstAid)]);
  return JSON.stringify([
    [...c.ghs].sort(), t(c.ingredients), ex, [...c.whoExposed].sort(), t(c.frequency), t(c.duration),
    t(c.controls), t(c.storage), t(c.spillsDisposal), [...c.ppe].sort(), t(c.ppeOther), c.sdsFileId ?? null,
  ]);
}

// What an Assessed substance needs; anything missing keeps it a Draft.
export function missingForAssessed(s: { supplierId: number | null; useFor: string; controls: string; assessedById: number | null; assessedOn: string | null; reviewOn: string | null; sdsFileId: number | null }): string[] {
  const out: string[] = [];
  if (!s.supplierId) out.push("supplier");
  if (!s.useFor.trim()) out.push("what it's used for");
  if (!s.controls.trim()) out.push("controls");
  if (!s.assessedById) out.push("assessed by");
  if (!s.assessedOn) out.push("assessed on");
  if (!s.reviewOn) out.push("review due");
  if (!s.sdsFileId) out.push("the safety data sheet");
  return out;
}

export function packFileName(product: string, version: number, date: string): string {
  return `${product} - COSHH Assessment v${version} - ${date}.pdf`;
}

/* ---------- Needs attention ---------- */

export type DueItem = { id: number; level: "overdue" | "soon"; tag: string; name: string; detail: string };

function reviewItem(id: number, name: string, reviewOn: string | null, today: string, tag = "Review"): DueItem | null {
  const d = dueState(reviewOn, today, 30, 30);
  if (d !== "overdue" && d !== "soon") return null;
  const n = daysBetween(today, reviewOn!);
  return { id, level: d, tag, name, detail: n < 0 ? `Review was due ${niceDate(reviewOn)}` : `Review due ${niceDate(reviewOn)}` };
}

export function hazardDueItems(rows: { id: number; hazard: string; status: string; reviewOn: string | null }[], today: string): DueItem[] {
  return rows.filter((h) => h.status === "active").map((h) => reviewItem(h.id, h.hazard, h.reviewOn, today)).filter((x): x is DueItem => !!x);
}

export function substanceDueItems(
  rows: { id: number; product: string; status: string; reviewOn: string | null; packCurrent: boolean }[],
  today: string,
): DueItem[] {
  const out: DueItem[] = [];
  for (const s of rows) {
    const r = reviewItem(s.id, s.product, s.reviewOn, today);
    if (r) out.push(r);
    if (s.status === "draft") out.push({ id: s.id, level: "soon", tag: "Draft", name: s.product, detail: "Not assessed yet" });
    else if (!s.packCurrent) out.push({ id: s.id, level: "overdue", tag: "Pack", name: s.product, detail: "The CoSHH pack wasn't made. Open it and save again." });
  }
  return out.sort((a, b) => (a.level === b.level ? 0 : a.level === "overdue" ? -1 : 1));
}
