"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { NewTaskDraft } from "@/lib/tasks/types";
import { loadPeople } from "@/app/actions/tasks";
import { NewTaskPicker } from "./new-task";
import { TaskPanel } from "./task-panel";

type TaskApi = {
  // Opens a task in the one task panel (the 560px right-hand drawer), from anywhere.
  openTask: (id: number) => void;
  // Job page: the requirement picker for that job (centred, tick several, then Add).
  newTask: (opts?: { jobNo?: string | null }) => void;
  // Header + New task: a one-off task, linked to a job (pre-set on a job's pages) or to nothing.
  newGenericTask: (opts?: { jobNo?: string | null }) => void;
};
const Ctx = createContext<TaskApi | null>(null);

// One task panel and one + New task picker for the whole hub. Every page opens tasks through this.
export function TaskProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<number | null>(null);
  const [draft, setDraft] = useState<NewTaskDraft | null>(null);
  const [draftPeople, setDraftPeople] = useState<{ id: number; name: string }[]>([]);
  const [picker, setPicker] = useState<{ jobNo: string | null } | null>(null);

  const openTask = useCallback((id: number) => {
    setPicker(null);
    setDraft(null);
    setOpenId(id);
  }, []);
  const newTask = useCallback((opts?: { jobNo?: string | null }) => {
    setOpenId(null);
    setDraft(null);
    setPicker({ jobNo: opts?.jobNo ?? null });
  }, []);
  const startDraft = useCallback((d: NewTaskDraft) => {
    setOpenId(null);
    setPicker(null);
    setDraft(d);
    loadPeople().then(setDraftPeople).catch(() => setDraftPeople([]));
  }, []);
  const newGenericTask = useCallback(
    (opts?: { jobNo?: string | null }) =>
      startDraft({ jobId: null, jobNo: opts?.jobNo ?? null, reqKey: null, title: "", side: "office", linkJob: true }),
    [startDraft],
  );
  const api = useMemo(() => ({ openTask, newTask, newGenericTask }), [openTask, newTask, newGenericTask]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <NewTaskPicker
        open={!!picker}
        jobNo={picker?.jobNo ?? null}
        onClose={() => setPicker(null)}
        onOpenTask={(id) => openTask(id)}
        // Other / On site task: the one-off task form, on this job.
        onOther={(side) => startDraft({ jobId: null, jobNo: picker?.jobNo ?? null, reqKey: null, title: "", side })}
        onAdded={(ids) => {
          setPicker(null);
          router.refresh();
          if (ids.length === 1) openTask(ids[0]);
        }}
      />
      <TaskPanel
        taskId={openId}
        draft={draft}
        people={draftPeople}
        onClose={() => {
          setOpenId(null);
          setDraft(null);
        }}
        onOpenTask={(id) => openTask(id)}
        onSaved={(id) => {
          if (draft) openTask(id);
          router.refresh();
        }}
      />
    </Ctx.Provider>
  );
}

export function useTasks(): TaskApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTasks needs TaskProvider");
  return v;
}
