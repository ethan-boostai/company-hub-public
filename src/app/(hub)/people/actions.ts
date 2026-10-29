"use server";

import { db } from "@/lib/db";
import { formText, guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { hashPin, isValidPin } from "@/lib/auth/pin";
import { loadPerson, type PersonRow } from "./data";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELDS = ["name", "role", "mobile", "email", "can_sign_in", "active", "crew", "time_off", "hs_issue"];

export async function savePerson(form: FormData): Promise<ActionResult<PersonRow>> {
  const id = Number(formText(form, "id")) || null;
  const v = {
    name: formText(form, "name").replace(/\s+/g, " "),
    role: formText(form, "role") || null,
    mobile: formText(form, "mobile") || null,
    email: formText(form, "email").toLowerCase() || null,
    can_sign_in: form.get("can_sign_in") === "on",
    active: id ? form.get("active") === "on" : true,
    // The crew list: the same 'crew' entry in people.lists the team app and the training matrix use.
    crew: form.get("crew") === "on",
    // Time off access: 'time_off' in people.lists. Registers uses it to show the Time off tab (sick notes).
    time_off: form.get("time_off") === "on",
    // May issue the H&S policy and manual: 'hs_issue' in people.lists (ZZ Person A on live at switch-over).
    hs_issue: form.get("hs_issue") === "on",
  };
  const fieldErrors: Record<string, string> = {};
  if (!v.name) fieldErrors.name = "Enter a name.";
  if (v.name.length > 80) fieldErrors.name = "Keep the name under 80 characters.";
  if (v.email && !EMAIL.test(v.email)) fieldErrors.email = "That email address doesn't look right.";
  if (Object.keys(fieldErrors).length) return { ok: false, message: "Check the highlighted fields.", fieldErrors };

  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    const sql = db();
    try {
      const rowId = await sql.begin(async (tx) => {
        if (id) {
          const [before] = await tx`select name, role, mobile, email, can_sign_in, active, 'crew' = any(lists) as crew, 'time_off' = any(lists) as time_off, 'hs_issue' = any(lists) as hs_issue from people where id = ${id} for update`;
          if (!before) throw new Error("missing");
          await tx`update people set name = ${v.name}, role = ${v.role}, mobile = ${v.mobile}, email = ${v.email},
                   can_sign_in = ${v.can_sign_in}, active = ${v.active},
                   -- the crew, time_off and hs_issue ticks, keeping any other lists entries as they are
                   lists = array(select distinct x from unnest(lists || array['crew', 'time_off', 'hs_issue']) x
                                 where (x <> 'crew' or ${v.crew}) and (x <> 'time_off' or ${v.time_off}) and (x <> 'hs_issue' or ${v.hs_issue})),
                   updated_by = ${person.name} where id = ${id}`;
          if (!v.active || !v.can_sign_in) await tx`update sessions set revoked_at = now() where person_id = ${id} and revoked_at is null`;
          const changes = diff(before, v, FIELDS);
          if (Object.keys(changes).length) await logActivity(tx, { person: person.name, table: "people", rowId: id, action: "update", changes });
          return id;
        }
        const [row] = await tx<{ id: string }[]>`
          insert into people (name, role, mobile, email, can_sign_in, active, lists, created_by)
          values (${v.name}, ${v.role}, ${v.mobile}, ${v.email}, ${v.can_sign_in}, true, (case when ${v.crew} then array['crew'] else '{}'::text[] end) || (case when ${v.time_off} then array['time_off'] else '{}'::text[] end) || (case when ${v.hs_issue} then array['hs_issue'] else '{}'::text[] end), ${person.name}) returning id`;
        await logActivity(tx, { person: person.name, table: "people", rowId: Number(row.id), action: "create", changes: diff(null, v, FIELDS) });
        return Number(row.id);
      });
      return { ok: true, message: "Saved.", data: (await loadPerson(rowId))! };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") {
        return { ok: false, message: "Check the highlighted fields.", fieldErrors: { name: "Someone already has that name." } };
      }
      if (e instanceof Error && e.message === "missing") return { ok: false, message: "That person no longer exists. Refresh the page." };
      throw e;
    }
  });
}

export async function setPersonPin(form: FormData): Promise<ActionResult<PersonRow>> {
  const id = Number(formText(form, "id"));
  const pin = formText(form, "pin");
  const pin2 = formText(form, "pin2");
  if (!id) return { ok: false, message: "Save the person first." };
  if (!isValidPin(pin)) return { ok: false, message: "The PIN must be exactly 4 digits.", fieldErrors: { pin: "4 digits, numbers only." } };
  if (pin !== pin2) return { ok: false, message: "The two PINs don't match.", fieldErrors: { pin2: "Doesn't match." } };
  return guarded(form.get(REQUEST_KEY_FIELD), async (person) => {
    const hash = await hashPin(pin);
    await db().begin(async (tx) => {
      await tx`update people set pin_hash = ${hash}, legacy_pin_hash = null, pin_set_at = now(), failed_pin_count = 0,
               locked_until = null, updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "people", rowId: id, action: "update", changes: { pin: ["(hidden)", "(changed)"] } });
    });
    return { ok: true, message: "PIN set. They can sign in with it now.", data: (await loadPerson(id))! };
  });
}

// "Mark as left": keeps their history but stops sign-in and hides them from pick lists.
export async function markPersonLeft(id: number, requestKey: string): Promise<ActionResult<PersonRow>> {
  return guarded(requestKey, async (person) => {
    if (id === person.id) return { ok: false, message: "You can't mark yourself as left." };
    await db().begin(async (tx) => {
      await tx`update people set active = false, can_sign_in = false, updated_by = ${person.name} where id = ${id}`;
      await tx`update sessions set revoked_at = now() where person_id = ${id} and revoked_at is null`;
      await logActivity(tx, { person: person.name, table: "people", rowId: id, action: "status", changes: { active: [true, false] } });
    });
    const row = await loadPerson(id);
    return row ? { ok: true, data: row } : { ok: false, message: "That person no longer exists." };
  });
}
