import Link from "next/link";

// The Team page's tabs, as filled buttons like live (selected charcoal) (People and companies > Team). Each tab is its own page; Registers fills
// Training and qualifications and Team requests, Core the Team tab and Time off.
export const TEAM_TABS = [
  { key: "team", label: "Team", href: "/people" },
  { key: "training", label: "Training and qualifications", href: "/training" },
  { key: "time-off", label: "Time off", href: "/people/time-off" },
  { key: "requests", label: "Team requests", href: "/requests" },
] as const;
export type TeamTab = (typeof TEAM_TABS)[number]["key"];

export function TeamTabs({ active }: { active: TeamTab }) {
  return (
    <nav aria-label="Team" className="mt-5 flex flex-wrap gap-2.5">
      {TEAM_TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === active ? "page" : undefined}
          className={`inline-flex h-11 items-center rounded-lg border px-4 text-[15px] font-semibold ${t.key === active ? "border-dark bg-dark text-white" : "border-line bg-white text-ink hover:bg-paper"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
