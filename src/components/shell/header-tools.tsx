"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useScrollLock } from "@/components/ui/scroll-lock";
import { Drawer } from "@/components/ui/overlay";
import { NavLinks } from "./nav";

// Mobile: a menu button that opens a narrow drawer (the menu is never sticky on mobile).
export function MobileMenu() {
  const [open, setOpen] = useState(false);
  useScrollLock(open);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lg:hidden rounded-md border border-white/40 px-3 py-1.5 text-sm text-white" aria-expanded={open}>
        Menu
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Main menu" className="absolute left-0 top-0 h-full w-64 max-w-[80vw] bg-dark text-white flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <span className="font-semibold">Menu</span>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-white/40 px-3 py-1 text-sm">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function GlobalSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
      className="flex-1 min-w-0 max-w-md"
    >
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search the hub"
        aria-label="Search the hub"
        spellCheck
        className="w-full rounded-lg border border-white/30 bg-white/10 text-white placeholder:text-white/60 px-3 py-1.5 focus:outline-none focus:bg-white focus:text-ink"
      />
    </form>
  );
}

// "+ New task" is on every page. The task panel arrives in Phase 1.
export function NewTaskButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark whitespace-nowrap">
        + New task
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title="New task">
        <p className="text-sm text-muted">Tasks are built in Phase 1. This button opens the one task panel from then on.</p>
      </Drawer>
    </>
  );
}
