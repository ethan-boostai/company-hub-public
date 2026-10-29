"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { SharePointError, UNREACHABLE } from "@/lib/files/sharepoint";
import { uploadBytes } from "@/lib/files/server-upload";
import { taskFolder } from "@/lib/requirements";
import { fromTemplate, missingForIssue, normalise, ramsFileName, ramsNo, toTemplate, type JobTypeTemplate, type RamsContent } from "@/lib/rams/content";
import { jobTypes, libraryHazards, ramsQuery, type RamsRow } from "@/lib/rams/data";
import { buildRamsPdf } from "@/lib/rams/pdf";
import { SignError, signOn } from "@/lib/signons/service";
import type { SignPayload } from "@/components/signons/sign-on-form";
import { ramsKey as keyFor } from "../../../safety/rules";

const GONE = { ok: false as const, message: "That RAMS no longer exists. Refresh the page." };
const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const idOrNull = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

async function one(id: number): Promise<RamsRow | null> {
  const [r] = await ramsQuery(db(), { id });
  return r ?? null;
}

async function jobFor(jobNo: string): Promise<{ id: number; site: string; client: string; stage: string } | null> {
  const [j] = await db()<{ id: string; site_address: string | null; client: string | null; stage: string }[]>`
    select j.id, j.site_address, c.name as client, j.stage from jobs j left join clients c on c.id = j.client_id where j.job_no = ${jobNo}`;
  return j ? { id: Number(j.id), site: j.site_address ?? "", client: j.client ?? "", stage: j.stage } : null;
}

// + New > CBS RAMS: a new draft on this job, from a job type (or blank).
export async function createRams(jobNo: string, templateKey: string | null, requestKey: string): Promise<ActionResult<{ id: number }>> {
  return guarded(requestKey, async (person) => {
    const job = await jobFor(jobNo);
    if (!job) return { ok: false, message: "That job isn't in the hub." };
    if (job.stage === "estimate") return { ok: false, message: "RAMS unlock once the job is approved." };
    const sql = db();
    const types = await jobTypes(sql);
    const t = templateKey ? types.find((x) => x.key === templateKey) : undefined;
    const start = fromTemplate((t?.template ?? {}) as Partial<JobTypeTemplate>, await libraryHazards(sql), job.site);
    const id = await sql.begin(async (tx) => {
      const [{ seq }] = await tx<{ seq: number }[]>`select coalesce(max(seq), 0) + 1 as seq from rams where job_id = ${job.id}`;
      const [r] = await tx<{ id: string }[]>`
        insert into rams (job_id, kind, seq, revision, status, title, template_key, data, prepared_by_id, dated, created_by)
        values (${job.id}, 'cbs', ${seq}, 1, 'draft', ${start.title || (t ? t.name : "New RAMS")}, ${t?.key ?? null}, ${tx.json(start.content as never)},
                ${person.id}, current_date, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: Number(r.id), jobId: job.id, action: "create", changes: { rams: [null, `${ramsNo(jobNo, seq)} rev 1`], job_type: [null, t?.name ?? "blank"] } });
      return Number(r.id);
    });
    return { ok: true, data: { id } };
  });
}

export type RamsDraft = { title: string; preparedById: number | null; approvedById: number | null; approverRole: string; dated: string | null; notes: string; content: RamsContent };

// Save draft. Issued and superseded revisions can't be changed (start a new revision).
export async function saveRams(id: number, draft: RamsDraft, requestKey: string): Promise<ActionResult<RamsRow>> {
  const title = clean(draft.title, 200);
  if (!title) return { ok: false, message: "Enter the activity.", fieldErrors: { title: "Enter the activity." } };
  const dated = draft.dated && /^\d{4}-\d{2}-\d{2}$/.test(draft.dated) ? draft.dated : null;
  const content = normalise(draft.content);
  return guarded(requestKey, async (person) => {
    const sql = db();
    const r = await sql.begin(async (tx) => {
      const [before] = await tx<{ status: string; job_id: string }[]>`select status, job_id from rams where id = ${id} for update`;
      if (!before) return "gone";
      if (before.status !== "draft") return "fixed";
      await tx`update rams set title = ${title}, prepared_by_id = ${idOrNull(draft.preparedById)}, approved_by_id = ${idOrNull(draft.approvedById)},
                 approver_role = ${clean(draft.approverRole, 80) || null}, dated = ${dated}, notes = ${String(draft.notes ?? "").slice(0, 4000) || null},
                 data = ${tx.json(content as never)}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: id, jobId: Number(before.job_id), action: "update", changes: { draft: [null, "saved"] } });
      return "ok";
    }).catch((e) => {
      if ((e as { code?: string }).code === "23503") return "person";
      throw e;
    });
    if (r === "gone") return GONE;
    if (r === "fixed") return { ok: false, message: "This revision is issued, so it can't be changed. Start a new revision." };
    if (r === "person") return { ok: false, message: "A person you chose is no longer on the team. Choose another." };
    return { ok: true, message: "Saved.", data: (await one(id))! };
  });
}

