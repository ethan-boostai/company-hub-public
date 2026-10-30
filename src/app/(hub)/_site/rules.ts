// Site rules (plant and materials on a job), kept free of the database so they can be tested on their own.
import { daysBetween, niceDate } from "../_registers/dates";

/* ---------- Plant on a job ---------- */

export type PlantState = "on_job" | "due_soon" | "overdue" | "returned";
export const PLANT_STATE_LABELS: Record<PlantState, string> = { on_job: "On job", due_soon: "Due back soon", overdue: "Overdue", returned: "Returned" };
export const PLANT_STATE_TONES: Record<PlantState, "green" | "amber" | "red" | "grey"> = { on_job: "green", due_soon: "amber", overdue: "red", returned: "grey" };

// Due back within 2 days is "soon"; after the due back date it's overdue. Returned is returned.
export function plantState(b: { dueBack: string | null; returnedAt: string | null }, today: string): PlantState {
  if (b.returnedAt) return "returned";
  if (!b.dueBack) return "on_job";
  const d = daysBetween(today, b.dueBack);
  if (d < 0) return "overdue";
  return d <= 2 ? "due_soon" : "on_job";
}

export function dueBackLabel(dueBack: string | null, today: string): string {
  if (!dueBack) return "";
  const d = daysBetween(today, dueBack);
  if (d < 0) return `Was due back ${niceDate(dueBack)}`;
  if (d === 0) return "Due back today";
  return `Due back ${niceDate(dueBack)}`;
}

// Things to sort out before an item goes out (shown, never blocking): status, service and PAT test.
export function assetWarnings(a: { status: string; nextServiceOn: string | null; testTagDue: string | null }, today: string): string[] {
  const out: string[] = [];
  if (a.status === "needs_repair") out.push("Needs repair");
  if (a.status === "out_for_service") out.push("Out for service");
  if (a.nextServiceOn && a.nextServiceOn < today) out.push("Service overdue");
  if (a.testTagDue && a.testTagDue < today) out.push("PAT test overdue");
  return out;
}

// Equipment that can't be booked out at all.
export const UNBOOKABLE_STATUSES = ["lost", "retired"];

/* ---------- Materials on a job ---------- */

export type JobMove = { materialId: number | null; name: string; unit: string; cost: number | null; change: number; inMove: boolean };
export type MaterialTotal = { materialId: number | null; name: string; unit: string; taken: number; returned: number; used: number; value: number | null };

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Per material: taken for the job (stock down), returned (stock up), used = taken - returned, and its
// value at register cost. Moves between two locations that only mention the job (inMove) don't count.
export function materialTotals(moves: JobMove[]): MaterialTotal[] {
  const by = new Map<string, MaterialTotal>();
  for (const m of moves) {
    if (m.inMove || !m.change) continue;
    const key = m.materialId ? `m${m.materialId}` : `n${m.name.toLowerCase()}|${m.unit.toLowerCase()}`;
    const t = by.get(key) ?? { materialId: m.materialId, name: m.name, unit: m.unit, taken: 0, returned: 0, used: 0, value: m.cost == null ? null : 0 };
    if (m.change < 0) t.taken = r3(t.taken - m.change);
    else t.returned = r3(t.returned + m.change);
    t.used = r3(t.taken - t.returned);
    t.value = m.cost == null ? null : Math.round(t.used * m.cost * 100) / 100;
    by.set(key, t);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name));
}
