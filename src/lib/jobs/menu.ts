// The left menu inside a job, grouped Plan / Safety / Site / Money and close (as the old hub).
// Locked at Estimate: everything except the job itself, Scope, Programme, Drawings and Pre-con info.
export type JobMenuItem = { slug: string; label: string; phase: number; openAtEstimate?: boolean };

export const JOB_MENU: { group: string; items: JobMenuItem[] }[] = [
  {
    group: "Plan",
    items: [
      { slug: "scope", label: "Scope of works", phase: 4, openAtEstimate: true },
      { slug: "programme", label: "Programme", phase: 4, openAtEstimate: true },
      { slug: "drawings", label: "Drawings", phase: 4, openAtEstimate: true },
      { slug: "pre-con", label: "Pre-con info", phase: 4, openAtEstimate: true },
      { slug: "rfis", label: "RFIs", phase: 4 },
      { slug: "variations", label: "Variations", phase: 4 },
    ],
  },
  {
    group: "Safety",
    items: [
      { slug: "rams", label: "RAMS", phase: 2 },
      { slug: "cphsp", label: "CPHSP", phase: 2 },
      { slug: "permits", label: "Permits", phase: 2 },
      { slug: "pre-starts", label: "Pre-starts", phase: 2 },
      { slug: "inspections", label: "Inspections", phase: 2 },
      { slug: "toolbox-talks", label: "Toolbox talks", phase: 2 },
      { slug: "sign-ons", label: "Sign-ons", phase: 2 },
      { slug: "visitors", label: "Visitors", phase: 2 },
      { slug: "incidents", label: "Incidents", phase: 2 },
      { slug: "coshh", label: "CoSHH", phase: 2 },
    ],
  },
  {
    group: "Site",
    items: [
      { slug: "diary", label: "Daily diary", phase: 3 },
      { slug: "purchase-orders", label: "Purchase orders", phase: 3 },
      { slug: "plant", label: "Plant", phase: 3 },
      { slug: "materials", label: "Materials", phase: 3 },
      { slug: "load-up", label: "Load-up", phase: 3 },
      { slug: "snagging", label: "Snagging", phase: 3 },
    ],
  },
  {
    group: "Money and close",
    items: [
      { slug: "costing", label: "Job costing", phase: 5 },
      { slug: "service-sheets", label: "Service sheets", phase: 5 },
      { slug: "close-out", label: "Close-out", phase: 5 },
    ],
  },
];

export function findMenuItem(slug: string): JobMenuItem | undefined {
  for (const g of JOB_MENU) for (const i of g.items) if (i.slug === slug) return i;
  return undefined;
}
