"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SearchSuggest, type Suggestion } from "@/components/ui/search-suggest";
import { useScrollLock } from "@/components/ui/scroll-lock";
import { NavLinks } from "./nav";
import { useTasks } from "@/components/tasks/task-provider";

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

type Results = { jobs: Hit[]; tasks: Hit[]; people: Hit[] };
type Hit = { kind: "job" | "task" | "person"; id: number; title: string; sub: string; href: string };

// Header search: jobs, tasks and people listed under the box as you type. Click one to open it.
export function GlobalSearch({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const { openTask } = useTasks();
  const [q, setQ] = useState(initial);
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

  return (
    <div role="search" className="flex-1 min-w-0 max-w-md">
      <SearchSuggest
        dark
        value={q}
        onChange={setQ}
        results={results}
        busy={busy}
        label="Search the hub"
        placeholder="Search jobs, tasks and people"
        emptyText={`Nothing matches "${q.trim()}".`}
        onPick={(s) => {
          const h = hits.find((x) => `${x.kind}-${x.id}` === s.key);
          if (!h) return;
          if (h.kind === "task") openTask(h.id);
          else router.push(h.href);
        }}
        onSubmit={() => {
          if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
        }}
      />
    </div>
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
      className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark whitespace-nowrap"
    >
      + New task
    </button>
  );
}
