// Columns the office can choose for the subcontractors and suppliers report (widths are shares of the page).
export const REPORT_COLUMNS = [
  { key: "type", label: "Type", width: 0.16, default: true },
  { key: "trade", label: "Trade", width: 0.18, default: true },
  { key: "contact", label: "Contact", width: 0.12, default: true },
  { key: "phone", label: "Phone", width: 0.13, default: true },
  { key: "email", label: "Email", width: 0.2, default: false },
  { key: "approved", label: "Approved / inducted", width: 0.12, default: true },
  { key: "documents", label: "Documents", width: 0.12, default: true },
] as const;
