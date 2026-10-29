// Time off rules, kept free of the database so they can be tested on their own.
import { addDays, daysBetween, niceDate } from "../../_registers/dates";
import { BANK_HOLIDAYS, BANK_HOLIDAYS_LAST_YEAR } from "./bank-holidays";

export const KIND_LIST = "time_off.kind";
// The old hub's list; its "Other" is replaced by "+ Add new…" on the dropdown.
export const DEFAULT_KINDS = ["Annual leave", "Sick leave", "Bereavement leave", "Unpaid leave", "Day in lieu"];

export const PART_DAYS = [
  { value: "full", label: "Full days" },
  { value: "morning", label: "Morning only" },
  { value: "afternoon", label: "Afternoon only" },
] as const;
export type PartDay = (typeof PART_DAYS)[number]["value"];

export const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
] as const;
export type Status = (typeof STATUSES)[number]["value"];
export const isWaiting = (s: Status) => s === "pending" || s === "under_review";

export function labelOf(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

const isWeekend = (d: string) => {
  const day = new Date(`${d}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

// Working days off: Monday to Friday, skipping England and Wales bank holidays. A morning or
// afternoon is half a day (single-day requests only). `unlisted` is true when part of the range
// falls after the last year in the stored bank holiday list, so the office should check the count.
export function workingDays(from: string, to: string, part: PartDay = "full"): { days: number; bankHolidays: string[]; unlisted: boolean } {
  if (to < from) return { days: 0, bankHolidays: [], unlisted: false };
  let days = 0;
  const bankHolidays: string[] = [];
  const span = daysBetween(from, to);
  for (let i = 0; i <= span && i < 400; i++) {
    const d = addDays(from, i);
    if (isWeekend(d)) continue;
    if (BANK_HOLIDAYS[d]) {
      bankHolidays.push(d);
      continue;
    }
    days++;
  }
  if (part !== "full" && from === to) days = days > 0 ? 0.5 : 0;
  return { days, bankHolidays, unlisted: Number(to.slice(0, 4)) > BANK_HOLIDAYS_LAST_YEAR };
}

export function datesLabel(r: { fromDate: string; toDate: string; partDay: PartDay }): string {
  if (r.fromDate === r.toDate) return `${niceDate(r.fromDate)}${r.partDay !== "full" ? ` (${labelOf(PART_DAYS, r.partDay).toLowerCase()})` : ""}`;
  return `${niceDate(r.fromDate)} to ${niceDate(r.toDate)}`;
}

export const daysLabel = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)} day${n === 1 ? "" : "s"}`;

// Off on a given day (approved only).
export function offOn(r: { fromDate: string; toDate: string; status: Status }, day: string): boolean {
  return r.status === "approved" && r.fromDate <= day && r.toDate >= day;
}

// Approved time off that overlaps today and the next `ahead` days ("Who's off").
export function whosOff<T extends { fromDate: string; toDate: string; status: Status }>(rows: T[], today: string, ahead = 30): T[] {
  const end = addDays(today, ahead);
  return rows.filter((r) => r.status === "approved" && r.toDate >= today && r.fromDate <= end)
    .sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

// Needs attention: requests waiting for a decision. Overdue when the time off starts within 7 days
// (or has started); the rest are due soon. Nothing is created or closed automatically.
export function waitingItems<T extends { id: number; fromDate: string; status: Status }>(rows: T[], today: string): { row: T; level: "overdue" | "soon" }[] {
  return rows.filter((r) => isWaiting(r.status))
    .map((r) => ({ row: r, level: daysBetween(today, r.fromDate) <= 7 ? ("overdue" as const) : ("soon" as const) }))
    .sort((a, b) => a.row.fromDate.localeCompare(b.row.fromDate));
}
