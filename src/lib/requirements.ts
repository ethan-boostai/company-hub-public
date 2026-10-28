// Built-in requirement types (defined in code; they open a builder or page as each phase lands).
// The office adds simple custom types (a plain task with a stage) in Settings > Requirement types.
// Source: the old Job File's list (docs/inventory.md), with enquiry/job duplicates merged into one key.

export type ReqStage = "estimate" | "approved_planning" | "approved_onsite" | "completed";
export type Side = "office" | "site";

export const REQ_STAGES: { key: ReqStage; label: string; hint: string }[] = [
  { key: "estimate", label: "Estimate", hint: "To price the job" },
  { key: "approved_planning", label: "Approved: Planning", hint: "Ready to mobilise" },
  { key: "approved_onsite", label: "Approved: on site", hint: "Every day or on a schedule" },
  { key: "completed", label: "Completed", hint: "To close the job" },
];

export type Requirement = {
  key: string;
  label: string;
  stage: ReqStage;
  side: Side;
  category: string;          // automatic task category
  folder?: string;           // SharePoint subfolder under Jobs/Job N (else Tasks)
  cdm?: boolean;             // CDM jobs only
  hidden?: boolean;          // not offered in + New task (always on, or added on a schedule)
  phase?: number;            // phase that builds its page (until then it's a plain task)
};

export const REQUIREMENTS: Requirement[] = [
  { key: "survey", label: "Site survey", stage: "estimate", side: "site", category: "Survey", folder: "Surveys", phase: 4 },
  { key: "pci", label: "Pre-construction information", stage: "estimate", side: "office", category: "H&S", folder: "CDM", phase: 4 },
  { key: "rfis", label: "RFIs (info from client)", stage: "estimate", side: "office", category: "Client", folder: "RFIs", phase: 4 },
  { key: "docs", label: "Documentation (we supply)", stage: "estimate", side: "office", category: "Paperwork", folder: "Documents" },
  { key: "supplier_quotes", label: "Supplier quotes", stage: "estimate", side: "office", category: "Procurement", folder: "Quotes" },
  { key: "sub_quotes", label: "Subcontractor quotes", stage: "estimate", side: "office", category: "Procurement", folder: "Quotes" },
  { key: "estimate", label: "Estimate", stage: "estimate", side: "office", category: "Paperwork", folder: "Estimate" },
  { key: "programme", label: "Programme", stage: "estimate", side: "office", category: "Paperwork", folder: "Programme", phase: 4 },

  { key: "client_po", label: "Client PO", stage: "approved_planning", side: "office", category: "Client" },
  { key: "scope", label: "Scope of works", stage: "approved_planning", side: "office", category: "Paperwork", phase: 4 },
  { key: "extra_survey", label: "Additional surveys", stage: "approved_planning", side: "site", category: "Survey", folder: "Surveys", phase: 4 },
  { key: "cphsp", label: "Construction phase plan", stage: "approved_planning", side: "office", category: "H&S", folder: "CDM", cdm: true, phase: 2 },
  { key: "rams", label: "CBS RAMS", stage: "approved_planning", side: "office", category: "H&S", folder: "RAMS", phase: 2 },
  { key: "sub_rams", label: "Subcontractor RAMS", stage: "approved_planning", side: "office", category: "Paperwork", folder: "RAMS", phase: 2 },
  { key: "coshh", label: "CoSHH", stage: "approved_planning", side: "office", category: "H&S", phase: 2 },
  { key: "supplier_pos", label: "Supplier POs", stage: "approved_planning", side: "office", category: "Procurement", folder: "Purchase orders", phase: 3 },
  { key: "sub_pos", label: "Subcontractor POs", stage: "approved_planning", side: "office", category: "Procurement", folder: "Purchase orders", phase: 3 },
  { key: "hire", label: "Hire plant", stage: "approved_planning", side: "office", category: "Procurement", folder: "Purchase orders", phase: 3 },
  { key: "loadup", label: "Load-up (plant & materials)", stage: "approved_planning", side: "office", category: "Procurement", phase: 3 },
  { key: "reactive_estimate", label: "Reactive Estimate", stage: "approved_planning", side: "office", category: "Paperwork" },
  { key: "order_materials", label: "Order Materials", stage: "approved_planning", side: "office", category: "Procurement" },

  { key: "meetings", label: "Site meetings", stage: "approved_onsite", side: "office", category: "H&S", phase: 2 },
  { key: "permits", label: "Permits to work", stage: "approved_onsite", side: "site", category: "H&S", folder: "Permits", cdm: true, phase: 2 },
  { key: "inductions", label: "Site inductions", stage: "approved_onsite", side: "office", category: "H&S", folder: "Inductions", cdm: true, phase: 2 },
  { key: "preuse", label: "Plant pre-use checks", stage: "approved_onsite", side: "site", category: "H&S", phase: 3 },
  { key: "sub_audit", label: "Subcontractor H&S audit", stage: "approved_onsite", side: "site", category: "H&S", phase: 3 },
  { key: "diary", label: "Daily diary", stage: "approved_onsite", side: "office", category: "Paperwork", cdm: true, phase: 3 },
  { key: "visitors", label: "Visitors log", stage: "approved_onsite", side: "office", category: "H&S", cdm: true, phase: 2 },
  { key: "toolbox", label: "Toolbox talks", stage: "approved_onsite", side: "office", category: "H&S", folder: "Toolbox talks", hidden: true, phase: 2 },
  { key: "inspections", label: "Inspections", stage: "approved_onsite", side: "office", category: "H&S", folder: "Inspections", hidden: true, phase: 2 },
  { key: "site_inspection", label: "Site inspection", stage: "approved_onsite", side: "site", category: "H&S", folder: "Inspections", hidden: true, phase: 2 },
  { key: "prestart", label: "Daily pre-start", stage: "approved_onsite", side: "site", category: "H&S", hidden: true, phase: 2 },

  { key: "snagging", label: "Snagging", stage: "completed", side: "office", category: "Snag", phase: 3 },
  { key: "costing", label: "Job costing", stage: "completed", side: "office", category: "Office", phase: 5 },
  { key: "service_sheet", label: "Service sheet", stage: "completed", side: "office", category: "Office", phase: 5 },
  { key: "closeout", label: "Close-out", stage: "completed", side: "office", category: "Office", phase: 5 },
];

