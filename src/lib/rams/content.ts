// RAMS content: what the builder edits and the PDF prints. Pure (no database), shared by the screens,
// the server and the unit tests. Matches the old RAMS builder's sections (cbs-rams-builder.html).
import builtins from "./builtins.json";

export type Codes = string[]; // control hierarchy letters: E S I G A P
export type Step = { id: string; group: "open" | "task" | "close"; task: string; hazards: string; controls: string; il: number; ic: number; rl: number; rc: number; who: string; codes: Codes };
export type RegisterHazard = { key: string; name: string; harm: string; controls: string; il: number; ic: number; rl: number; rc: number; who: string; codes: Codes };
export type Standard = Record<(typeof STANDARD_KEYS)[number], string>;

export type RamsContent = {
  meta: { site: string; taskShort: string; client: string; clientContact: string; startDate: string; duration: string; supervisor: string; responsible: string };
  scope: string;
  steps: Step[];
  register: RegisterHazard[];
  res: { workers: string; subcontractors: string; plant: string; materials: string };
  plantCategories: string[]; // equipment categories ticked (their hazards are suggested)
  coshh: number[]; // CoSHH substances (assessed) used on this job
  ppe: string[];
  ppeExtra: string;
  permits: string[]; // permit, licence and competency keys
  permitExtra: string;
  std: Standard; // emergency, welfare, consultation and review wording
};

export type JobTypeTemplate = {
  activity: string; taskShort: string; scope: string; plant: string; materials: string;
  hazards: string[]; ppe: string[]; permits: string[]; openSteps: number[] | null;
  steps: { task: string; hazards: string; controls: string; il: number; ic: number; rl: number; rc: number; who: string; codes: Codes }[];
};

export const STANDARD_KEYS = ["hospital", "assembly", "emergency", "firstAid", "fire", "welfare", "notifiable", "consultation", "overlap", "monitoring", "review"] as const;
export const STANDARD_LABELS: Record<(typeof STANDARD_KEYS)[number], string> = {
  hospital: "Nearest A&E", assembly: "Assembly point", emergency: "Emergency procedure", firstAid: "First aid", fire: "Fire",
  welfare: "Welfare", notifiable: "Notifiable work", consultation: "Consultation", overlap: "Other trades and overlap",
  monitoring: "Monitoring", review: "Review",
};
export const PPE_LIST: string[] = builtins.ppe;
export const PERMIT_LIST: { key: string; label: string }[] = builtins.permits;
export const OPEN_STEPS = builtins.openSteps;
export const CLOSE_STEPS = builtins.closeSteps;

