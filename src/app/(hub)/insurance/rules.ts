// Insurance and accreditations rules, kept free of the database so they can be tested on their own.
import { addDays, addMonths, daysBetween, dueState, niceDate, type Due } from "../_registers/dates";

// Dropdown lists. The office adds more through "+ Add new…"; these are the old hub's starting lists.
export const POLICY_TYPE_LIST = "insurance.type";
export const COVER_LIST = "insurance.cover";
export const CLAIM_TYPE_LIST = "claims.type";
export const CERT_LIST = "company_certs.name";

export const DEFAULT_POLICY_TYPES = [
  "Public liability", "Employers liability", "Motor vehicle", "Contract works", "Professional indemnity", "Tools and plant",
  "Goods in transit", "Material damage", "Business interruption",
];
export const DEFAULT_COVERS = [
  "Public liability", "Employer's liability", "Professional indemnity", "Contract works", "Motor vehicle / fleet", "Tools and plant",
  "Material damage", "Business interruption", "Goods in transit", "Cyber", "Directors and officers",
];
export const DEFAULT_CLAIM_TYPES = [
  "Vehicle", "Equipment", "Job site / property damage", "Public liability", "Small claim against us", "Debt recovery (client not paying)", "Employment",
];
export const DEFAULT_CERTS = [
  "CHAS", "Constructionline Silver", "Constructionline Gold", "SafeContractor", "SMAS Worksafe", "Acclaim Accreditation", "Avetta",
  "Builders Profile", "ISO 9001", "ISO 14001", "ISO 45001", "FMB", "TrustMark", "NICEIC", "Gas Safe Register", "Citation", "Waste Carriers Licence",
];

export const DIRECTIONS = [
  { value: "by_us", label: "By us" },
  { value: "against_us", label: "Against us" },
] as const;
export type Direction = (typeof DIRECTIONS)[number]["value"];

export const CLAIM_STATUSES = [
  { value: "open", label: "Open" },
  { value: "lodged", label: "Lodged" },
  { value: "assessing", label: "Assessing" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
  { value: "settled", label: "Settled" },
  { value: "closed", label: "Closed" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number]["value"];
// The old hub's closed statuses: a claim in one of these is finished and needs nothing more.
export const CLOSED_STATUSES: readonly ClaimStatus[] = ["settled", "closed", "withdrawn", "declined"];
export const isClosed = (s: ClaimStatus) => CLOSED_STATUSES.includes(s);

export function labelOf(list: readonly { value: string; label: string }[], value: string): string {
  return list.find((o) => o.value === value)?.label ?? value;
}

// Closed on: set to today when a claim is closed without a date, cleared when it is reopened.
export function closedOnFor(status: ClaimStatus, given: string | null, today: string): string | null {
  if (!isClosed(status)) return null;
  return given ?? today;
}

/* ---------- Expiry ---------- */

// Policies and accreditations: expired is red, within 30 days orange, within 60 days yellow
// (the old hub's 60-day warning).
export function expiryState(expiresOn: string | null, today: string): Due {
  return dueState(expiresOn, today, 30, 60);
}

export function expiryLabel(expiresOn: string | null, today: string): string {
  if (!expiresOn) return "No expiry date";
  const n = daysBetween(today, expiresOn);
  if (n < 0) return `Expired ${niceDate(expiresOn)}`;
  if (n <= 60) return n === 0 ? "Expires today" : `${n} day${n === 1 ? "" : "s"} left`;
  return `Valid to ${niceDate(expiresOn)}`;
}

// A claim's next action: overdue red, due within 7 days orange.
export function actionState(due: string | null, today: string): Due {
  if (!due) return "none";
  const s = dueState(due, today, 7, 7);
  return s === "up" || s === "ok" ? "none" : s;
}

export const policyTitle = (p: { policyType: string; name: string }) => (p.name ? `${p.policyType} - ${p.name}` : p.policyType);

// A new period from the one it renews: the day after it ends, for a year.
export function renewalDates(p: { startsOn: string | null; expiresOn: string | null }, today: string): { startsOn: string; expiresOn: string } {
  const startsOn = p.expiresOn ? addDays(p.expiresOn, 1) : today;
  return { startsOn, expiresOn: addDays(addMonths(startsOn, 12), -1) };
}

// "£1,250,000" / "£250.50"
export function money(v: number | null): string {
  if (v == null) return "";
  return `£${v.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/* ---------- Needs attention ---------- */

export type AttentionItem = {
  key: string;
  what: string;
  name: string;
  detail: string;
  tone: Due;
  open: { kind: "policy" | "claim" | "cert"; id: number };
};

// The register's own "needs attention" list. It never creates or closes tasks.
// - Policies (the current period only) and accreditations expired or expiring within 60 days.
// - Every open claim (one per claim, as the old Actions board did), with its next action.
export function attentionItems(
  policies: { id: number; policyType: string; name: string; expiresOn: string | null; renewedById: number | null }[],
  claims: { id: number; claimNo: string; claimType: string; status: ClaimStatus; nextAction: string; nextActionDue: string | null }[],
  certs: { id: number; name: string; expiresOn: string | null }[],
  today: string,
): AttentionItem[] {
  const out: AttentionItem[] = [];
  const expiring = (s: Due) => s === "overdue" || s === "soon" || s === "up";
  for (const p of policies) {
    if (p.renewedById) continue;
    const tone = expiryState(p.expiresOn, today);
    if (expiring(tone)) out.push({ key: `p${p.id}`, what: "Policy", name: policyTitle(p), detail: expiryLabel(p.expiresOn, today), tone, open: { kind: "policy", id: p.id } });
  }
  for (const c of certs) {
    const tone = expiryState(c.expiresOn, today);
    if (expiring(tone)) out.push({ key: `a${c.id}`, what: "Accreditation", name: c.name, detail: expiryLabel(c.expiresOn, today), tone, open: { kind: "cert", id: c.id } });
  }
  for (const c of claims) {
    if (isClosed(c.status)) continue;
    const tone = actionState(c.nextActionDue, today);
    const next = c.nextAction || c.nextActionDue
      ? `Next: ${[c.nextAction, c.nextActionDue ? `by ${niceDate(c.nextActionDue)}` : ""].filter(Boolean).join(" ")}`
      : "No next action set";
    out.push({
      key: `c${c.id}`, what: "Open claim", name: `${c.claimNo} ${c.claimType}`, detail: `${labelOf(CLAIM_STATUSES, c.status)} · ${next}`,
      tone: tone === "none" ? "up" : tone, open: { kind: "claim", id: c.id },
    });
  }
  const rank = (t: Due) => ({ overdue: 0, soon: 1, up: 2, ok: 3, none: 4 })[t];
  return out.sort((a, b) => rank(a.tone) - rank(b.tone) || a.name.localeCompare(b.name));
}