const BY_KEY = new Map(REQUIREMENTS.map((r) => [r.key, r]));
export function builtIn(key: string): Requirement | undefined {
  return BY_KEY.get(key);
}

// Custom types are stored as 'custom:<id>'.
export function customKey(id: number): string {
  return `custom:${id}`;
}
export function customId(key: string | null | undefined): number | null {
  const m = /^custom:(\d+)$/.exec(key || "");
  return m ? Number(m[1]) : null;
}

// Why a requirement can't be added to this job yet, or null if it can.
export function lockReason(r: { stage: ReqStage; cdm?: boolean; key?: string; label: string }, job: { stage: string; jobType: string }): string | null {
  if (job.stage === "estimate" && r.stage !== "estimate") return `${r.label} unlocks once the job is Approved.`;
  if (r.cdm && job.jobType !== "cdm") return `${r.label} is for CDM jobs. Switch the job to CDM first.`;
  return null;
}

// Task category: the requirement's group, Office/Site for custom types, Office for one-off tasks.
export function taskCategory(reqKey: string | null | undefined, side: Side = "office"): string {
  if (!reqKey) return "Office";
  const r = builtIn(reqKey);
  if (r) return r.category;
  return side === "site" ? "Site" : "Office";
}

// SharePoint folder for a task's uploads: CBS System/Operations/Jobs/Job N/<folder>.
export function taskFolder(jobNo: string, reqKey: string | null | undefined): string {
  const r = reqKey ? builtIn(reqKey) : undefined;
  return `CBS System/Operations/Jobs/Job ${jobNo}/${r?.folder || "Tasks"}`;
}
