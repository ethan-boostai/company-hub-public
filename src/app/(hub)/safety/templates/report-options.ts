// Templates > Reports ▾ > Create report: which job types and what to show for each.
export const TEMPLATE_REPORT_WHICH = [
  { value: "active", label: "In use" },
  { value: "retired", label: "Retired" },
  { value: "all", label: "All job types" },
] as const;

export const TEMPLATE_REPORT_COLUMNS = [
  { key: "steps", label: "Number of steps", width: 0.14, default: true },
  { key: "hazards", label: "Number of hazards", width: 0.14, default: true },
  { key: "used", label: "RAMS made", width: 0.12, default: true },
  { key: "status", label: "Status", width: 0.12, default: true },
] as const;

export const TEMPLATE_REPORT_DETAIL = [
  { key: "steplist", label: "List each job type's steps" },
  { key: "ppe", label: "List PPE and permits" },
] as const;
