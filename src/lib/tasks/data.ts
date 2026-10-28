import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { builtIn, lockReason, REQ_STAGES, taskCategory } from "@/lib/requirements";
import { jobTitle } from "@/lib/jobs/stages";
import { builtInTypes, customTypes } from "./requirement-types";
import type { PickerTile, TaskStatus, TaskView } from "./types";

type Row = {
  id: string; job_id: string | null; job_no: string | null; sm8_description: string | null; client: string | null;
  title: string; notes: string | null; status: TaskStatus; in_hand_note: string | null; in_hand_by: string | null; in_hand_at: Date | null;
  assignee_id: string | null; assignee: string | null; due_on: Date | string | null; done_at: Date | null; done_by: string | null;
  verified_at: Date | null; verified_by: string | null; side: "office" | "site"; submitted_at: Date | null; submitted_by: string | null;
  sent_back_note: string | null; sent_back_at: Date | null; sent_back_by: string | null; req_key: string | null; stage: string | null;
  repeat_no: number | null; is_repeat: boolean; created_at: Date; created_by: string | null; custom_name: string | null; custom_side: string | null;
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);
const day = (d: Date | string | null) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : null);

function view(r: Row): TaskView {
  return {
    id: Number(r.id),
    jobId: r.job_id ? Number(r.job_id) : null,
    jobNo: r.job_no,
    jobTitle: r.job_no ? jobTitle(r.sm8_description) : null,
    client: r.client,
    title: r.title,
    notes: r.notes || "",
    status: r.status,
    inHandNote: r.in_hand_note || "",
    inHandBy: r.in_hand_by,
    inHandAt: iso(r.in_hand_at),
    assigneeId: r.assignee_id ? Number(r.assignee_id) : null,
    assignee: r.assignee,
    dueOn: day(r.due_on),
    doneAt: iso(r.done_at),
    doneBy: r.done_by,
    verifiedAt: iso(r.verified_at),
    verifiedBy: r.verified_by,
    side: r.side,
    submittedAt: iso(r.submitted_at),
    submittedBy: r.submitted_by,
    sentBackNote: r.sent_back_note,
    sentBackAt: iso(r.sent_back_at),
    sentBackBy: r.sent_back_by,
    reqKey: r.req_key,
    stage: r.stage,
    category: taskCategory(r.req_key, (r.custom_side as "office" | "site") || r.side),
    repeatNo: r.repeat_no,
    isRepeat: r.is_repeat,
    page: r.req_key ? builtIn(r.req_key)?.page ?? null : null,
    createdAt: r.created_at.toISOString(),
    createdBy: r.created_by,
  };
}

function select(sql: postgres.Sql | postgres.TransactionSql) {
  return sql`
    select t.*, j.job_no, j.sm8_description, c.name as client, p.name as assignee,
           rt.name as custom_name, rt.side as custom_side
    from tasks t
    left join jobs j on j.id = t.job_id
    left join clients c on c.id = j.client_id
    left join people p on p.id = t.assignee_id
    left join requirement_types rt on t.req_key = 'custom:' || rt.id`;
}

export async function getTask(id: number): Promise<TaskView | null> {
  const sql = await readDb();
  const [r] = await sql<Row[]>`${select(sql)} where t.id = ${id} and t.removed_at is null`;
  return r ? view(r) : null;
}

// For the Actions board (and, later, the TV: always this full list, never a device's filters):
// every live task that isn't done, plus tasks done in the last `doneDays` days (all done tasks if null).
export async function listTasks(opts: { jobId?: number; doneDays?: number | null } = {}): Promise<TaskView[]> {
  const sql = await readDb();
  const doneDays = opts.doneDays === undefined ? 7 : opts.doneDays;
  const rows = await sql<Row[]>`
    ${select(sql)}
    where t.removed_at is null
      ${opts.jobId ? sql`and t.job_id = ${opts.jobId}` : sql``}
      and (t.status <> 'done' ${doneDays === null ? sql`or true` : sql`or t.done_at > now() - make_interval(days => ${doneDays})`})
    order by (t.due_on is not null and t.due_on < current_date and t.status <> 'done') desc,
             t.due_on nulls last, j.job_no nulls last, t.id`;
  return rows.map(view);
}

export async function taskFiles(taskId: number) {
  const sql = await readDb();
  const rows = await sql<{ id: string; name: string; mime: string | null; storage: string; size_bytes: string | null }[]>`
    select id, name, mime, storage, size_bytes from files where entity_table = 'tasks' and entity_id = ${taskId} order by id desc`;
  return rows.map((f) => ({ id: Number(f.id), name: f.name, mime: f.mime || "", storage: f.storage, size: Number(f.size_bytes || 0) }));
}

export async function taskHistory(taskId: number) {
  const sql = await readDb();
  const rows = await sql<{ at: Date; person_name: string; action: string; changes: Record<string, [unknown, unknown]> | null }[]>`
    select created_at as at, person_name, action, changes from activity_log
    where table_name = 'tasks' and row_id = ${taskId} order by id desc limit 30`;
  return rows.map((r) => ({ at: r.at.toISOString(), by: r.person_name, action: r.action, changes: r.changes || {} }));
}

export async function activePeople() {
  const sql = await readDb();
  const rows = await sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`;
  return rows.map((p) => ({ id: Number(p.id), name: p.name }));
}

// The + New task tiles for a job, with each requirement's state on that job.
export async function pickerTiles(job: { id: number; stage: string; jobType: string } | null): Promise<PickerTile[]> {
  const types = [...builtInTypes(), ...(await customTypes())];
  const counts = new Map<string, { open: number; done: number; liveId: number | null; liveDone: boolean }>();
  if (job) {
    const sql = await readDb();
    const rows = await sql<{ req_key: string; id: string; status: string; is_repeat: boolean }[]>`
      select req_key, id, status, is_repeat from tasks
      where job_id = ${job.id} and req_key is not null and removed_at is null and system_key is null order by id`;
    for (const r of rows) {
      const c = counts.get(r.req_key) || { open: 0, done: 0, liveId: null, liveDone: false };
      if (r.status === "done") c.done++;
      else c.open++;
      if (!r.is_repeat) {
        c.liveId = Number(r.id);
        c.liveDone = r.status === "done";
      }
      counts.set(r.req_key, c);
    }
  }
  const order = new Map(REQ_STAGES.map((s, i) => [s.key, i]));
  return types
    .map((t) => {
      const c = counts.get(t.key);
      const state: PickerTile["state"] = t.repeatable || !c?.liveId ? "available" : c.liveDone ? "done" : "on";
      return {
        key: t.key, label: t.label, stage: t.stage, side: t.side, repeatable: t.repeatable, cdm: t.cdm,
        state, taskId: t.repeatable ? null : c?.liveId ?? null, open: c?.open ?? 0, done: c?.done ?? 0,
        lock: job ? lockReason(t, job) : null,
      };
    })
    .sort((a, b) => (order.get(a.stage as never) ?? 9) - (order.get(b.stage as never) ?? 9));
}
