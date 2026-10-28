"use client";

import { useState } from "react";
import { SearchBox } from "@/components/ui/search-box";
import { TaskMarkers } from "@/components/tasks/task-bits";
import { useTasks } from "@/components/tasks/task-provider";
import { STATUS_LABEL, type TaskStatus, type TaskView } from "@/lib/tasks/types";

// The job's tasks. Requirements are added only through + New task (no on/off toggles here).
export function JobTasks({ jobNo, tasks }: { jobNo: string; tasks: TaskView[] }) {
  const { openTask, newTask } = useTasks();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = tasks.filter((t) => !needle || [t.title, t.category, t.assignee || "", t.notes].some((f) => f.toLowerCase().includes(needle)));
  return (
    <section className="bg-white border border-line rounded-xl p-4 sm:p-5" aria-label="Tasks">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="font-semibold flex-1">Tasks</h2>
        <button type="button" onClick={() => newTask({ jobNo })} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white">
          + New task
        </button>
      </div>
      <SearchBox value={q} onChange={setQ} placeholder="Search this job's tasks" label="Search this job's tasks" />
      {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => {
        const rows = shown.filter((t) => t.status === s);
        return (
          <div key={s} className="mt-4">
            <h3 className="text-sm font-semibold text-muted mb-1">{STATUS_LABEL[s]} ({rows.length})</h3>
            {rows.length === 0 ? (
              <p className="text-sm text-muted">None.</p>
            ) : (
              <ul className="divide-y divide-line border border-line rounded-lg">
                {rows.map((t) => (
                  <li key={t.id}>
                    <button type="button" onClick={() => openTask(t.id)} className="w-full text-left px-3 py-2 hover:bg-paper">
                      <span className="block text-sm font-medium">{t.title}</span>
                      <TaskMarkers t={t} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}
