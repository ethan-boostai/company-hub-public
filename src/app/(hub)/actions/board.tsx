"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchBox } from "@/components/ui/search-box";
import { isOverdue, TaskMarkers } from "@/components/tasks/task-bits";
import { useTasks } from "@/components/tasks/task-provider";
import { REQ_STAGES } from "@/lib/requirements";
import { STATUS_LABEL, type TaskStatus, type TaskView } from "@/lib/tasks/types";
import { changeTaskStatus } from "@/app/actions/tasks";

const FILTER_KEY = "cbs-hub.actions.filters";
type Filters = { job: string; who: string; category: string; stage: string; overdue: boolean; group: boolean };
const NO_FILTERS: Filters = { job: "", who: "", category: "", stage: "", overdue: false, group: false };
const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done"];

function readFilters(): Filters {
  try {
    return { ...NO_FILTERS, ...JSON.parse(window.localStorage.getItem(FILTER_KEY) || "{}") };
  } catch {
    return NO_FILTERS;
  }
}
function saveFilters(f: Filters) {
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(f));
  } catch {
    // Storage blocked: filters last until the page is closed.
  }
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="text-sm">
      <span className="block text-xs text-muted mb-0.5">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm max-w-[12rem]">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

// Actions board: every task, in To do / In progress / Done. Drag a card to change its status (Undo
// for a few seconds), or open it. Filters are remembered on this device only; the TV ignores them.
export function ActionsBoard({ tasks: initial, olderShown }: { tasks: TaskView[]; olderShown: boolean }) {
  const router = useRouter();
  const { openTask } = useTasks();
  const [tasks, setTasks] = useState(initial);
  const [f, setF] = useState<Filters>(NO_FILTERS);
  const [q, setQ] = useState("");
  const [dragId, setDragId] = useState<number | null>(null);
  const [undo, setUndo] = useState<{ id: number; from: TaskStatus; title: string } | null>(null);
  const [error, setError] = useState("");
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setTasks(initial), [initial]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setF(readFilters()), []);
  const setFilter = (patch: Partial<Filters>) => {
    const next = { ...f, ...patch };
    setF(next);
    saveFilters(next);
  };

  const options = useMemo(() => {
    const jobs = new Map<string, string>();
    const who = new Map<string, string>();
    const cats = new Set<string>();
    for (const t of tasks) {
      if (t.jobNo) jobs.set(t.jobNo, `#${t.jobNo} ${t.jobTitle || ""}`.trim());
      if (t.assigneeId) who.set(String(t.assigneeId), t.assignee || "");
      cats.add(t.category);
    }
    return { jobs: [...jobs].sort((a, b) => Number(b[0]) - Number(a[0])), who: [...who].sort((a, b) => a[1].localeCompare(b[1])), cats: [...cats].sort() };
  }, [tasks]);

  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const shown = tasks.filter((t) => {
    if (f.job === "none" ? t.jobNo : f.job && t.jobNo !== f.job) return false;
    if (f.who === "none" ? t.assigneeId : f.who && String(t.assigneeId) !== f.who) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.stage === "none" ? t.stage : f.stage && t.stage !== f.stage) return false;
    if (f.overdue && !isOverdue(t)) return false;
    return !needle || [t.title, t.jobNo || "", t.client || "", t.assignee || "", t.inHandNote, t.notes].some((x) => x.toLowerCase().includes(needle));
  });
  const filtered = JSON.stringify(f) !== JSON.stringify(NO_FILTERS) || !!needle;
  const openCount = tasks.filter((t) => t.status !== "done").length;
  const overdueCount = tasks.filter(isOverdue).length;

  async function move(id: number, to: TaskStatus, fromUndo = false) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === to) return;
    const from = t.status;
    setError("");
    setTasks((list) => list.map((x) => (x.id === id ? { ...x, status: to, verifiedAt: null, verifiedBy: null } : x)));
    const r = await changeTaskStatus(id, to, crypto.randomUUID()).catch(() => ({ ok: false, message: "That didn't save. Check the connection and try again." }));
    if (!r.ok) {
      setTasks((list) => list.map((x) => (x.id === id ? { ...x, status: from } : x)));
      setError(r.message || "That didn't save.");
      return;
    }
    if (undoTimer.current) clearTimeout(undoTimer.current);
    if (fromUndo) setUndo(null);
    else {
      setUndo({ id, from, title: t.title });
      undoTimer.current = setTimeout(() => setUndo(null), 6000);
    }
    router.refresh();
  }

  const columnTasks = (s: TaskStatus) => shown.filter((t) => t.status === s);

  return (
    <div>
      <p className="text-sm text-muted mb-3">
        {openCount} open · <span className={overdueCount ? "text-danger font-semibold" : ""}>{overdueCount} overdue</span>
      </p>
      <div className="flex flex-wrap items-end gap-3 mb-3">
        <div className="w-full sm:w-72"><SearchBox value={q} onChange={setQ} placeholder="Search tasks, jobs, people" label="Search tasks" /></div>
        <Select label="Job" value={f.job} onChange={(v) => setFilter({ job: v })} options={[{ value: "", label: "All jobs" }, { value: "none", label: "No job (office)" }, ...options.jobs.map(([v, l]) => ({ value: v, label: l }))]} />
        <Select label="Assigned to" value={f.who} onChange={(v) => setFilter({ who: v })} options={[{ value: "", label: "Anyone" }, { value: "none", label: "Not assigned" }, ...options.who.map(([v, l]) => ({ value: v, label: l }))]} />
        <Select label="Category" value={f.category} onChange={(v) => setFilter({ category: v })} options={[{ value: "", label: "All" }, ...options.cats.map((c) => ({ value: c, label: c }))]} />
        <Select label="Stage" value={f.stage} onChange={(v) => setFilter({ stage: v })} options={[{ value: "", label: "All" }, ...REQ_STAGES.map((s) => ({ value: s.key, label: s.label })), { value: "none", label: "One-off tasks" }]} />
        <label className="flex items-center gap-1.5 text-sm pb-1.5"><input type="checkbox" checked={f.overdue} onChange={(e) => setFilter({ overdue: e.target.checked })} /> Overdue only</label>
        <label className="flex items-center gap-1.5 text-sm pb-1.5"><input type="checkbox" checked={f.group} onChange={(e) => setFilter({ group: e.target.checked })} /> Group by job</label>
        {filtered && <button type="button" className="text-sm underline pb-1.5" onClick={() => { setQ(""); setFilter(NO_FILTERS); }}>Clear</button>}
      </div>
      {error && <p role="alert" className="text-sm text-danger mb-3">{error}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {COLUMNS.map((s) => {
          const list = columnTasks(s);
          const groups = f.group ? [...new Set(list.map((t) => t.jobNo || ""))] : [null];
          return (
            <section
              key={s}
              aria-label={STATUS_LABEL[s]}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId !== null) move(dragId, s);
                setDragId(null);
              }}
              className="rounded-xl bg-paper/60 border border-line p-2 min-h-[12rem]"
            >
              <h2 className="px-1 pb-2 font-semibold">
                {STATUS_LABEL[s]} <span className="text-muted font-normal">({list.length})</span>
                {s === "done" && <span className="ml-1 text-xs font-normal text-muted">{olderShown ? "all" : "last 7 days"}</span>}
              </h2>
              {groups.map((g) => (
                <div key={g ?? "all"}>
                  {g !== null && <p className="px-1 pt-1 pb-1 text-xs font-semibold text-muted">{g ? `Job ${g}` : "No job"}</p>}
                  <ul className="flex flex-col gap-2">
                    {list.filter((t) => g === null || (t.jobNo || "") === g).map((t) => (
                      <li key={t.id} draggable onDragStart={() => setDragId(t.id)} onDragEnd={() => setDragId(null)}
                        className={`rounded-lg border bg-white ${isOverdue(t) ? "border-[#d93025]" : "border-line"} ${dragId === t.id ? "opacity-50" : ""}`}>
                        <button type="button" onClick={() => openTask(t.id)} className="w-full text-left px-3 py-2">
                          <span className="block text-xs text-muted truncate">
                            {t.jobNo ? `Job ${t.jobNo}${t.client ? ` · ${t.client}` : ""}` : "Office"}
                          </span>
                          <span className="block text-sm font-medium">{t.title}</span>
                          <TaskMarkers t={t} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              {list.length === 0 && <p className="px-1 text-sm text-muted">{filtered ? "Nothing matches." : "None."}</p>}
              {s === "done" && !olderShown && (
                <Link href="/actions?older=1" className="block px-1 pt-2 text-sm underline">Show older done</Link>
              )}
            </section>
          );
        })}
      </div>

      {undo && (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-30 rounded-lg bg-dark text-white px-4 py-2 text-sm flex gap-3 items-center shadow-lg">
          Moved “{undo.title}”.
          <button type="button" className="underline font-semibold" onClick={() => move(undo.id, undo.from, true)}>Undo</button>
        </div>
      )}
    </div>
  );
}
