// Subcontractors and suppliers rules, kept free of the database so they can be tested on their own.
import { daysBetween, dueState, niceDate, type Due } from "../_registers/dates";

export type Kind = "subcontractor" | "supplier";
export const KIND_LABEL: Record<Kind, string> = { subcontractor: "Subcontractor", supplier: "Supplier" };

// Dropdown lists. The office adds more through "+ Add new…"; these are the old hub's starting lists.
export const TRADE_LIST = "companies.trade";
export const DOC_ITEM_LIST = "company_docs.item";

export const DEFAULT_TRADES = [
  "Air conditioning", "Anti-slip surfacing / line marking", "Asbestos removal", "Automatic doors", "Builder", "Building services",
  "Cladding", "Concrete pumping", "Crane / EWP", "Diamond drilling & cutting", "Doors", "Drainage", "Electrical", "Electrician",
  "Engineer", "Environmental services", "Fabrication & welding", "Fire & security", "Fire protection", "Flat roofing", "Gasfitter",
  "General construction", "Glazing", "Haulage", "Height safety / fall protection", "Hygienic wall & ceiling cladding",
  "Insulated panels", "Line marking", "Loading bay equipment", "Locks / security", "Mesh partitioning", "Metal recycling",
  "Pipework", "Plant & tool hire", "Plant hire", "Plant hire / site services", "Plumbing", "Plumbing, heating & gas", "Protection",
  "Protective barriers", "Refrigeration & cooling", "Roller shutters", "Roofer", "Roofing", "Safety barriers", "Scaffolder",
  "Scaffolding", "Security protection", "Security systems", "Specialist contractor", "Structural engineering", "Structural steel",
  "Supplier - Bearings / engineering", "Supplier - Builders merchant", "Supplier - Catering equipment", "Supplier - Concrete",
  "Supplier - Concrete / aggregates", "Supplier - Construction chemicals", "Supplier - Decorating materials", "Supplier - Equipment",
  "Supplier - Fasteners", "Supplier - Fencing", "Supplier - Fixings & tools", "Supplier - Flooring / construction chemicals",
  "Supplier - Insulation & roofing", "Supplier - Joinery", "Supplier - Materials", "Supplier - Paint & coatings", "Supplier - Parts",
  "Supplier - Pest control", "Supplier - Ready-mix concrete", "Supplier - Safety signage", "Supplier - Security doors",
  "Supplier - Signage", "Supplier - Site lighting / supplies", "Supplier - Site supplies", "Supplier - Specialist coatings",
  "Supplier - Steel & fencing", "Supplier - Tools", "Supplier - Welfare / site cabins", "Surveying", "Testing laboratory",
  "Training provider", "Utilities", "Ventilation", "Waste management",
];

export const DEFAULT_DOC_ITEMS = [
  "Public liability insurance", "Employers liability insurance", "Professional indemnity", "Contract works insurance",
  "Motor vehicle insurance", "Goods in transit insurance", "CHAS / Constructionline / SafeContractor", "CSCS cards",
  "Gas Safe / NICEIC registration", "Trade qualification",
];

// Starting list first, then anything the office has added, without repeats (case-insensitive).
export function mergeOptions(defaults: string[], added: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...defaults, ...added]) {
    const k = v.trim().toLowerCase();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(v.trim());
    }
  }
  return out;
}

// Documents: expired is red, within 30 days orange, within 60 days yellow (the old hub's 60-day warning).
export function docState(expiresOn: string | null, today: string): Due {
  return dueState(expiresOn, today, 30, 60);
}

export function docLabel(expiresOn: string | null, today: string): string {
  if (!expiresOn) return "No expiry date";
  const n = daysBetween(today, expiresOn);
  if (n < 0) return `Expired ${niceDate(expiresOn)}`;
  if (n <= 60) return `${n} day${n === 1 ? "" : "s"} left`;
  return `Valid to ${niceDate(expiresOn)}`;
}

export type DocForDue = { id: number; kind: Kind; companyId: number; company: string; item: string; expiresOn: string | null };

// The register's own "due and overdue" list: documents expired or expiring within 60 days.
// It never creates or closes tasks.
export function docDueItems(docs: DocForDue[], today: string) {
  return docs
    .filter((d) => {
      const s = docState(d.expiresOn, today);
      return s === "overdue" || s === "soon" || s === "up";
    })
    .map((d) => ({ ...d, tone: docState(d.expiresOn, today), detail: docLabel(d.expiresOn, today) }))
    .sort((a, b) => (a.expiresOn ?? "").localeCompare(b.expiresOn ?? "") || a.company.localeCompare(b.company));
}