// Issue: the PDF in the house format, saved in the job's RAMS folder as its own file. The revision
// before (if any) becomes Superseded. Signing opens for this revision.
export async function issueRams(id: number, requestKey: string): Promise<ActionResult<RamsRow>> {
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r || r.kind !== "cbs") return GONE;
    if (r.status !== "draft") return { ok: false, message: "This revision has already been issued." };
    const missing = missingForIssue({ title: r.title, preparedById: r.preparedById, approvedById: r.approvedById, content: r.content });
    if (missing.length) return { ok: false, message: `Before it can be issued it needs ${missing.join(", ")}.` };
    const sql = db();
    const job = await jobFor(r.jobNo);
    const subs = r.content.coshh.length
      ? await sql<{ product: string; supplier: string | null }[]>`select su.product, sp.name as supplier from substances su left join suppliers sp on sp.id = su.supplier_id where su.id = any(${r.content.coshh}) order by lower(su.product)`
      : [];
    let fileId: number;
    const now = new Date().toISOString();
    try {
      const bytes = await buildRamsPdf({ ...r, issuedAt: now, issuedBy: person.name }, { site: job?.site ?? "", client: job?.client ?? "", substances: subs.map((s) => ({ name: s.product, supplier: s.supplier ?? "" })) });
      const saved = await uploadBytes({ folder: taskFolder(r.jobNo, "rams"), name: ramsFileName(r.jobNo, r.seq, r.revision, r.title), bytes, mime: "application/pdf",
        entityTable: "rams", entityId: id, jobId: r.jobId, role: "rams-pdf", createdBy: person.name });
      fileId = saved.id;
    } catch (e) {
      if (!(e instanceof SharePointError)) console.error("RAMS issue failed", e);
      return { ok: false, message: `It wasn't issued: ${e instanceof SharePointError ? e.message : UNREACHABLE}` };
    }
    const ok = await sql.begin(async (tx) => {
      const [still] = await tx<{ status: string }[]>`select status from rams where id = ${id} for update`;
      if (still?.status !== "draft") return false;
      const prev = await tx<{ id: string; revision: number }[]>`update rams set status = 'superseded', updated_at = now(), updated_by = ${person.name}
        where job_id = ${r.jobId} and seq = ${r.seq} and status = 'issued' returning id, revision`;
      await tx`update rams set status = 'issued', file_id = ${fileId}, issued_at = ${now}, issued_by = ${person.name}, dated = coalesce(dated, current_date),
                 updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: id, jobId: r.jobId, action: "update", changes: { status: ["draft", "issued"] } });
      for (const p of prev) await logActivity(tx, { person: person.name, table: "rams", rowId: Number(p.id), jobId: r.jobId, action: "update", changes: { status: ["issued", "superseded"] } });
      return true;
    });
    if (!ok) return { ok: false, message: "This revision has already been issued." };
    return { ok: true, message: `RAMS ${ramsNo(r.jobNo, r.seq)} rev ${r.revision} issued.`, data: (await one(id))! };
  });
}

// New revision: a draft copy of this RAMS, revision + 1, needing approval (and signing) again.
export async function newRevision(id: number, requestKey: string): Promise<ActionResult<{ id: number }>> {
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r || r.kind !== "cbs") return GONE;
    const sql = db();
    const [draft] = await sql<{ id: string }[]>`select id from rams where job_id = ${r.jobId} and seq = ${r.seq} and status = 'draft'`;
    if (draft) return { ok: true, message: "There's already a draft revision.", data: { id: Number(draft.id) } };
    const newId = await sql.begin(async (tx) => {
      const [{ rev }] = await tx<{ rev: number }[]>`select max(revision) + 1 as rev from rams where job_id = ${r.jobId} and seq = ${r.seq}`;
      const [n] = await tx<{ id: string }[]>`
        insert into rams (job_id, kind, seq, revision, status, title, template_key, data, prepared_by_id, approved_by_id, approver_role, dated, notes, created_by)
        values (${r.jobId}, 'cbs', ${r.seq}, ${rev}, 'draft', ${r.title}, ${r.templateKey || null}, ${tx.json(r.content as never)}, ${person.id}, null,
                ${r.approverRole || null}, current_date, ${r.notes || null}, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: Number(n.id), jobId: r.jobId, action: "create", changes: { rams: [null, `${ramsNo(r.jobNo, r.seq)} rev ${rev}`] } });
      return Number(n.id);
    });
    return { ok: true, data: { id: newId } };
  });
}

