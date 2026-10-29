"use client";

import { useState } from "react";
import { SearchBox } from "@/components/ui/search-box";
import { useScrollLock } from "@/components/ui/scroll-lock";
import { TaskMarkers } from "@/components/tasks/task-bits";
import { useTasks } from "@/components/tasks/task-provider";
import { STATUS_LABEL, type TaskStatus, type TaskView } from "@/lib/tasks/types";

type Filter = "open" | "all" | "overdue";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

// The job's Tasks panel, down the right of the job page as in the old Job File (wide screens). On
// narrower screens it sits behind a "Tasks" button and opens full screen. + New task here is the
// job's requirement picker. Requirements are added only through it (no on/off toggles).
export function JobTasks({ jobNo, tasks, meId }: { jobNo: string; tasks: TaskView[]; meId: number | null }) {
  const { openTask, newTask } = useTasks();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("open");
  const [mine, setMine] = useState(false);
  const [openSmall, setOpenSmall] = useState(false);
  useScrollLock(openSmall);

  const now = today();
  const overdue = (t: TaskView) => t.status !== "done" && !!t.dueOn && t.dueOn < now;
  const needle = q.trim().toLowerCase();
  const shown = tasks.filter(
    (t) =>
      (filter === "all" || (filter === "open" ? t.status !== "done" : overdue(t))) &&
      (!mine || (meId !== null && t.assigneeId === meId)) &&
      (!needle || [t.title, t.category, t.assignee || "", t.notes].some((f) => f.toLowerCase().includes(needle))),
  );
  const openCount = tasks.filter((t) => t.status !== "done").length;

  const panel = (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-4 pb-3 border-b border-line flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-lg flex-1">
            Tasks <span className="text-sm font-normal text-muted">{openCount} open</span>
          </h2>
          <button type="button" onClick={() => newTask({ jobNo })} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
            + New task
          </button>
          {openSmall && (
            <button type="button" onClick={() => setOpenSmall(false)} aria-label="Close tasks" className="rounded-lg border border-line px-2.5 py-1 text-lg leading-none">
              ×
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-sm" role="group" aria-label="Show tasks">
          {(["open", "all", "overdue"] as Filter[]).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`rounded-full border px-3 py-1 ${filter === f ? "border-brand bg-brand/10 font-semibold" : "border-line"}`}>
              {f === "open" ? "Open" : f === "all" ? "All" : "Overdue"}
            </button>
          ))}
          <button type="button" aria-pressed={mine} onClick={() => setMine(!mine)}
            className={`rounded-full border px-3 py-1 ${mine ? "border-brand bg-brand/10 font-semibold" : "border-line"}`}>
            Mine
          </button>
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search this job's tasks" label="Search this job's tasks" />
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => {
          const rows = shown.filter((t) => t.status === s);
          if (filter !== "all" && s === "done") return null;
          return (
            <div key={s} className="mt-4">
              <h3 className="text-sm font-semibold text-muted mb-1">{STATUS_LABEL[s]} ({rows.length})</h3>
              {rows.length === 0 ? (
                <p className="text-sm text-muted">None.</p>
              ) : (
                <ul className="divide-y divide-line border border-line rounded-lg bg-white">
                  {rows.map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => openTask(t.id, { centred: true })} className="w-full text-left px-3 py-2 hover:bg-paper">
                        <span className="block text-sm font-medium">{t.title}</span>
                        <TaskMarkers t={t} />
                        {overdue(t) && <span className="text-xs font-semibold text-danger">Overdue</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {/* Wide screens: the right-hand column. */}
      <aside aria-label="Tasks" className="hidden min-[1100px]:block sticky top-0 h-screen w-[380px] shrink-0 border-l border-line bg-white">
        {panel}
      </aside>
      {/* Narrower screens: a Tasks button that opens the panel full screen. */}
      <div className="min-[1100px]:hidden">
        <button type="button" onClick={() => setOpenSmall(true)} className="fixed bottom-4 right-4 z-20 rounded-full bg-brand px-5 py-3 font-semibold text-white shadow-lg">
          Tasks ({openCount})
        </button>
        {openSmall && (
          <div role="dialog" aria-modal="true" aria-label="Tasks" className="fixed inset-0 z-[35] bg-white">
            {panel}
          </div>
        )}
      </div>
    </>
  );
}
