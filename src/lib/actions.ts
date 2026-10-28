import "server-only";
import { db } from "@/lib/db";
import { getCurrentPerson, type Person } from "@/lib/auth/session";

import type { ActionResult } from "@/lib/action-types";
export type { ActionResult } from "@/lib/action-types";

const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Claims a one-time request key. Returns false if the key was already used (a double save) or is invalid.
export async function claimRequestKey(key: unknown, personId: number | null): Promise<boolean> {
  if (typeof key !== "string" || !KEY_PATTERN.test(key)) return false;
  const sql = db();
  const rows = await sql`
    insert into request_keys (key, person_id) values (${key.toLowerCase()}, ${personId})
    on conflict (key) do nothing returning key`;
  if (Math.random() < 0.01) {
    await sql`delete from request_keys where created_at < now() - interval '7 days'`;
  }
  return rows.length === 1;
}

// Every saving Server Action goes through this: signed-in check, then the double-save guard.
export async function guarded<T>(
  requestKey: unknown,
  fn: (person: Person) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  const person = await getCurrentPerson();
  if (!person) return { ok: false, message: "You have been signed out. Sign in again and retry." };
  if (typeof requestKey !== "string" || !KEY_PATTERN.test(requestKey)) {
    return { ok: false, message: "The page wasn't ready. Try again." };
  }
  if (!(await claimRequestKey(requestKey, person.id))) {
    return { ok: false, duplicate: true, message: "This was already saved." };
  }
  return fn(person);
}

export function formText(form: FormData, name: string): string {
  const v = form.get(name);
  return typeof v === "string" ? v.trim() : "";
}
