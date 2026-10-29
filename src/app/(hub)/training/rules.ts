// Team training rules, kept free of the database so they can be tested on their own.
import { daysBetween, niceDate } from "../_registers/dates";

export const QUAL_LIST = "training.qualification";

// The old hub's standard tickets (its "Other" is replaced by "+ Add new…" on the dropdown).
export const STANDARD_QUALS = [
  "CSCS card", "SMSTS", "SSSTS", "First Aid at Work", "Emergency First Aid at Work", "Mental Health First Aid", "Working at height",
  "Harness / fall arrest", "IPAF (MEWP)", "PASMA", "CISRS scaffolding", "Asbestos awareness (UKATA)", "Silica / dust awareness",
  "Confined space", "Manual handling", "Abrasive wheels", "CPCS / NPORS plant", "Forklift (counterbalance)", "Fire marshal",
  "Driving licence (C1 / C)", "PAT testing", "Manufacturer training",
];

// Matrix colours: green valid, amber expires within 60 days, red expired, grey missing.
export type TicketState = "valid" | "expiring" | "expired" | "missing";
export const WARN_DAYS = 60;

export function ticketState(r: { expiresOn: string | null } | null | undefined, today: string): TicketState {
  if (!r) return "missing";
  if (!r.expiresOn) return "valid";
  const n = daysBetween(today, r.expiresOn);
  if (n < 0) return "expired";
  return n <= WARN_DAYS ? "expiring" : "valid";
}

export function ticketLabel(r: { expiresOn: string | null }, today: string): string {
  if (!r.expiresOn) return "No expiry";
  const n = daysBetween(today, r.expiresOn);
  if (n < 0) return `Expired ${niceDate(r.expiresOn)}`;
  if (n <= WARN_DAYS) return n === 0 ? "Expires today" : `Expires ${niceDate(r.expiresOn)} (${n} day${n === 1 ? "" : "s"})`;
  return `Valid to ${niceDate(r.expiresOn)}`;
}

// Matrix cell colours, shared by the screen and the PDF so they match (the old hub's matrix colours).
export const MATRIX_COLOURS: Record<TicketState, { fill: string; text: string; label: string }> = {
  valid: { fill: "#e3f3e8", text: "#1a7f37", label: "Valid" },
  expiring: { fill: "#fff4e0", text: "#8a5a00", label: "Expires within 60 days" },
  expired: { fill: "#fde7e7", text: "#b3261e", label: "Expired" },
  missing: { fill: "#f2f2f0", text: "#6b6e70", label: "Not on file" },
};

// The Chip / StatusBox tone for each state.
export const STATE_TONE = { valid: "ok", expiring: "soon", expired: "overdue", missing: "none" } as const;

export type RecordLike = { id: number; personId: number; qualification: string; expiresOn: string | null };

const key = (personId: number, qual: string) => `${personId}\u0000${qual.trim().toLowerCase()}`;

// The record that counts for each person and ticket (the old matrix's rule): no expiry beats any
// date, then the latest expiry, then the newest record. Older records stay as history.
export function bestRecords<T extends RecordLike>(records: T[]): Map<string, T> {
  const out = new Map<string, T>();
  const rank = (r: T) => r.expiresOn ?? "9999-12-31";
  for (const r of records) {
    const k = key(r.personId, r.qualification);
    const cur = out.get(k);
    if (!cur || rank(r) > rank(cur) || (rank(r) === rank(cur) && r.id > cur.id)) out.set(k, r);
  }
  return out;
}

export function bestFor<T extends RecordLike>(best: Map<string, T>, personId: number, qual: string): T | undefined {
  return best.get(key(personId, qual));
}

// Is this record replaced by a better one for the same person and ticket?
export function isSuperseded<T extends RecordLike>(best: Map<string, T>, r: T): boolean {
  return bestFor(best, r.personId, r.qualification)?.id !== r.id;
}

/* ---------- Matrix ---------- */

export type PersonLike = { id: number; name: string; active: boolean; crew: boolean };
export type PeopleChoice = "active" | "crew";
export type TicketChoice = "on_file" | "standard" | "chosen";

// People on the matrix: everyone active (or only those ticked for the crew list on People),
// plus anyone inactive who still has a ticket on file, so nothing is hidden.
export function matrixPeople<P extends PersonLike>(people: P[], records: RecordLike[], choice: PeopleChoice): P[] {
  const withRecords = new Set(records.map((r) => r.personId));
  return people
    .filter((p) => (choice === "crew" ? p.crew && p.active : p.active || withRecords.has(p.id)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Ticket columns: the standard list in its order, then any others, by the choice made.
export function matrixTickets(records: RecordLike[], choice: TicketChoice, chosen: string[] = []): string[] {
  const onFile = new Map<string, string>();
  for (const r of records) {
    const k = r.qualification.trim().toLowerCase();
    if (!onFile.has(k)) onFile.set(k, r.qualification.trim());
  }
  if (choice === "chosen") return chosen;
  const std = STANDARD_QUALS.filter((q) => choice === "standard" || onFile.has(q.toLowerCase()));
  const stdKeys = new Set(STANDARD_QUALS.map((q) => q.toLowerCase()));
  const others = [...onFile.entries()].filter(([k]) => !stdKeys.has(k)).map(([, v]) => v).sort((a, b) => a.localeCompare(b));
  return [...std, ...others];
}

// What a matrix cell says: the expiry date, "No expiry", "Expired" or a dash.
export function cellText(r: { expiresOn: string | null } | undefined, today: string): string {
  const s = ticketState(r, today);
  if (s === "missing") return "-";
  if (s === "expired") return "Expired";
  return r!.expiresOn ? niceDate(r!.expiresOn) : "No expiry";
}

// The PDF has no cell colours, so each cell says its state in words.
export function pdfCellText(r: { expiresOn: string | null } | undefined, today: string, withDates: boolean): string {
  const s = ticketState(r, today);
  const short = (d: string) => niceDate(d).replace(/ (\d{2})(\d{2})$/, " $2");
  if (s === "missing") return "-";
  if (!r!.expiresOn) return "OK";
  const label = { valid: "OK", expiring: "DUE", expired: "EXPIRED" }[s];
  return withDates ? `${label} ${short(r!.expiresOn)}` : label;
}

/* ---------- Needs attention ---------- */

export type TrainingDue = { id: number; personId: number; person: string; qualification: string; state: TicketState; detail: string; expiresOn: string };

// Tickets expired or expiring within 60 days, counting only the record that counts for each person
// and ticket, and only for active people. It never creates or closes tasks.
export function trainingDueItems<T extends RecordLike>(records: T[], people: PersonLike[], today: string): TrainingDue[] {
  const best = bestRecords(records);
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: TrainingDue[] = [];
  for (const r of best.values()) {
    const p = byId.get(r.personId);
    if (!p?.active) continue;
    const state = ticketState(r, today);
    if (state === "expired" || state === "expiring") {
      out.push({ id: r.id, personId: r.personId, person: p.name, qualification: r.qualification, state, detail: ticketLabel(r, today), expiresOn: r.expiresOn! });
    }
  }
  return out.sort((a, b) => a.expiresOn.localeCompare(b.expiresOn) || a.person.localeCompare(b.person));
}
