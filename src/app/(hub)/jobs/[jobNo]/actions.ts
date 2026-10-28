"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formText, guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { STAGES, type Stage } from "@/lib/jobs/stages";
import { Sm8Error, writeToServiceM8 } from "@/lib/sm8/write";

type JobRow = { id: string; sm8_uuid: string; job_no: string; sm8_status: string | null; sm8_folder_uuid: string | null; job_type: string };

async function findJob(jobNo: string): Promise<JobRow | null> {
  if (!/^\d{1,10}$/.test(jobNo)) return null;
  const [j] = await db()<JobRow[]>`select id, sm8_uuid, job_no, sm8_status, sm8_folder_uuid, job_type from jobs where job_no = ${jobNo}`;
  return j ?? null;
}
const cleanNote = (n: unknown) => String(n || "").replace(/\s+/g, " ").trim().slice(0, 500);

// Folder change: any folder to any folder, no reason needed. Sent to ServiceM8 first; the hub copy
// updates straight away and ServiceM8's own webhook confirms it.
export async function moveJobFolder(jobNo: string, folderUuid: string, note: string, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    const job = await findJob(jobNo);
    if (!job) return { ok: false, message: "Job not found." };
    const [folder] = await db()<{ sm8_uuid: string; name: string; default_days: number | null }[]>`
      select sm8_uuid, name, default_days from sm8_folders where sm8_uuid = ${folderUuid} and active`;
    if (!folder) return { ok: false, message: "That folder isn't in ServiceM8 any more. Reload the page." };
    if (folder.sm8_uuid === job.sm8_folder_uuid) return { ok: true, message: "Already in that folder." };
    try {
      await writeToServiceM8({ action: "set_folder", job_uuid: job.sm8_uuid, folder_uuid: folder.sm8_uuid, days: 365, note: cleanNote(note), by: person.name });
    } catch (e) {
      return { ok: false, message: e instanceof Sm8Error ? e.message : "ServiceM8 didn't accept the change." };
    }
    await db().begin(async (tx) => {
      await tx`update jobs set sm8_folder_uuid = ${folder.sm8_uuid}, updated_by = ${person.name} where id = ${job.id}`;
      await tx`insert into job_moves (job_id, kind, source, from_value, to_value, note, by)
               values (${job.id}, 'folder', 'hub', ${job.sm8_folder_uuid}, ${folder.sm8_uuid}, ${cleanNote(note) || null}, ${person.name})`;
      await logActivity(tx, { person: person.name, table: "jobs", rowId: Number(job.id), jobId: Number(job.id), action: "update",
        changes: { folder: [job.sm8_folder_uuid, folder.name.trim()] } });
    });
    revalidatePath(`/jobs/${jobNo}`);
    return { ok: true, message: `Moved to ${folder.name.trim()} in ServiceM8.` };
  });
}

// Status change: any status to any status, no reason needed. The folder stays as it is.
export async function setJobStatus(jobNo: string, stage: string, note: string, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    const job = await findJob(jobNo);
    if (!job) return { ok: false, message: "Job not found." };
    if (!(stage in STAGES)) return { ok: false, message: "Pick a status." };
    const sm8 = STAGES[stage as Stage].sm8;
    if (sm8 === job.sm8_status) return { ok: true, message: "Already at that status." };
    try {
      await writeToServiceM8({ action: "set_status", job_uuid: job.sm8_uuid, status: sm8, note: cleanNote(note), by: person.name });
    } catch (e) {
      return { ok: false, message: e instanceof Sm8Error ? e.message : "ServiceM8 didn't accept the change." };
    }
    await db().begin(async (tx) => {
      await tx`update jobs set sm8_status = ${sm8}, stage = ${stage}, updated_by = ${person.name} where id = ${job.id}`;
      await tx`insert into job_moves (job_id, kind, source, from_value, to_value, note, by)
               values (${job.id}, 'status', 'hub', ${job.sm8_status}, ${sm8}, ${cleanNote(note) || null}, ${person.name})`;
      await logActivity(tx, { person: person.name, table: "jobs", rowId: Number(job.id), jobId: Number(job.id), action: "status",
        changes: { status: [job.sm8_status, sm8] } });
    });
    revalidatePath(`/jobs/${jobNo}`);
    return { ok: true, message: `Set to ${STAGES[stage as Stage].label} in ServiceM8.` };
  });
}

// Project / CDM: any time, both ways. Hub only (ServiceM8 doesn't hold the job type).
export async function setJobType(jobNo: string, jobType: string, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    const job = await findJob(jobNo);
    if (!job) return { ok: false, message: "Job not found." };
    if (jobType !== "project" && jobType !== "cdm") return { ok: false, message: "Pick Project or CDM." };
    if (jobType === job.job_type) return { ok: true };
    await db().begin(async (tx) => {
      await tx`update jobs set job_type = ${jobType}, job_type_since = now(), job_type_by = ${person.name}, updated_by = ${person.name} where id = ${job.id}`;
      await tx`insert into job_moves (job_id, kind, source, from_value, to_value, by)
               values (${job.id}, 'type', 'hub', ${job.job_type}, ${jobType}, ${person.name})`;
      await logActivity(tx, { person: person.name, table: "jobs", rowId: Number(job.id), jobId: Number(job.id), action: "update",
        changes: { job_type: [job.job_type, jobType] } });
    });
    revalidatePath(`/jobs/${jobNo}`);
    return { ok: true, message: jobType === "cdm" ? "This is now a CDM job." : "This is now a project." };
  });
}

export async function saveJobNotes(form: FormData): Promise<ActionResult> {
  return guarded(form.get("_rk"), async (person) => {
    const jobNo = formText(form, "jobNo");
    const notes = String(form.get("notes") || "").slice(0, 20000);
    const job = await findJob(jobNo);
    if (!job) return { ok: false, message: "Job not found." };
    await db().begin(async (tx) => {
      const [before] = await tx<{ notes: string | null }[]>`select notes from jobs where id = ${job.id} for update`;
      if ((before?.notes || "") === notes) return;
      await tx`update jobs set notes = ${notes}, updated_by = ${person.name} where id = ${job.id}`;
      await logActivity(tx, { person: person.name, table: "jobs", rowId: Number(job.id), jobId: Number(job.id), action: "update",
        changes: { notes: [before?.notes ? "(earlier notes)" : null, "(notes changed)"] } });
    });
    revalidatePath(`/jobs/${jobNo}`);
    return { ok: true, message: "Notes saved." };
  });
}
