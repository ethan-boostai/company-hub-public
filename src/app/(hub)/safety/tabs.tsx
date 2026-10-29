import { PageTabs } from "@/components/shell/page-tabs";

// Health and safety > Hazards and CoSHH: one menu item, two tabs.
const TABS = [
  { key: "hazards", label: "Hazards", href: "/safety/hazards" },
  { key: "coshh", label: "CoSHH", href: "/safety/coshh" },
] as const;

export function SafetyTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return <PageTabs label="Hazards and CoSHH" tabs={TABS} active={active} />;
}
