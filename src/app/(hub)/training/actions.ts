"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { forLog, FormValues } from "../_registers/form-values";
import { loadTraining, type TrainingData } from "./data";

// Every save hands back the whole register as it now is and the id of the record to show.
export type Saved = { all: TrainingData; id: number | null };

const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}
const FIELDS = ["person_id", "qualification", "provider", "reference", "issued_on", "expires_on", "notes"];

export async function saveTraining(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const personId = f.id("person_id");
  if (!personId) f.errors.person_id = "Choose the person.";
  const v = {
    person_id: personId,
    qualification: f.required("qualification", "Choose the ticket or qualification.", 120),
    provider: f.text("provider", 160),
    reference: f.text("reference", 80),
    issued_on: f.date("issued_on"),
    expires_on: f.date("expires_on"),
    notes: f.text("notes", 4000),
  };
  if (v.issued_on && v.expires_on && v.expires_on < v.issued_on) f.errors.expires_on = "Expires before it was issued.";
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const rowId = await db().begin(async (tx) => {
        const [who] = await tx`select id from people where id = ${personId}`;
        if (!who) throw new Missing();
        if (id) {
          const [before] = await tx`select ${tx(FIELDS)} from training_records where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update training_records set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          const changes = diff(forLog(before), v, FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "training_records", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into training_records ${tx({ ...v, created_by: person.name })} returning id`;
        await logActivity(tx, { person: person.name, table: "training_records", rowId: Number(r.id), action: "create", changes: diff(null, v, FIELDS) });
        return Number(r.id);
      });
      return { ok: true, message: "Saved.", data: { all: await loadTraining(db()), id: rowId } };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      throw e;
    }
  });
}

// Deletes one training record. Files stay in SharePoint.
export async function deleteTraining(id: number, requestKey: string): Promise<ActionResult<Saved>> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded<Saved>(requestKey, async (person) => {
    const gone = await db().begin(async (tx) => {
      const [before] = await tx`select * from training_records where id = ${id} for update`;
      if (!before) return true;
      await tx`delete from training_records where id = ${id}`;
      const snapshot = Object.fromEntries(
        Object.entries(forLog(before)).filter(([k]) => !["id", "created_at", "updated_at"].includes(k)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]),
      );
      await logActivity(tx, { person: person.name, table: "training_records", rowId: id, action: "delete", changes: snapshot });
      return false;
    });
    if (gone) return GONE;
    return { ok: true, message: "Deleted.", data: { all: await loadTraining(db()), id: null } };
  });
}
