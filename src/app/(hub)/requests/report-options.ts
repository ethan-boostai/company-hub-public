// What the office can choose for the Team requests report (widths are shares of the page).
export const REQUEST_REPORT_COLUMNS = [
  { key: "category", label: "What for", width: 0.15, default: true },
  { key: "details", label: "Details", width: 0.3, default: true },
  { key: "urgency", label: "Urgency", width: 0.09, default: true },
  { key: "status", label: "Status", width: 0.1, default: true },
  { key: "response", label: "Office response", width: 0.2, default: false },
  { key: "from", label: "From", width: 0.08, default: false },
] as const;

export const REQUEST_REPORT_WHICH = [
  { value: "open", label: "Open requests" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
  { value: "all", label: "All requests" },
] as const;
