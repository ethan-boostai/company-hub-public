"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

// Main left menu. Items are added here as each phase is built.
export const NAV: { group?: string; items: { href: string; label: string }[] }[] = [
  { items: [{ href: "/", label: "Home" }, { href: "/jobs", label: "Jobs" }, { href: "/actions", label: "Actions board" }] },
  { items: [{ href: "/fleet", label: "Fleet" }] },
  { items: [{ href: "/subcontractors", label: "Subcontractors and suppliers" }] },
  { items: [{ href: "/requests", label: "Team requests" }] },
  {
    group: "Settings",
    items: [
      { href: "/settings/people", label: "People" },
      { href: "/settings/requirement-types", label: "Requirement types" },
      { href: "/settings/shared-parts", label: "Shared parts" },
    ],
  },
];

// The highlighted item depends on the address, which is only known per request (e.g. /jobs/12),
// so the links first render without a highlight and pick it up when the request arrives.
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Suspense fallback={<Links path="" onNavigate={onNavigate} />}>
      <LiveLinks onNavigate={onNavigate} />
    </Suspense>
  );
}

function LiveLinks({ onNavigate }: { onNavigate?: () => void }) {
  return <Links path={usePathname()} onNavigate={onNavigate} />;
}

function Links({ path, onNavigate }: { path: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main menu" className="flex flex-col gap-1">
      {NAV.map((section, i) => (
        <div key={i} className="mb-2">
          {section.group && <p className="px-3 pt-3 pb-1 text-xs font-bold uppercase tracking-wider text-white/60">{section.group}</p>}
          {section.items.map((item) => {
            const active = item.href === "/" ? path === "/" : path.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-brand text-white font-semibold" : "text-white/90 hover:bg-white/10"}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// Always-visible menu on wide screens.
export function Sidebar() {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 w-60 flex-col bg-dark text-white border-r-4 border-brand">
      <Link href="/" className="block px-4 py-4 border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cbs-logo.png" alt="CBS Operations Hub" className="h-9 w-auto bg-white rounded px-2 py-1" />
      </Link>
      <div className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </div>
    </aside>
  );
}
