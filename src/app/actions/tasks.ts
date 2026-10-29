"use server";

import { db } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { formText, guarded, type ActionResult } from "@/lib/actions";
import { jobTitle } from "@/lib/jobs/stages";
import { activePeople, getTask, pickerTiles, taskFiles, taskHistory } from "@/lib/tasks/data";
import { createTask, removeTask, sendBack, setStatus, setVerified, TaskError, updateTask } from "@/lib/tasks/service";
import type { PickerTile, TaskStatus, TaskView } from "@/lib/tasks/types";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const asId = (v: unknown) => (/^\d{1,12}$/.test(String(v ?? "")) ? Number(v) : null);
const asDay = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const failed = (e: unknown): { ok: false; message: string } => ({
  ok: false,
  message: e instanceof TaskError ? e.message : "That didn't save. Check the connection and try again.",
});

export type PanelData = {
  task: TaskView;
  files: { id: number; name: string; mime: string; storage: string; size: number }[];
  history: { at: string; by: string; action: string; changes: Record<string, [unknown, unknown]> }[];
  people: { id: number; name: string }[];
};

// Reads for the task panel (signed-in users only).
export async function loadTaskPanel(id: number): Promise<PanelData | null> {
  if (!(await getCurrentPerson())) return null;
  const task = await getTask(id);
  if (!task) return null;
  const [files, history, people] = await Promise.all([taskFiles(id), taskHistory(id), activePeople()]);
  return { task, files: task.jobId ? files : [], history, people };
}

export type PickerData = {
  job: { id: number; jobNo: string; title: string; stage: string; jobType: string } | null;
  tiles: PickerTile[];
  people: { id: number; name: string }[];
};

export async function loadPicker(jobNo: string | null): Promise<PickerData | null> {
  if (!(await getCurrentPerson())) return null;
  let job: PickerData["job"] = null;
  if (jobNo && /^\d{1,10}$/.test(jobNo)) {
    const [j] = await db()<{ id: string; job_no: string; sm8_description: string | null; stage: string; job_type: string }[]>`
      select id, job_no, sm8_description, stage, job_type from jobs where job_no = ${jobNo}`;
    if (j) job = { id: Number(j.id), jobNo: j.job_no, title: jobTitle(j.sm8_description), stage: j.stage, jobType: j.job_type };
  }
  const [tiles, people] = await Promise.all([job ? pickerTiles({ id: job.id, stage: job.stage, jobType: job.jobType }) : Promise.resolve([]), activePeople()]);
  return { job, tiles, people };
}

export async function loadPeople(): Promise<{ id: number; name: string }[]> {
  if (!(await getCurrentPerson())) return [];
  return activePeople();
}

export async function findJobs(q: string): Promise<{ jobNo: string; title: string; client: string }[]> {
  if (!(await getCurrentPerson())) return [];
  const needle = String(q || "").trim().replace(/^#/, "").slice(0, 60);
  if (!needle) return [];
  const like = `%${needle.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await db()<{ job_no: string; sm8_description: string | null; client: string | null }[]>`
    select j.job_no, j.sm8_description, c.name as client from jobs j left join clients c on c.id = j.client_id
    where j.sm8_active and (j.job_no like ${like} or j.sm8_description ilike ${like} or c.name ilike ${like})
    order by length(j.job_no) desc, j.job_no desc limit 12`;
  return rows.map((r) => ({ jobNo: r.job_no, title: jobTitle(r.sm8_description), client: r.client || "" }));
}

// The task panel's one Save: creates a new task, or saves every field of an existing one.
export async function saveTask(form: FormData): Promise<ActionResult<{ id: number; existing?: boolean }>> {
  return guarded<{ id: number; existing?: boolean }>(form.get("_rk"), async (person) => {
    const id = asId(form.get("id"));
    const status = (STATUSES.includes(formText(form, "status") as TaskStatus) ? formText(form, "status") : "todo") as TaskStatus;
    const fields = {
      title: formText(form, "title"),
      notes: String(form.get("notes") || ""),
      status,
      inHandNote: formText(form, "inHandNote"),
      assigneeId: asId(form.get("assigneeId")),
      dueOn: asDay(form.get("dueOn")),
    };
    try {
      if (id) {
        await db().begin((tx) => updateTask(tx, id, fields, person.name));
        return { ok: true, data: { id }, message: "Saved." };
      }
      let jobId: number | null = null;
      const jobNo = formText(form, "jobNo");
      if (jobNo) {
        const [j] = await db()<{ id: string }[]>`select id from jobs where job_no = ${jobNo}`;
        if (!j) return { ok: false, message: "Job not found." };
        jobId = Number(j.id);
      }
      const reqKey = formText(form, "reqKey") || null;
      const newId = await db().begin((tx) =>
        createTask(tx, { jobId, reqKey, side: formText(form, "side") === "site" ? "site" : "office", ...fields }, person.name),
      );
      return { ok: true, data: { id: newId }, message: "Task added." };
    } catch (e) {
      if (e instanceof TaskError && e.existingId) return { ok: true, data: { id: e.existingId, existing: true }, message: e.message };
      return failed(e);
    }
  });
}

// The job page's + New task: every ticked requirement added in one go (one save, all or nothing).
// Returns the new task ids in the order ticked.
export async function addRequirements(
  jobNo: string,
  picks: { reqKey: string; side: "office" | "site" }[],
  requestKey: string,
): Promise<ActionResult<{ ids: number[] }>> {
  return guarded<{ ids: number[] }>(requestKey, async (person) => {
    if (!/^\d{1,10}$/.test(jobNo) || !Array.isArray(picks) || picks.length === 0 || picks.length > 40) {
      return { ok: false, message: "Tick at least one task." };
    }
    const [j] = await db()<{ id: string }[]>`select id from jobs where job_no = ${jobNo}`;
    if (!j) return { ok: false, message: "Job not found." };
    try {
      const ids = await db().begin(async (tx) => {
        const out: number[] = [];
        for (const p of picks) {
          out.push(await createTask(tx, { jobId: Number(j.id), reqKey: String(p.reqKey), side: p.side === "site" ? "site" : "office", title: "" }, person.name));
        }
        return out;
      });
      return { ok: true, data: { ids }, message: ids.length === 1 ? "Task added." : `${ids.length} tasks added.` };
    } catch (e) {
      return failed(e);
    }
  });
}

export async function changeTaskStatus(id: number, status: TaskStatus, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    try {
      await db().begin((tx) => setStatus(tx, id, status, person.name));
      return { ok: true };
    } catch (e) {
      return failed(e);
    }
  });
}

export async function verifyTask(id: number, verified: boolean, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    try {
      await db().begin((tx) => setVerified(tx, id, verified, person.name));
      return { ok: true, message: verified ? "Verified." : "Sign-off removed." };
    } catch (e) {
      return failed(e);
    }
  });
}

export async function sendTaskBack(id: number, to: "todo" | "in_progress", note: string, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    try {
      await db().begin((tx) => sendBack(tx, id, to === "in_progress" ? "in_progress" : "todo", note, person.name));
      return { ok: true, message: "Sent back to site." };
    } catch (e) {
      return failed(e);
    }
  });
}

export async function deleteTask(id: number, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    try {
      await db().begin((tx) => removeTask(tx, id, person.name));
      return { ok: true };
    } catch (e) {
      return failed(e);
    }
  });
}
