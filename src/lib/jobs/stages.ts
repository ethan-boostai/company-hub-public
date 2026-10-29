// Hub stage names and colours, used everywhere (never the ServiceM8 names).
export type Stage = "estimate" | "approved" | "completed" | "unsuccessful";

export const STAGES: Record<Stage, { label: string; sm8: string; chip: string; dot: string }> = {
  estimate: { label: "Estimate", sm8: "Quote", chip: "bg-[#fdf0d8] text-[#8a5a00]", dot: "bg-[#f2a900]" },
  approved: { label: "Approved", sm8: "Work Order", chip: "bg-[#e6f3ea] text-[#1e6b34]", dot: "bg-[#1a7f37]" },
  completed: { label: "Completed", sm8: "Completed", chip: "bg-[#e3edf9] text-[#1f4e8c]", dot: "bg-[#1f4e8c]" },
  unsuccessful: { label: "Unsuccessful", sm8: "Unsuccessful", chip: "bg-[#fbe2df] text-[#b3261e]", dot: "bg-[#d93025]" },
};
export const STAGE_ORDER: Stage[] = ["estimate", "approved", "completed", "unsuccessful"];

export function stageOf(value: string | null | undefined): Stage {
  return value && value in STAGES ? (value as Stage) : "estimate";
}

// Folders a Work Order is kept in (and put back into if it drops out): Approved, Part Approved,
// Reactive, Maintenance. Same rule as the database function sm8_kept_folder.
export function isKeptFolder(name: string): boolean {
  return /^(approved|part approved)|reactive|maint/i.test(name.trim());
}

// Folders shown on the Jobs list until the user chooses: Enquiry, Reactive, Maintenance and Approved.
export function shownByDefault(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.startsWith("enquir") || n.startsWith("reactive") || n.startsWith("maint") || (n.startsWith("approved"));
}

// Job title: first line of the ServiceM8 description.
export function jobTitle(description: string | null | undefined): string {
  const first = String(description || "").split(/\r?\n/).map((l) => l.trim()).find(Boolean);
  return first || "(no description)";
}
