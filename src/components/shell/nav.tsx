"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, type ReactNode } from "react";

// Main left menu, grouped as in the live hub. Only pages that exist so far are listed; a group with
// no pages yet (Purchasing) is left out until it has one. As live: the
// top items and Settings carry an icon; inside a group the heading carries the icon and its items
// sit indented under it.
type Item = { href: string; label: string; icon?: keyof typeof ICONS; count?: "actions" };
type Group = { group?: string; icon?: keyof typeof ICONS; items: Item[] };

export const NAV: Group[] = [
  {
    items: [
      { href: "/", label: "Home", icon: "home" },
      { href: "/actions", label: "Actions", icon: "actions", count: "actions" },
      { href: "/jobs", label: "Jobs", icon: "jobs" },
    ],
  },
  { group: "Purchasing", icon: "receipt", items: [] },
  {
    group: "Health and safety",
    icon: "shield",
    items: [
      { href: "/safety/policy", label: "Policy and manual" },
      { href: "/safety/hazards", label: "Hazards and CoSHH" },
    ],
  },
  {
    group: "Assets",
    icon: "van",
    items: [
      { href: "/fleet", label: "Fleet" },
      { href: "/equipment", label: "Equipment and materials" },
    ],
  },
  {
    group: "People and companies",
    icon: "team",
    items: [
      { href: "/people", label: "Team" },
      { href: "/subcontractors", label: "Subcontractors and suppliers" },
    ],
  },
  {
    group: "Compliance",
    icon: "award",
    items: [{ href: "/insurance", label: "Insurance and accreditations" }],
  },
  // Settings is the last item (no settings pages yet, so it isn't shown).
  { items: [] },
];

// Pages that belong to a menu item without sitting under its address (Team requests and Team
// training are Team tabs).
const ALSO: Record<string, string[]> = { "/people": ["/requests", "/training"], "/safety/hazards": ["/safety/coshh"] };

const ICONS = {
  home: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  actions: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8.5 12l2.5 2.5 5-5" /></>,
  jobs: <><rect x="3" y="7" width="18" height="13" rx="1.5" /><path d="M8 7V4h8v3" /></>,
  receipt: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" /><path d="M9 8h6M9 12h6M9 16h4" /></>,
  shield: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z" />,
  award: <><circle cx="12" cy="9" r="5" /><path d="M9 13.5L8 21l4-2 4 2-1-7.5" /></>,
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
  return (
    <nav aria-label="Main menu">
      {shown.map((g, gi) => (
        <div key={g.group ?? gi} className={g.group ? "mt-4" : ""}>
          {g.group && (
            <p className="flex items-center gap-2.5 px-3 pb-1 text-[13px] font-bold uppercase tracking-[0.12em] text-[#b9bbbd]">
              {g.icon && <Icon name={g.icon} />}
              {g.group}
            </p>
          )}
          {g.items.map((item) => {
            const active = isActive(item.href, path);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg py-2 pr-3 text-[15px] ${item.icon ? "pl-3" : "pl-[2.45rem]"} ${active ? "bg-brand text-white font-semibold" : "text-white hover:bg-white/10"}`}
              >
                {item.icon && <Icon name={item.icon} />}
                <span className="flex-1">{item.label}</span>
                {item.count === "actions" && actionsBadge}
              </Link>
            );
          })}
        </div>
      ))}
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
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 flex-col bg-dark text-white">
      <MenuLogo />
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks actionsBadge={actionsBadge} />
      </div>
    </aside>
  );
}
