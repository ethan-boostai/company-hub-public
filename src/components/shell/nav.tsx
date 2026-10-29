"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

// Main left menu, grouped as in the live hub. Only pages that exist so far are listed; a group with
// no pages yet (Purchasing, Health and safety, Compliance, Settings) is left out until it has one.
type Item = { href: string; label: string; icon: keyof typeof ICONS; count?: "actions" };
type Group = { group?: string; items: Item[]; bottom?: boolean };

export const NAV: Group[] = [
  {
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/actions", label: "Actions", icon: "actions", count: "actions" },
      { href: "/jobs", label: "Jobs", icon: "jobs" },
    ],
  },
  { group: "Purchasing", items: [] },
  { group: "Health and safety", items: [] },
  {
    group: "Assets",
    items: [
      { href: "/fleet", label: "Fleet", icon: "van" },
      { href: "/equipment", label: "Equipment and materials", icon: "tools" },
    ],
  },
  {
    group: "People and companies",
    items: [
      { href: "/people", label: "Team", icon: "team" },
      { href: "/subcontractors", label: "Subcontractors and suppliers", icon: "company" },
    ],
  },
  { group: "Compliance", items: [] },
  { group: "Settings", items: [], bottom: true },
];

// Pages that belong to a menu item without sitting under its address (Team requests is a Team tab).
const ALSO: Record<string, string[]> = { "/people": ["/requests"] };

const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  actions: <><rect x="3" y="4" width="5" height="16" rx="1" /><rect x="10" y="4" width="5" height="10" rx="1" /><rect x="17" y="4" width="4" height="13" rx="1" /></>,
  jobs: <><path d="M3 7h18v13H3z" /><path d="M8 7V4h8v3" /></>,
  van: <><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>,
  tools: <path d="M14.5 6.5a4 4 0 0 0-5 5L4 17l3 3 5.5-5.5a4 4 0 0 0 5-5l-2.5 2.5-2.5-.5-.5-2.5z" />,
  team: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.2a5 5 0 0 1 5 5.8" /></>,
  company: <><path d="M4 21V5l8-2v18M12 9h8v12" /><path d="M7 8h2M7 12h2M7 16h2M15 13h2M15 17h2" /></>,
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] shrink-0 fill-none stroke-current" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

// The highlighted item depends on the address, which is only known per request (e.g. /jobs/12),
// so the links first render without a highlight and pick it up when the request arrives.
// `actionsBadge` is the red count on Actions, streamed in by the server (src/components/shell/actions-badge.tsx).
export function NavLinks({ onNavigate, actionsBadge }: { onNavigate?: () => void; actionsBadge?: ReactNode }) {
  return (
    <Suspense fallback={<Links path="" onNavigate={onNavigate} actionsBadge={actionsBadge} />}>
      <LiveLinks onNavigate={onNavigate} actionsBadge={actionsBadge} />
    </Suspense>
  );
}

function LiveLinks(props: { onNavigate?: () => void; actionsBadge?: ReactNode }) {
  return <Links path={usePathname()} {...props} />;
}

function isActive(href: string, path: string) {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`) || (ALSO[href] || []).some((p) => path === p || path.startsWith(`${p}/`));
}

function Links({ path, onNavigate, actionsBadge }: { path: string; onNavigate?: () => void; actionsBadge?: ReactNode }) {
  const shown = NAV.filter((g) => g.items.length > 0);
  const section = (g: Group, i: number): ReactNode => (
    <div key={g.group ?? i} className="mb-3">
      {g.group && <p className="px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-white/55">{g.group}</p>}
      {g.items.map((item) => {
        const active = isActive(item.href, path);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm ${active ? "bg-brand text-white font-semibold" : "text-white/90 hover:bg-white/10"}`}
          >
            <Icon name={item.icon} />
            <span className="flex-1">{item.label}</span>
            {item.count === "actions" && actionsBadge}
          </Link>
        );
      })}
    </div>
  );
  return (
    <nav aria-label="Main menu" className="flex min-h-full flex-col">
      <div>{shown.filter((g) => !g.bottom).map(section)}</div>
      <div className="mt-auto">{shown.filter((g) => g.bottom).map(section)}</div>
    </nav>
  );
}

// Logo on a white strip with the orange line under it, at the top of the menu.
export function MenuLogo() {
  return (
    <Link href="/" className="block bg-white px-4 py-3 border-b-4 border-brand">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/cbs-logo.png" alt="CBS Operations Hub" className="h-9 w-auto" />
    </Link>
  );
}

// Always-visible menu on wide screens.
export function Sidebar({ actionsBadge }: { actionsBadge?: ReactNode }) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-dark text-white">
      <MenuLogo />
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks actionsBadge={actionsBadge} />
      </div>
    </aside>
  );
}
