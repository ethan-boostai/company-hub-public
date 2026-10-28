"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { REQUEST_KEY_FIELD } from "@/lib/action-types";
import { diff, logActivity } from "@/lib/activity";
import { forLog, FormValues } from "../_registers/form-values";
import { loadRequest, type RequestRow } from "./data";
import { closedChange, REQUEST_STATUSES, URGENCIES, type RequestStatus, type Urgency } from "./rules";

const FIELDS = ["requested_by", "requested_by_id", "category", "urgency", "details", "status", "response"];
class Missing extends Error {}

// The office logs a request on someone's behalf, or updates one (status, reply).
export async function saveRequest(form: FormData): Promise<ActionResult<RequestRow>> {
  const f = new FormValues(form);
  const id = f.id("id");
  const personId = f.id("requested_by_id");
  const v: Record<string, unknown> = {
    requested_by_id: personId,
    category: f.required("category", "Choose what it is for.", 120),
    urgency: f.oneOf<Urgency>("urgency", URGENCIES.map((u) => u.value), "this_week"),
    details: f.required("details", "Add some details.", 4000),
    status: f.oneOf<RequestStatus>("status", REQUEST_STATUSES.map((s) => s.value), "new"),
    response: f.text("response", 4000),
  };
  if (!personId) f.errors.requested_by_id = "Choose who it is for.";
  if (!f.ok) return { ok: false, message: "Check the highlighted fields.", fieldErrors: f.errors };

  return guarded<RequestRow>(form.get(REQUEST_KEY_FIELD), async (person) => {
    try {
      const row = await db().begin(async (tx) => {
        const [who] = await tx<{ name: string }[]>`select name from people where id = ${personId}`;
        if (!who) throw new Missing();
        const values: Record<string, unknown> = { ...v, requested_by: who.name };
        let rowId = id;
        let before: Record<string, unknown> | null = null;
        if (id) {
          const [b] = await tx<Record<string, unknown>[]>`select ${tx(FIELDS)} from requests where id = ${id} for update`;
          before = b ?? null;
          if (!before) throw new Missing();
          await tx`update requests set ${tx(values)}, updated_by = ${person.name} where id = ${id}`;
        } else {
          const [r] = await tx<{ id: string }[]>`insert into requests ${tx({ ...values, source: "office", created_by: person.name })} returning id`;
          rowId = Number(r.id);
        }
        const change = closedChange((before?.status as RequestStatus) ?? null, values.status as RequestStatus);
        if (change === "close") await tx`update requests set closed_at = now(), closed_by = ${person.name} where id = ${rowId}`;
        if (change === "reopen") await tx`update requests set closed_at = null, closed_by = null where id = ${rowId}`;
        const changes = diff(before ? forLog(before) : null, values, FIELDS);
        if (Object.keys(changes).length || !id) {
          await logActivity(tx, { person: person.name, table: "requests", rowId: rowId!, action: id ? "update" : "create", changes });
        }
        return (await loadRequest(tx, rowId!))!;
      });
      return { ok: true, message: "Saved.", data: row };
    } catch (e) {
      if (e instanceof Missing) return { ok: false, message: "That record no longer exists. Refresh the page." };
      throw e;
    }
  });
}

export async function deleteRequest(id: number, requestKey: string): Promise<ActionResult> {
  if (!Number.isInteger(id) || id <= 0) return { ok: false, message: "Unknown record." };
  return guarded(requestKey, async (person) =>
    db().begin(async (tx) => {
      const [before] = await tx`select * from requests where id = ${id} for update`;
      if (!before) return { ok: false, message: "That request no longer exists." };
      await tx`delete from requests where id = ${id}`;
      const snapshot = Object.fromEntries(FIELDS.map((k) => [k, [forLog(before)[k] ?? null, null] as [unknown, unknown]]));
      await logActivity(tx, { person: person.name, table: "requests", rowId: id, action: "delete", changes: snapshot });
      return { ok: true, message: "Deleted." };
    }),
  );
}
