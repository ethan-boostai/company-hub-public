"use server";

import { db } from "@/lib/db";
import { formText, guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { logActivity } from "@/lib/activity";
import { isLiveSite } from "@/lib/preview-only";

import type { DemoNote } from "./data";
export type { DemoNote } from "./data";

import { DEMO_LIST as LIST } from "./data";

// Test save for the single-save button. Notes are stored as options in a "demo.notes" list.
export async function saveDemoNote(form: FormData): Promise<ActionResult<DemoNote>> {
  if (isLiveSite()) return { ok: false, message: "Shared parts is on previews only." };
  const text = formText(form, "text");
  if (!text) return { ok: false, message: "Type a note first.", fieldErrors: { text: "Type a note first." } };
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    // Slow on purpose, so a double click lands while the first save is still running.
    await new Promise((r) => setTimeout(r, 800));
    const stamp = `${text} (${new Date().toLocaleTimeString("en-GB", { timeZone: "Europe/London" })})`;
    const row = await db().begin(async (tx) => {
      const [r] = await tx<{ id: string }[]>`
        insert into select_options (list, value, created_by) values (${LIST}, ${stamp}, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "select_options", rowId: Number(r.id), action: "create", changes: { [LIST]: [null, stamp] } });
      return r;
    });
    return { ok: true, message: "Saved once.", data: { id: Number(row.id), text: stamp, by: person.name } };
  });
}

export async function deleteDemoNote(id: number, requestKey: string): Promise<ActionResult> {
  if (isLiveSite()) return { ok: false, message: "Shared parts is on previews only." };
  return guarded(requestKey, async (person) => {
    await db().begin(async (tx) => {
      const [r] = await tx<{ value: string }[]>`delete from select_options where id = ${id} and list = ${LIST} returning value`;
      if (r) await logActivity(tx, { person: person.name, table: "select_options", rowId: id, action: "delete", changes: { [LIST]: [r.value, null] } });
    });
    return { ok: true };
  });
}
