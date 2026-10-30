// Load-up sheet rules, kept free of the database so they can be tested on their own.
import { daysBetween, niceDate } from "../_registers/dates";

export const PPE = ["Safety boots", "Hi-vis", "Gloves", "Safety glasses", "Hearing protection", "P2/P3 respirator", "Harness", "Hard hat", "Coveralls"];
export const DEFAULT_PPE = PPE.slice(0, 4);

export type SheetStatus = "draft" | "ready" | "loaded";
export const STATUS_LABELS: Record<SheetStatus, string> = { draft: "Draft", ready: "Ready to load", loaded: "Loaded" };

export type LineKind = "equipment" | "material" | "custom_equipment" | "custom_material" | "buy";
export const KIND_LABELS: Record<LineKind, string> = {
  equipment: "Equipment", material: "Material", custom_equipment: "Equipment (not on the register)",
  custom_material: "Material (not from stock)", buy: "Buy on the way",
};
export const isEquipment = (k: LineKind) => k === "equipment" || k === "custom_equipment";

export type Outcome = "loaded" | "part" | "not_loaded";
export const OUTCOME_LABELS: Record<Outcome, string> = { loaded: "Loaded", part: "Part loaded", not_loaded: "Not loaded" };

export type Reason = "out_of_stock" | "faulty" | "cant_find" | "not_needed" | "couldnt_buy";
export const REASONS: { value: Reason; label: string }[] = [
  { value: "out_of_stock", label: "Out of stock" },
  { value: "faulty", label: "Faulty" },
  { value: "cant_find", label: "Can't find it" },
  { value: "not_needed", label: "Not needed" },
  { value: "couldnt_buy", label: "Couldn't buy it" },
];
// "Couldn't buy it" is only for things bought on the way; the rest for anything else.
export const reasonsFor = (k: LineKind) => REASONS.filter((r) => (k === "buy" ? r.value === "couldnt_buy" || r.value === "not_needed" : r.value !== "couldnt_buy"));
export const reasonLabel = (r: string | null) => REASONS.find((x) => x.value === r)?.label ?? "";

// What the office and crew see: Draft, Ready to load, Overdue (ready and the day has passed), Loaded.
export type SheetState = "draft" | "ready" | "overdue" | "loaded";
export const STATE_LABELS: Record<SheetState, string> = { draft: "Draft", ready: "Ready to load", overdue: "Overdue", loaded: "Loaded" };
export const STATE_TONES: Record<SheetState, "grey" | "blue" | "red" | "green"> = { draft: "grey", ready: "blue", overdue: "red", loaded: "green" };
export function sheetState(s: { status: SheetStatus; sheetDate: string }, today: string): SheetState {
  if (s.status === "loaded") return "loaded";
  if (s.status === "ready") return s.sheetDate < today ? "overdue" : "ready";
  return "draft";
}

// Needs attention on the job's Load-up page.
export function loadUpAttention<T extends { id: number; status: SheetStatus; sheetDate: string; problemsOpen: boolean }>(sheets: T[], today: string):
  { sheet: T; level: "overdue" | "soon"; tag: string; detail: string }[] {
  const out: { sheet: T; level: "overdue" | "soon"; tag: string; detail: string }[] = [];
  for (const s of sheets) {
    if (s.problemsOpen) out.push({ sheet: s, level: "overdue", tag: "Problems", detail: "Problems reported at loading" });
    if (s.status === "ready" && s.sheetDate < today) out.push({ sheet: s, level: "overdue", tag: "Not loaded", detail: `Was for ${niceDate(s.sheetDate)}` });
    if (s.status === "draft" && daysBetween(today, s.sheetDate) <= 2) {
      out.push({ sheet: s, level: s.sheetDate < today ? "overdue" : "soon", tag: "Not sent to crew", detail: `For ${niceDate(s.sheetDate)}` });
    }
  }
  return out;
}

// One line's result at loading: fully loaded, part loaded or not loaded. Quantities matter for
// materials only; equipment and custom lines are ticked or not.
export function outcomeOf(line: { kind: LineKind; qty: number | null }, ticked: boolean, loadedQty: number | null): Outcome {
  if (!ticked) return "not_loaded";
  const hasQty = line.kind === "material" || line.kind === "custom_material" || line.kind === "buy";
  if (!hasQty || line.qty == null || loadedQty == null) return "loaded";
  if (loadedQty <= 0) return "not_loaded";
  return loadedQty < line.qty ? "part" : "loaded";
}

// The dated problem lines added to a sheet: "30/10/2026 14:48 Name (when loading): Can't find it: Breaker (note)".
export function problemLines(
  results: { name: string; outcome: Outcome; reason: string | null; note: string | null; loadedQty: number | null; qty: number | null; unit: string | null }[],
  extra: string | null,
  stamp: string,
  by: string,
  when: "when loading" | "reported",
): string[] {
  const out: string[] = [];
  for (const r of results) {
    if (r.outcome === "loaded") continue;
    const what = r.outcome === "part" ? `${r.name} (${r.loadedQty} of ${r.qty}${r.unit ? ` ${r.unit}` : ""} loaded)` : r.name;
    out.push(`${stamp} ${by} (${when}): ${reasonLabel(r.reason) || "Not loaded"}: ${what}${r.note ? ` - ${r.note}` : ""}`);
  }
  if (extra) out.push(`${stamp} ${by} (${when}): ${extra}`);
  return out;
}

// SharePoint file name for the sheet's PDF.
export function loadUpFileName(s: { id: number; sheetDate: string; jobNo: string }): string {
  return `${s.sheetDate} - Job ${s.jobNo} - Load-up sheet ${s.id}.pdf`;
}

export const loadUpFolder = (jobNo: string) => `CBS System/Operations/Jobs/Job ${jobNo}/Load-up sheets`;