export async function deleteRamsDraft(id: number, requestKey: string): Promise<ActionResult<{ jobNo: string }>> {
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r) return GONE;
    if (r.kind === "cbs" && r.status !== "draft") return { ok: false, message: "Only drafts can be deleted. An issued RAMS stays on record." };
    await db().begin(async (tx) => {
      await tx`delete from rams where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: id, jobId: r.jobId, action: "delete", changes: { rams: [`${ramsNo(r.jobNo, r.seq)} rev ${r.revision}`, null] } });
    });
    return { ok: true, data: { jobNo: r.jobNo } };
  });
}

// Sign on in the office (this device), for the current issued revision.
export async function officeSignOn(id: number, p: SignPayload, requestKey: string): Promise<{ ok: boolean; message?: string }> {
  const r = await guarded(requestKey, async (person) => {
    try {
      const s = await signOn({ docType: "rams", docId: id, ...p, via: "office", by: person.name });
      return { ok: true as const, message: s.note ?? "Signed." };
    } catch (e) {
      if (e instanceof SignError) return { ok: false as const, message: e.message };
      throw e;
    }
  });
  return { ok: r.ok, message: r.message };
}

// "+ Add hazard" in the builder, with "Also add to the hazards library" ticked.
export async function addLibraryHazard(h: { name: string; harm: string; controls: string; il: number; ic: number; rl: number; rc: number; codes: string[] }, source: string, requestKey: string): Promise<ActionResult<{ ramsKey: string }>> {
  const name = clean(h.name, 200);
  if (!name) return { ok: false, message: "Enter the hazard." };
  const s5 = (v: number) => (Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
  return guarded(requestKey, async (person) => {
    const sql = db();
    const [exists] = await sql<{ rams_key: string }[]>`select rams_key from hazards where lower(hazard) = lower(${name})`;
    if (exists) return { ok: true, message: "It's already in the hazards library.", data: { ramsKey: exists.rams_key } };
    const base = keyFor(name);
    const taken = new Set((await sql<{ k: string }[]>`select rams_key as k from hazards where rams_key like ${base + "%"}`).map((r) => r.k));
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 55)}_${i}`;
    const codes = ["E", "S", "I", "G", "A", "P"].filter((c) => (h.codes ?? []).includes(c));
    await sql.begin(async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        insert into hazards (hazard, harm, controls, likelihood, consequence, residual_likelihood, residual_consequence, control_codes, rams_key, source, review_on, created_by)
        values (${name}, ${String(h.harm ?? "").slice(0, 2000) || null}, ${String(h.controls ?? "").slice(0, 6000) || null}, ${s5(h.il)}, ${s5(h.ic)}, ${s5(h.rl)}, ${s5(h.rc)},
                ${codes}, ${key}, ${clean(source, 120) || "RAMS"}, (current_date + interval '1 year')::date, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "hazards", rowId: Number(r.id), action: "create", changes: { hazard: [null, name], source: [null, source] } });
    });
    return { ok: true, message: "Added to the hazards library.", data: { ramsKey: key } };
  });
}

