"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { SearchSuggest, type Suggestion } from "@/components/ui/search-suggest";
import { useScrollLock } from "@/components/ui/scroll-lock";
import { MenuLogo, NavLinks } from "./nav";
import { MenuButton } from "@/components/ui/menu-button";
import { useTasks } from "@/components/tasks/task-provider";

// Mobile: a menu button that opens a narrow drawer (the menu is never sticky on mobile).
export function MobileMenu({ actionsBadge }: { actionsBadge?: ReactNode }) {
  const [open, setOpen] = useState(false);
  useScrollLock(open);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="lg:hidden rounded-lg border border-line px-3 py-1.5 text-sm text-ink" aria-expanded={open}>
        Menu
      </button>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-modal="true" aria-label="Main menu" className="absolute left-0 top-0 h-full w-64 max-w-[80vw] bg-dark text-white flex flex-col">
            <div className="flex items-stretch">
              <div className="flex-1"><MenuLogo /></div>
              <button type="button" onClick={() => setOpen(false)} className="bg-white border-b-4 border-brand px-3 text-sm text-ink">Close</button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-3">
              <NavLinks onNavigate={() => setOpen(false)} actionsBadge={actionsBadge} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ‹ Back: the page you came from (hidden on Home, where there's nowhere to go back to).
export function BackButton() {
  const router = useRouter();
  const path = usePathname();
  if (path === "/") return null;
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      className="rounded-lg px-2 py-2 text-base font-semibold text-ink hover:bg-paper whitespace-nowrap"
    >
      ‹ Back
    </button>
  );
}

// The signed-in person: a pill with their initials and name. Sign out is inside its menu.
export function NameMenu({ name, signOut }: { name: string; signOut: () => Promise<void> }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <MenuButton
      tone="pill"
      ariaLabel={`Signed in as ${name}`}
      label={
        <>
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{initials}</span>
          <span className="hidden sm:inline font-semibold" data-testid="signed-in-name">{name}</span>
        </>
      }
      items={[]}
      footer={
        <form action={signOut}>
          <p className="px-3 pt-1 pb-2 text-xs text-muted">Signed in as {name}</p>
          <button type="submit" role="menuitem" className="block w-full text-left px-3 py-2 text-sm text-ink hover:bg-paper">Sign out</button>
        </form>
      }
    />
  );
}

type Results = { jobs: Hit[]; tasks: Hit[]; people: Hit[] };
type Hit = { kind: "job" | "task" | "person"; id: number; title: string; sub: string; href: string };

// Header search: jobs, tasks and people listed under the box as you type. Click one to open it.
export function GlobalSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const { openTask } = useTasks();
  const [q, setQ] = useState(initial);
  const [phoneOpen, setPhoneOpen] = useState(false);
  // Results are kept with the words they were for, so stale results never show.
  const [found, setFound] = useState<{ term: string; hits: Hit[] }>({ term: "", hits: [] });
  const term = q.trim();
  const hits = found.term === term ? found.hits : [];
  const busy = !!term && found.term !== term;

  useEffect(() => {
    if (!term) return;
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctl.signal, cache: "no-store" })
        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
        .then((r: Results) => setFound({ term, hits: [...r.jobs, ...r.tasks, ...r.people] }))
        .catch((e) => {
          if (ctl.signal.aborted) return;
          console.error("Search failed", e);
          setFound({ term, hits: [] });
        });
    }, 150);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [term]);

  const GROUP = { job: "Jobs", task: "Tasks", person: "People" } as const;
  const results: Suggestion[] = hits.map((h) => ({ key: `${h.kind}-${h.id}`, group: GROUP[h.kind], title: h.title, sub: h.sub }));

  const box = (onDone?: () => void) => (
    <SearchSuggest
      light
      value={q}
      onChange={setQ}
      results={results}
      busy={busy}
      label="Search the hub"
      placeholder="Search jobs, people, documents…"
      emptyText={`Nothing matches "${q.trim()}".`}
      onPick={(s) => {
        const h = hits.find((x) => `${x.kind}-${x.id}` === s.key);
        if (!h) return;
        onDone?.();
        if (h.kind === "task") openTask(h.id);
        else router.push(h.href);
      }}
      onSubmit={() => {
        if (!q.trim()) return;
        onDone?.();
        router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    />
  );

  return (
    <>
      {/* Wider screens: the box sits in the header row. */}
      <div role="search" className="hidden sm:block flex-1 min-w-0 max-w-xl">{box()}</div>
      {/* Phones: a search button; the box opens as a full-width row under the header. */}
      <button
        type="button"
        onClick={() => setPhoneOpen(!phoneOpen)}
        aria-expanded={phoneOpen}
        aria-label="Open search"
        className="sm:hidden flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 fill-none stroke-current" strokeWidth={2} strokeLinecap="round">
          <circle cx="11" cy="11" r="6.5" />
          <path d="M16 16l4 4" />
        </svg>
      </button>
      {phoneOpen && (
        <div role="search" className="sm:hidden absolute inset-x-0 top-full z-30 flex items-start gap-2 border-b border-line bg-white px-3 py-3 shadow-md">
          <div className="min-w-0 flex-1">{box(() => setPhoneOpen(false))}</div>
          <button type="button" onClick={() => setPhoneOpen(false)} className="h-11 rounded-lg border border-line px-3 text-sm text-ink">
            Close
          </button>
        </div>
      )}
    </>
  );
}

// "+ New task" is on every page: a one-off task (as the old hub's header button). On a job's pages
// it is linked to that job to start with. Requirements are added from the job page's Tasks panel.
export function NewTaskButton() {
  const { newGenericTask } = useTasks();
  return (
    <button
      type="button"
      onClick={() => newGenericTask({ jobNo: /^\/jobs\/(\d+)/.exec(window.location.pathname)?.[1] ?? null })}
      className="h-11 rounded-lg bg-brand px-3 sm:px-4 text-[15px] font-semibold text-white hover:bg-brand-dark whitespace-nowrap"
    >
      + <span className="sm:hidden">Task</span>
      <span className="hidden sm:inline">New task</span>
    </button>
  );
}