let n = 0;
export const newId = () => `s${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const scale = (v: unknown, d = 3) => { const x = Math.round(Number(v)); return x >= 1 && x <= 5 ? x : d; };
const text = (v: unknown, max = 4000) => (typeof v === "string" ? v.replace(/\r\n/g, "\n").slice(0, max) : "");
const codes = (v: unknown): Codes => (Array.isArray(v) ? ["E", "S", "I", "G", "A", "P"].filter((c) => v.includes(c)) : []);
const strings = (v: unknown, max = 60, len = 200) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim().slice(0, len)).slice(0, max) : []);

function step(s: Partial<Step>, group: Step["group"]): Step {
  return {
    id: typeof s.id === "string" && /^[a-z0-9]{1,40}$/i.test(s.id) ? s.id : newId(),
    group: s.group === "open" || s.group === "close" || s.group === "task" ? s.group : group,
    task: text(s.task), hazards: text(s.hazards), controls: text(s.controls),
    il: scale(s.il), ic: scale(s.ic), rl: scale(s.rl, 1), rc: scale(s.rc, 2), who: text(s.who, 120), codes: codes(s.codes),
  };
}

export function emptyContent(site = ""): RamsContent {
  return {
    meta: { site, taskShort: "", client: "", clientContact: "", startDate: "", duration: "", supervisor: "", responsible: "" },
    scope: "", steps: [], register: [],
    res: { workers: "", subcontractors: "N/A", plant: "", materials: "" },
    plantCategories: [], coshh: [], ppe: [], ppeExtra: "Task-specific PPE is listed against each step in the method statement.",
    permits: [], permitExtra: "", std: { ...(builtins.standard as Standard) },
  };
}

type LibraryHazard = { ramsKey: string; hazard: string; harm: string; controls: string; likelihood: number | null; consequence: number | null; residualLikelihood: number | null; residualConsequence: number | null; controlCodes: string[] };

export function fromLibrary(h: LibraryHazard): RegisterHazard {
  return { key: h.ramsKey, name: h.hazard, harm: h.harm, controls: h.controls, il: h.likelihood ?? 3, ic: h.consequence ?? 3, rl: h.residualLikelihood ?? 1, rc: h.residualConsequence ?? 2, who: "", codes: codes(h.controlCodes) };
}

// A new RAMS from a job type: the standard opening steps (or the job type's choice of them), its own
// steps, then the closing steps; its hazards from the library; its PPE and permits.
export function fromTemplate(t: Partial<JobTypeTemplate>, library: LibraryHazard[], site = ""): { title: string; content: RamsContent } {
  const c = emptyContent(site);
  const open = OPEN_STEPS.filter((_, i) => !t.openSteps || t.openSteps.includes(i)).map((s) => step({ ...s, group: "open" }, "open"));
  c.steps = [...open, ...(t.steps ?? []).map((s) => step({ ...s, group: "task" }, "task")), ...CLOSE_STEPS.map((s) => step({ ...s, group: "close" }, "close"))];
  c.meta.taskShort = t.taskShort ?? "";
  c.scope = t.scope ?? "";
  c.res.plant = t.plant ?? "";
  c.res.materials = t.materials ?? "";
  c.register = (t.hazards ?? []).map((k) => library.find((h) => h.ramsKey === k)).filter((h): h is LibraryHazard => !!h).map(fromLibrary);
  c.ppe = (t.ppe ?? []).filter((p) => typeof p === "string");
  c.permits = (t.permits ?? []).filter((p) => PERMIT_LIST.some((x) => x.key === p));
  return { title: t.activity ?? "", content: c };
}

// Whatever the browser sends, keep only what a RAMS can hold.
export function normalise(v: unknown): RamsContent {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const base = emptyContent();
  const meta = (o.meta && typeof o.meta === "object" ? o.meta : {}) as Record<string, unknown>;
  const res = (o.res && typeof o.res === "object" ? o.res : {}) as Record<string, unknown>;
  const std = (o.std && typeof o.std === "object" ? o.std : {}) as Record<string, unknown>;
  return {
    meta: Object.fromEntries(Object.keys(base.meta).map((k) => [k, text(meta[k], 300)])) as RamsContent["meta"],
    scope: text(o.scope, 8000),
    steps: (Array.isArray(o.steps) ? o.steps : []).slice(0, 200).map((s) => step((s ?? {}) as Partial<Step>, "task")),
    register: (Array.isArray(o.register) ? o.register : []).slice(0, 200).map((h0) => {
      const h = (h0 ?? {}) as Partial<RegisterHazard>;
      return { key: text(h.key, 60), name: text(h.name, 200), harm: text(h.harm), controls: text(h.controls), il: scale(h.il), ic: scale(h.ic), rl: scale(h.rl, 1), rc: scale(h.rc, 2), who: text(h.who, 120), codes: codes(h.codes) };
    }).filter((h) => h.name.trim()),
    res: Object.fromEntries(Object.keys(base.res).map((k) => [k, text(res[k], 4000)])) as RamsContent["res"],
    plantCategories: strings(o.plantCategories),
    coshh: (Array.isArray(o.coshh) ? o.coshh : []).map(Number).filter((x) => Number.isInteger(x) && x > 0).slice(0, 100),
    ppe: strings(o.ppe, 40, 120),
    ppeExtra: text(o.ppeExtra, 2000),
    permits: strings(o.permits, 40, 60).filter((k) => PERMIT_LIST.some((p) => p.key === k)),
    permitExtra: text(o.permitExtra, 2000),
    std: Object.fromEntries(STANDARD_KEYS.map((k) => [k, k in std ? text(std[k], 4000) : base.std[k]])) as Standard,
  };
}

// What a RAMS needs before it can be issued.
export function missingForIssue(r: { title: string; preparedById: number | null; approvedById: number | null; content: RamsContent }): string[] {
  const out: string[] = [];
  if (!r.title.trim()) out.push("the activity");
  if (!r.content.scope.trim()) out.push("the description of works");
  if (!r.content.steps.some((s) => s.group === "task" && s.task.trim())) out.push("at least one task step in the method statement");
  if (!r.content.register.length) out.push("at least one hazard in the hazard register");
  if (!r.preparedById) out.push("prepared by");
  if (!r.approvedById) out.push("approved by");
  return out;
}

export const ramsNo = (jobNo: string, seq: number) => `${jobNo}-${seq}`;
export const ramsFileName = (jobNo: string, seq: number, revision: number, title: string) =>
  `Job ${jobNo} - RAMS ${ramsNo(jobNo, seq)} rev ${revision} - ${title.replace(/[\\/:*?"<>|#%]/g, "").trim().slice(0, 80)}.pdf`;

// Hazards in this RAMS changed in the library since it was issued (the RAMS may need a new revision).
export function changedSinceIssue(register: RegisterHazard[], library: { ramsKey: string; hazard: string; updatedAt: string | null }[], issuedAt: string | null): string[] {
  if (!issuedAt) return [];
  const keys = new Set(register.map((h) => h.key).filter(Boolean));
  return library.filter((h) => keys.has(h.ramsKey) && h.updatedAt && h.updatedAt > issuedAt).map((h) => h.hazard);
}

// A RAMS (or the job type editor) back to a job type: its own task steps, library hazards, PPE and
// permits. The standard opening and closing steps are added to each new RAMS, so aren't kept.
export function toTemplate(title: string, c: RamsContent, openSteps: number[] | null = null): JobTypeTemplate {
  return {
    activity: title, taskShort: c.meta.taskShort, scope: c.scope, plant: c.res.plant, materials: c.res.materials,
    hazards: Array.from(new Set(c.register.map((h) => h.key).filter(Boolean))), ppe: c.ppe, permits: c.permits, openSteps,
    steps: c.steps.filter((s) => s.group === "task").map(({ task, hazards, controls, il, ic, rl, rc, who, codes }) => ({ task, hazards, controls, il, ic, rl, rc, who, codes })),
  };
}
