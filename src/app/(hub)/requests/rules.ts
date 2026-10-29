// Team requests: fixed lists and the starting categories (the office can add more categories).
export const CATEGORY_LIST = "requests.category";
export const DEFAULT_CATEGORIES = ["Tools or equipment", "Tool repair", "PPE or uniform", "Fuel card", "Vehicle issue", "Consumables", "Other"];

export const URGENCIES = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "no_rush", label: "No rush" },
] as const;
export type Urgency = (typeof URGENCIES)[number]["value"];

export const REQUEST_STATUSES = [
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
  { value: "declined", label: "Declined" },
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number]["value"];

export const isOpen = (s: RequestStatus) => s === "new" || s === "in_progress";

// closed_at follows the status: set when a request is done or declined, cleared if it is reopened.
export function closedChange(before: RequestStatus | null, after: RequestStatus): "close" | "reopen" | null {
  const was = before ? !isOpen(before) : false;
  const now = !isOpen(after);
  if (now && !was) return "close";
  if (!now && was) return "reopen";
  return null;
}
