import Link from "next/link";

// The Team page's tabs (People and companies > Team). Each tab is its own page; Registers fills
// Training and qualifications and Team requests, Core the Team tab and Time off.
export const TEAM_TABS = [
  { key: "team", label: "Team", href: "/people" },
  { key: "training", label: "Training and qualifications", href: "/people/training" },
  { key: "time-off", label: "Time off", href: "/people/time-off" },
  { key: "requests", label: "Team requests", href: "/requests" },
] as const;
export type TeamTab = (typeof TEAM_TABS)[number]["key"];

export function TeamTabs({ active }: { active: TeamTab }) {
  return (
    <nav aria-label="Team" className="mt-4 flex flex-wrap gap-1 border-b border-line">
      {TEAM_TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${t.key === active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
