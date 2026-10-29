import { PageTabs } from "./page-tabs";

// The Team page's tabs (People and companies > Team). Each tab is its own page; Registers fills
// Training and qualifications and Team requests, Core the Team tab and Time off.
export const TEAM_TABS = [
  { key: "team", label: "Team", href: "/people" },
  { key: "training", label: "Training and qualifications", href: "/training" },
  { key: "time-off", label: "Time off", href: "/people/time-off" },
  { key: "requests", label: "Team requests", href: "/requests" },
] as const;
export type TeamTab = (typeof TEAM_TABS)[number]["key"];

export function TeamTabs({ active }: { active: TeamTab }) {
  return <PageTabs label="Team" tabs={TEAM_TABS} active={active} />;
}
