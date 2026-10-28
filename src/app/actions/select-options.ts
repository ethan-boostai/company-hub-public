"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";

const LIST_PATTERN = /^[a-z0-9_.-]{1,60}$/;

// Adds a new option to a dropdown. Returns the stored value (an existing one if it differs only by case).
export async function addSelectOption(list: string, value: string, requestKey: string): Promise<ActionResult<string>> {
  const v = String(value || "").replace(/\s+/g, " ").trim();
  if (!LIST_PATTERN.test(list)) return { ok: false, message: "Unknown list." };
  if (!v) return { ok: false, message: "Type the new option first." };
  if (v.length > 120) return { ok: false, message: "Keep it under 120 characters." };
  return guarded(requestKey, async (person) => {
    const sql = db();
    return sql.begin(async (tx) => {
      const [existing] = await tx<{ value: string }[]>`
        select value from select_options where list = ${list} and lower(value) = lower(${v})`;
      if (existing) return { ok: true, data: existing.value };
      const [row] = await tx<{ id: string }[]>`
        insert into select_options (list, value, created_by) values (${list}, ${v}, ${person.name}) returning id`;
      await logActivity(tx, { person: person.name, table: "select_options", rowId: Number(row.id), action: "create", changes: { [list]: [null, v] } });
      return { ok: true, data: v };
    });
  });
}
