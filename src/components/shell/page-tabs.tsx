import Link from "next/link";

// Tabs on a page as filled buttons (selected charcoal), each tab its own address. Used by the Team
// page and Hazards and CoSHH.
export function PageTabs({ label, tabs, active }: { label: string; tabs: readonly { key: string; label: string; href: string }[]; active: string }) {
  return (
    <nav aria-label={label} className="mt-5 flex flex-wrap gap-2.5">
      {tabs.map((t) => (
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