// "Save as job type": the RAMS content as a new job type under Templates.
export async function saveAsJobType(id: number, name: string, requestKey: string): Promise<ActionResult<{ key: string }>> {
  const nm = clean(name, 120);
  if (!nm) return { ok: false, message: "Give the job type a name." };
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r) return GONE;
    const sql = db();
    const base = keyFor(nm);
    const taken = new Set((await sql<{ k: string }[]>`select key as k from rams_templates where key like ${base + "%"}`).map((x) => x.k));
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 55)}_${i}`;
    const template = toTemplate(r.title, r.content);
    try {
      await sql.begin(async (tx) => {
        const [t] = await tx<{ id: string }[]>`insert into rams_templates (key, name, template, created_by) values (${key}, ${nm}, ${tx.json(template as never)}, ${person.name}) returning id`;
        await logActivity(tx, { person: person.name, table: "rams_templates", rowId: Number(t.id), action: "create", changes: { name: [null, nm], from: [null, `RAMS ${ramsNo(r.jobNo, r.seq)}`] } });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { ok: false, message: "There's already a job type with that name." };
      throw e;
    }
    return { ok: true, message: `Saved as the job type "${nm}".`, data: { key } };
  });
}

/* ---------- Subcontractor RAMS ---------- */

// The subcontractor is chosen from the register, or added there by name from this form.
export async function createSubRams(jobNo: string, sub: { id: number | null; newName?: string }, title: string, requestKey: string): Promise<ActionResult<{ id: number }>> {
  const t = clean(title, 200);
  if (!t) return { ok: false, message: "Enter what the RAMS covers." };
  const newName = clean(sub.newName, 200);
  if (!newName && !idOrNull(sub.id)) return { ok: false, message: "Choose the subcontractor." };
  return guarded(requestKey, async (person) => {
    const job = await jobFor(jobNo);
    if (!job) return { ok: false, message: "That job isn't in the hub." };
    const id = await db().begin(async (tx) => {
      let subId = idOrNull(sub.id);
      if (newName) {
        const [found] = await tx<{ id: string }[]>`select id from subcontractors where lower(company) = lower(${newName})`;
        if (found) subId = Number(found.id);
        else {
          const [n] = await tx<{ id: string }[]>`insert into subcontractors (company, created_by) values (${newName}, ${person.name}) returning id`;
          subId = Number(n.id);
          await logActivity(tx, { person: person.name, table: "subcontractors", rowId: subId, action: "create", changes: { company: [null, newName] } });
        }
      }
      const [{ seq }] = await tx<{ seq: number }[]>`select coalesce(max(seq), 0) + 1 as seq from rams where job_id = ${job.id}`;
      const [r] = await tx<{ id: string }[]>`
        insert into rams (job_id, kind, seq, revision, status, title, subcontractor_id, review_status, created_by)
        values (${job.id}, 'subcontractor', ${seq}, 1, 'draft', ${t}, ${subId}, 'pending', ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: Number(r.id), jobId: job.id, action: "create", changes: { subcontractor_rams: [null, t] } });
      return Number(r.id);
    });
    return { ok: true, data: { id } };
  });
}

export async function setSubRamsFile(id: number, fileId: number, requestKey: string): Promise<ActionResult<RamsRow>> {
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r || r.kind !== "subcontractor") return GONE;
    const sql = db();
    const [f] = await sql<{ name: string }[]>`select name from files where id = ${fileId} and entity_table = 'rams' and entity_id = ${id}`;
    if (!f) return { ok: false, message: "The upload wasn't found. Try again." };
    await sql.begin(async (tx) => {
      await tx`update rams set file_id = ${fileId}, review_status = 'pending', updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      if (r.fileId && r.fileId !== fileId) await tx`update files set superseded_by = ${fileId} where id = ${r.fileId}`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: id, jobId: r.jobId, action: "update", changes: { file: [r.fileName || null, f.name] } });
    });
    return { ok: true, message: "File added. Review it, then approve or reject.", data: (await one(id))! };
  });
}

export async function reviewSubRams(id: number, status: "approved" | "rejected" | "pending", note: string, requestKey: string): Promise<ActionResult<RamsRow>> {
  if (!["approved", "rejected", "pending"].includes(status)) return { ok: false, message: "Unknown status." };
  if (status === "rejected" && !clean(note, 1000)) return { ok: false, message: "Say why it's rejected, so the subcontractor knows what to change." };
  return guarded(requestKey, async (person) => {
    const r = await one(id);
    if (!r || r.kind !== "subcontractor") return GONE;
    if (status === "approved" && !r.fileId) return { ok: false, message: "Upload the subcontractor's RAMS first." };
    await db().begin(async (tx) => {
      await tx`update rams set review_status = ${status}, review_note = ${clean(note, 1000) || null}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "rams", rowId: id, jobId: r.jobId, action: "update", changes: { review_status: [r.reviewStatus, status] } });
    });
    return { ok: true, message: "Saved.", data: (await one(id))! };
  });
}
