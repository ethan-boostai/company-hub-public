"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { restamp } from "@/lib/signons/service";
import { loadSignOns, type SignOnRow } from "./data";

const ids = (v: number[]) => v.filter((n) => Number.isInteger(n) && n > 0).slice(0, 500);

// The office has looked at these sign-ons (Needs attention lists the ones not yet reviewed).
export async function markReviewed(jobId: number, signOnIds: number[], requestKey: string): Promise<ActionResult<SignOnRow[]>> {
  return guarded(requestKey, async (person) => {
    const list = ids(signOnIds);
    await db().begin(async (tx) => {
      const done = await tx<{ id: string }[]>`update sign_ons set reviewed = true, reviewed_by = ${person.name}, reviewed_at = now()
                                              where job_id = ${jobId} and id = any(${list}) and not reviewed returning id`;
      for (const r of done) await logActivity(tx, { person: person.name, table: "sign_ons", rowId: Number(r.id), jobId, action: "update", changes: { reviewed: [false, true] } });
    });
    return { ok: true, message: "Marked as reviewed.", data: await loadSignOns(jobId, db()) };
  });
}

// Removes a sign-on (after the in-app are-you-sure). The document's signed copy is made again without it.
export async function deleteSignOn(jobId: number, id: number, requestKey: string): Promise<ActionResult<SignOnRow[]>> {
  return guarded(requestKey, async (person) => {
    const gone = await db().begin(async (tx) => {
      const [s] = await tx<{ doc_type: string; doc_id: string; name: string; doc_label: string | null }[]>`
        delete from sign_ons where id = ${id} and job_id = ${jobId} returning doc_type, doc_id, name, doc_label`;
      if (!s) return null;
      await logActivity(tx, { person: person.name, table: "sign_ons", rowId: id, jobId, action: "delete", changes: { name: [s.name, null], document: [s.doc_label, null] } });
      return s;
    });
    if (!gone) return { ok: false, message: "That sign-on was already removed. Refresh the page." };
    const note = await restamp(gone.doc_type, Number(gone.doc_id), person.name);
    return { ok: true, message: note ?? "Sign-on removed.", data: await loadSignOns(jobId, db()) };
  });
}
