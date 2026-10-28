import "server-only";
import type postgres from "postgres";
import { logActivity } from "@/lib/activity";
import { builtIn, customId, lockReason, type Side } from "@/lib/requirements";
import type { TaskStatus } from "./types";

// The one place tasks are created and changed. Server actions (the task panel, the board) and other
// workstreams call these inside their own transaction. Rules (CLAUDE.md "Tasks"):
//  * single tasks; statuses To do / In progress / Done; Verified is a sign-off after Done;
//  * "In hand" is a note on an In progress task; Submitted / Sent back are markers, not statuses;
//  * category is never stored; a non-repeatable requirement has one live task per job;
//  * saving any other record never completes a task.

type Tx = postgres.TransactionSql;
export class TaskError extends Error {
  constructor(message: string, readonly existingId?: number) {
    super(message);
  }
}

export type NewTask = {
  jobId: number | null;
  reqKey: string | null;
  title?: string;
  notes?: string;
  side?: Side;
  status?: TaskStatus;
  inHandNote?: string;
  assigneeId?: number | null;
  dueOn?: string | null;
  sourceTable?: string | null;
  sourceId?: number | null;
};

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];
const clean = (s: string | undefined | null, max: number) => String(s || "").replace(/\r\n/g, "\n").trim().slice(0, max);

async function requirement(tx: Tx, key: string) {
  const b = builtIn(key);
  if (b) return { label: b.label, stage: b.stage, side: b.side, repeatable: !!b.repeatable, cdm: !!b.cdm };
  const id = customId(key);
  if (!id) return null;
  const [r] = await tx<{ name: string; stage: string; side: Side; repeatable: boolean; active: boolean }[]>`
    select name, stage, side, repeatable, active from requirement_types where id = ${id}`;
  if (!r || !r.active) return null;
  return { label: r.name, stage: r.stage as never, side: r.side, repeatable: r.repeatable, cdm: false };
}

export async function createTask(tx: Tx, input: NewTask, by: string): Promise<number> {
  const status = input.status && STATUSES.includes(input.status) ? input.status : "todo";
  let title = clean(input.title, 200);
  let side: Side = input.side === "site" ? "site" : "office";
  let stage: string | null = null;
  let isRepeat = false;
  let repeatNo: number | null = null;

  if (input.reqKey && !input.jobId) throw new TaskError("Requirements can only be added to a job.");
  if (input.jobId) {
    const [job] = await tx<{ stage: string; job_type: string }[]>`select stage, job_type from jobs where id = ${input.jobId}`;
    if (!job) throw new TaskError("Job not found.");
    if (input.reqKey) {
      const req = await requirement(tx, input.reqKey);
      if (!req) throw new TaskError("That requirement type isn't available.");
      const lock = lockReason({ ...req, key: input.reqKey }, { stage: job.stage, jobType: job.job_type });
      if (lock) throw new TaskError(lock);
      side = req.side;
      stage = req.stage;
      if (req.repeatable) {
        isRepeat = true;
        const [m] = await tx<{ n: number }[]>`
          select coalesce(max(repeat_no), 0)::int + 1 as n from tasks where job_id = ${input.jobId} and req_key = ${input.reqKey} and is_repeat`;
        repeatNo = m.n;
        if (!title) title = repeatNo > 1 ? `${req.label} ${repeatNo}` : req.label;
      } else {
        const [live] = await tx<{ id: string }[]>`
          select id from tasks where job_id = ${input.jobId} and req_key = ${input.reqKey} and removed_at is null and not is_repeat and system_key is null`;
        if (live) throw new TaskError(`${req.label} is already on this job.`, Number(live.id));
        if (!title) title = req.label;
      }
      await tx`
        insert into job_requirements (job_id, req_key, "on", created_by) values (${input.jobId}, ${input.reqKey}, true, ${by})
        on conflict (job_id, req_key) do update set "on" = true, updated_by = ${by}`;
    }
  }
  if (!title) throw new TaskError("Give the task a title.");

  const [row] = await tx<{ id: string }[]>`
    insert into tasks (job_id, title, notes, status, in_hand_note, in_hand_by, in_hand_at, assignee_id, due_on,
                       done_at, done_by, side, req_key, stage, is_repeat, repeat_no, source_table, source_id, created_by)
    values (${input.jobId}, ${title}, ${clean(input.notes, 5000) || null}, ${status},
            ${status === "in_progress" ? clean(input.inHandNote, 200) || null : null},
            ${status === "in_progress" && clean(input.inHandNote, 200) ? by : null},
            ${status === "in_progress" && clean(input.inHandNote, 200) ? new Date() : null},
            ${input.assigneeId ?? null}, ${input.dueOn || null},
            ${status === "done" ? new Date() : null}, ${status === "done" ? by : null},
            ${side}, ${input.reqKey}, ${stage}, ${isRepeat}, ${repeatNo}, ${input.sourceTable ?? null}, ${input.sourceId ?? null}, ${by})
    returning id`;
  const id = Number(row.id);
  await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: input.jobId, action: "create", changes: { title: [null, title], status: [null, status] } });
  return id;
}

type Current = {
  id: string; job_id: string | null; title: string; notes: string | null; status: TaskStatus; in_hand_note: string | null;
  assignee_id: string | null; due_on: Date | string | null; verified_at: Date | null; removed_at: Date | null;
};
async function current(tx: Tx, id: number): Promise<Current> {
  const [t] = await tx<Current[]>`
    select id, job_id, title, notes, status, in_hand_note, assignee_id, due_on, verified_at, removed_at from tasks where id = ${id} for update`;
  if (!t || t.removed_at) throw new TaskError("That task isn't there any more.");
  return t;
}
const dayText = (d: Date | string | null) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);

