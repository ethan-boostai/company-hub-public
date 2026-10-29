"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { canSeeTimeOff } from "../data";
import { forLog, FormValues } from "../../_registers/form-values";
import { loadTimeOff, type TimeOffData } from "./data";
import { isWaiting, PART_DAYS, STATUSES, workingDays, type PartDay, type Status } from "./rules";

// Every save hands back the whole register as it now is and the id of the record to show.
export type Saved = { all: TimeOffData; id: number | null };

const NO_ACCESS = { ok: false as const, message: "You don't have access to Time off. Ask for the Time off tick on People." };
const GONE = { ok: false as const, message: "That record no longer exists. Refresh the page." };
class Missing extends Error {}
const values = <T extends { value: string }>(list: readonly T[]) => list.map((o) => o.value) as T["value"][];

const FIELDS = ["person_id", "kind", "from_date", "to_date", "part_day", "days", "days_overridden", "notes", "status", "response"];
// Notes and responses can hold health details: the activity log says they changed, never what they say.
function privateChanges(changes: Record<string, [unknown, unknown]>) {
  for (const k of ["notes", "response"]) {
    if (changes[k]) changes[k] = [changes[k][0] ? "(text)" : null, changes[k][1] ? "(changed)" : null];
  }
  return changes;
}

export async function saveTimeOff(form: FormData): Promise<ActionResult<Saved>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const personId = f.id("person_id");
  if (!personId) f.errors.person_id = "Choose the person.";
  const kind = f.required("kind", "Choose the type of time off.", 120);
  const from = f.date("from_date");
  if (!from && !f.errors.from_date) f.errors.from_date = "Enter the first day off.";
  const to = f.date("to_date") ?? from;
  if (from && to && to < from) f.errors.to_date = "The last day is before the first day.";
  const part = f.oneOf<PartDay>("part_day", values(PART_DAYS), "full");
  if (part !== "full" && from && to && from !== to) f.errors.part_day = "Morning or afternoon only works for a single day.";
  const status = f.oneOf<Status>("status", values(STATUSES), "pending");
  const typed = f.text("days", 10);
  let days: number | null = null;
  if (typed) {
    const n = Number(typed);
    if (!Number.isFinite(n) || n < 0 || n > 366 || Math.round(n * 2) !== n * 2) f.errors.days = "Enter the working days, e.g. 3 or 2.5.";
    else days = n;
  }
  const notes = f.text("notes", 4000);
  const response = f.text("response", 4000);
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };

  const auto = workingDays(from!, to!, part).days;
  const v = {
    person_id: personId, kind, from_date: from, to_date: to, part_day: part, days: days ?? auto, days_overridden: days != null && days !== auto,
    notes, status, response,
  };

  return guarded<Saved>(form.get(REQUEST_KEY_FIELD), async (person) => {
    if (!(await canSeeTimeOff(person.id))) return NO_ACCESS;
    try {
      const rowId = await db().begin(async (tx) => {
        const [who] = await tx`select id from people where id = ${personId}`;
        if (!who) throw new Missing();
        const decided = isWaiting(status) ? { decided_by: null, decided_at: null } : null;
        if (id) {
          const [before] = await tx`select ${tx(FIELDS)} from time_off where id = ${id} for update`;
          if (!before) throw new Missing();
          await tx`update time_off set ${tx(v)}, updated_by = ${person.name} where id = ${id}`;
          // Who decided and when follow the status: set when it's approved or declined, cleared if it waits again.
          if (decided) await tx`update time_off set decided_by = null, decided_at = null where id = ${id}`;
          else if (before.status !== status) await tx`update time_off set decided_by = ${person.name}, decided_at = now() where id = ${id}`;
          const changes = privateChanges(diff(forLog(before), v, FIELDS));
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "time_off", rowId: id, action: "update", changes });
          return id;
        }
        const [r] = await tx<{ id: string }[]>`insert into time_off ${tx({ ...v, source: "office", created_by: person.name })} returning id`;
        if (!decided) await tx`update time_off set decided_by = ${person.name}, decided_at = now() where id = ${r.id}`;
        await logActivity(tx, { person: person.name, table: "time_off", rowId: Number(r.id), action: "create", changes: privateChanges(diff(null, v, FIELDS)) });
        return Number(r.id);
      });
      return { ok: true, message: "Saved.", data: { all: await loadTimeOff(db()), id: rowId } };
    } catch (e) {
      if (e instanceof Missing) return GONE;
      throw e;
    }
  });
}

// Deletes one time off record. Files stay in SharePoint.
export async function deleteTimeOff(id: number, requestKey: string): Promise<ActionResult<Saved>> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded<Saved>(requestKey, async (person) => {
    if (!(await canSeeTimeOff(person.id))) return NO_ACCESS;
    const gone = await db().begin(async (tx) => {
      const [before] = await tx`select person_id, kind, from_date, to_date, status from time_off where id = ${id} for update`;
      if (!before) return true;
      await tx`delete from time_off where id = ${id}`;
      const snapshot = Object.fromEntries(Object.entries(forLog(before)).map(([k, val]) => [k, [val, null] as [unknown, unknown]]));
      await logActivity(tx, { person: person.name, table: "time_off", rowId: id, action: "delete", changes: snapshot });
      return false;
    });
    if (gone) return GONE;
    return { ok: true, message: "Deleted.", data: { all: await loadTimeOff(db()), id: null } };
  });
}
