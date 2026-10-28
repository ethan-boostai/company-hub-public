"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { formText, guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { customKey } from "@/lib/requirements";

const STAGES = ["estimate", "approved_planning", "approved_onsite", "completed"];

export async function saveRequirementType(form: FormData): Promise<ActionResult> {
  return guarded(form.get("_rk"), async (person) => {
    const id = /^\d+$/.test(formText(form, "id")) ? Number(formText(form, "id")) : null;
    const name = formText(form, "name").replace(/\s+/g, " ").slice(0, 80);
    const stage = formText(form, "stage");
    const side = formText(form, "side") === "site" ? "site" : "office";
    const repeatable = form.get("repeatable") === "on";
    const active = id ? form.get("active") === "on" : true;
    if (!name) return { ok: false, message: "Give the type a name.", fieldErrors: { name: "Give the type a name." } };
    if (!STAGES.includes(stage)) return { ok: false, message: "Pick a stage." };
    const sql = db();
    try {
      await sql.begin(async (tx) => {
        if (id) {
          const [before] = await tx`select name, stage, side, repeatable, active from requirement_types where id = ${id} for update`;
          if (!before) throw new Error("gone");
          await tx`update requirement_types set name = ${name}, stage = ${stage}, side = ${side}, repeatable = ${repeatable}, active = ${active}, updated_by = ${person.name} where id = ${id}`;
          await logActivity(tx, { person: person.name, table: "requirement_types", rowId: id, action: "update",
            changes: { name: [before.name, name], stage: [before.stage, stage], side: [before.side, side], repeatable: [before.repeatable, repeatable], active: [before.active, active] } });
        } else {
          const [row] = await tx`insert into requirement_types (name, stage, side, repeatable, created_by) values (${name}, ${stage}, ${side}, ${repeatable}, ${person.name}) returning id`;
          await logActivity(tx, { person: person.name, table: "requirement_types", rowId: Number(row.id), action: "create", changes: { name: [null, name] } });
        }
      });
    } catch (e) {
      if (String((e as { code?: string }).code) === "23505") return { ok: false, message: "There's already a type with that name.", fieldErrors: { name: "Already used." } };
      return { ok: false, message: "That didn't save. Try again." };
    }
    revalidatePath("/settings/requirement-types");
    return { ok: true, message: id ? "Saved." : "Type added." };
  });
}

// Delete only if no job has ever used it (otherwise switch it off instead).
export async function deleteRequirementType(id: number, requestKey: string): Promise<ActionResult> {
  return guarded(requestKey, async (person) => {
    const key = customKey(id);
    const [used] = await db()`select (select count(*) from tasks where req_key = ${key}) + (select count(*) from job_requirements where req_key = ${key}) as n`;
    if (Number(used.n) > 0) return { ok: false, message: "This type has been used on a job. Switch it off instead; its tasks stay." };
    await db().begin(async (tx) => {
      const [row] = await tx`delete from requirement_types where id = ${id} returning name`;
      if (row) await logActivity(tx, { person: person.name, table: "requirement_types", rowId: id, action: "delete", changes: { name: [row.name, null] } });
    });
    revalidatePath("/settings/requirement-types");
    return { ok: true };
  });
}