// The task panel's one Save.
export async function updateTask(
  tx: Tx, id: number,
  patch: { title: string; notes: string; status: TaskStatus; inHandNote: string; assigneeId: number | null; dueOn: string | null },
  by: string,
): Promise<void> {
  const t = await current(tx, id);
  const status = STATUSES.includes(patch.status) ? patch.status : t.status;
  const title = clean(patch.title, 200) || t.title;
  const note = status === "in_progress" ? clean(patch.inHandNote, 200) : "";
  const noteChanged = (t.in_hand_note || "") !== note;
  await tx`
    update tasks set
      title = ${title}, notes = ${clean(patch.notes, 5000) || null}, status = ${status},
      in_hand_note = ${note || null},
      in_hand_by = case when ${noteChanged} then ${note ? by : null} else in_hand_by end,
      in_hand_at = case when ${noteChanged} then ${note ? new Date() : null}::timestamptz else in_hand_at end,
      assignee_id = ${patch.assigneeId}, due_on = ${patch.dueOn || null},
      done_at = case when ${status} = 'done' and status <> 'done' then now() when ${status} <> 'done' then null else done_at end,
      done_by = case when ${status} = 'done' and status <> 'done' then ${by} when ${status} <> 'done' then null else done_by end,
      verified_at = case when ${status} <> 'done' then null else verified_at end,
      verified_by = case when ${status} <> 'done' then null else verified_by end,
      updated_by = ${by}
    where id = ${id}`;
  const changes: Record<string, [unknown, unknown]> = {};
  if (title !== t.title) changes.title = [t.title, title];
  if (status !== t.status) changes.status = [t.status, status];
  if (noteChanged) changes.in_hand = [t.in_hand_note, note || null];
  if (String(t.assignee_id ?? "") !== String(patch.assigneeId ?? "")) changes.assignee = [t.assignee_id, patch.assigneeId];
  if (dayText(t.due_on) !== (patch.dueOn || null)) changes.due_on = [dayText(t.due_on), patch.dueOn || null];
  if ((t.notes || "") !== clean(patch.notes, 5000)) changes.notes = ["(before)", "(changed)"];
  if (Object.keys(changes).length) {
    await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: t.job_id ? Number(t.job_id) : null, action: "update", changes });
  }
}

// Status only (the board's drag and drop; the office marking Done by hand).
export async function setStatus(tx: Tx, id: number, status: TaskStatus, by: string): Promise<void> {
  const t = await current(tx, id);
  if (!STATUSES.includes(status) || status === t.status) return;
  await tx`
    update tasks set status = ${status},
      in_hand_note = case when ${status} = 'in_progress' then in_hand_note else null end,
      done_at = case when ${status} = 'done' then now() else null end,
      done_by = case when ${status} = 'done' then ${by} else null end,
      verified_at = null, verified_by = null, updated_by = ${by}
    where id = ${id}`;
  await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: t.job_id ? Number(t.job_id) : null, action: "status", changes: { status: [t.status, status] } });
}

// Sign-off after Done.
export async function setVerified(tx: Tx, id: number, verified: boolean, by: string): Promise<void> {
  const t = await current(tx, id);
  if (verified && t.status !== "done") throw new TaskError("Only a Done task can be verified.");
  await tx`update tasks set verified_at = ${verified ? new Date() : null}, verified_by = ${verified ? by : null}, updated_by = ${by} where id = ${id}`;
  await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: t.job_id ? Number(t.job_id) : null, action: "update",
    changes: { verified: [t.verified_at ? "yes" : "no", verified ? "yes" : "no"] } });
}

// On site tasks: the office sends a submitted task back with a note (a marker; status To do or In progress).
export async function sendBack(tx: Tx, id: number, to: "todo" | "in_progress", note: string, by: string): Promise<void> {
  const t = await current(tx, id);
  const n = clean(note, 500);
  if (!n) throw new TaskError("Say what needs doing before sending it back.");
  await tx`
    update tasks set status = ${to}, done_at = null, done_by = null, verified_at = null, verified_by = null,
      submitted_at = null, submitted_by = null,
      sent_back_note = ${n}, sent_back_at = now(), sent_back_by = ${by}, updated_by = ${by}
    where id = ${id}`;
  await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: t.job_id ? Number(t.job_id) : null, action: "status",
    changes: { status: [t.status, to], sent_back: [null, n] } });
}

// Remove from job (requirement task) or delete (one-off): hidden, never erased, files kept.
export async function removeTask(tx: Tx, id: number, by: string): Promise<void> {
  const t = await current(tx, id);
  const [r] = await tx<{ req_key: string | null; is_repeat: boolean; system_key: string | null }[]>`
    select req_key, is_repeat, system_key from tasks where id = ${id}`;
  await tx`update tasks set removed_at = now(), removed_by = ${by}, updated_by = ${by} where id = ${id}`;
  if (t.job_id && r.req_key && !r.is_repeat && !r.system_key) {
    await tx`update job_requirements set "on" = false, updated_by = ${by} where job_id = ${t.job_id} and req_key = ${r.req_key}`;
  }
  await logActivity(tx, { person: by, table: "tasks", rowId: id, jobId: t.job_id ? Number(t.job_id) : null, action: "delete", changes: { title: [t.title, null] } });
}
