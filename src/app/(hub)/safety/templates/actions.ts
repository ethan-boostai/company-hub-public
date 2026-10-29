"use server";

import { db } from "@/lib/db";
import { guarded, type ActionResult } from "@/lib/actions";
import { logActivity } from "@/lib/activity";
import { normalise, toTemplate, type RamsContent } from "@/lib/rams/content";
import { ramsKey as keyFor } from "../rules";

const clean = (s: unknown, n: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const GONE = { ok: false as const, message: "That job type no longer exists. Refresh the page." };

// + New job type: a blank one, opened in the editor.
export async function createJobType(name: string, requestKey: string): Promise<ActionResult<{ id: number }>> {
  const nm = clean(name, 120);
  if (!nm) return { ok: false, message: "Give the job type a name." };
  return guarded(requestKey, async (person) => {
    const sql = db();
    const base = keyFor(nm);
    const taken = new Set((await sql<{ k: string }[]>`select key as k from rams_templates where key like ${base + "%"}`).map((x) => x.k));
    let key = base;
    for (let i = 2; taken.has(key); i++) key = `${base.slice(0, 55)}_${i}`;
    try {
      const id = await sql.begin(async (tx) => {
        const [t] = await tx<{ id: string }[]>`insert into rams_templates (key, name, template, created_by)
          values (${key}, ${nm}, ${tx.json({ activity: nm, steps: [], hazards: [], ppe: [], permits: [], openSteps: null } as never)}, ${person.name}) returning id`;
        await logActivity(tx, { person: person.name, table: "rams_templates", rowId: Number(t.id), action: "create", changes: { name: [null, nm] } });
        return Number(t.id);
      });
      return { ok: true, data: { id } };
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { ok: false, message: "There's already a job type with that name." };
      throw e;
    }
  });
}

// Save the job type editor: its name and what new RAMS start with.
export async function saveJobType(id: number, name: string, activity: string, content: RamsContent, requestKey: string): Promise<ActionResult> {
  const nm = clean(name, 120);
  if (!nm) return { ok: false, message: "Give the job type a name." };
  const c = normalise(content);
  return guarded(requestKey, async (person) => {
    const sql = db();
    try {
      const r = await sql.begin(async (tx) => {
        const [before] = await tx<{ name: string; template: { openSteps?: number[] | null } }[]>`select name, template from rams_templates where id = ${id} for update`;
        if (!before) return false;
        const t = toTemplate(clean(activity, 200) || nm, c, before.template?.openSteps ?? null);
        await tx`update rams_templates set name = ${nm}, template = ${tx.json(t as never)}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
        await logActivity(tx, { person: person.name, table: "rams_templates", rowId: id, action: "update", changes: before.name !== nm ? { name: [before.name, nm] } : { template: [null, "saved"] } });
        return true;
      });
      if (!r) return GONE;
    } catch (e) {
      if ((e as { code?: string }).code === "23505") return { ok: false, message: "There's already a job type with that name." };
      throw e;
    }
    return { ok: true, message: "Saved." };
  });
}

// Retire (hidden from + New > CBS RAMS) or bring back. RAMS already made from it don't change.
export async function setJobTypeStatus(id: number, status: "active" | "retired", requestKey: string): Promise<ActionResult> {
  if (status !== "active" && status !== "retired") return { ok: false, message: "Unknown status." };
  return guarded(requestKey, async (person) => {
    const r = await db().begin(async (tx) => {
      const [before] = await tx<{ status: string }[]>`select status from rams_templates where id = ${id} for update`;
      if (!before) return false;
      await tx`update rams_templates set status = ${status}, updated_at = now(), updated_by = ${person.name} where id = ${id}`;
      await logActivity(tx, { person: person.name, table: "rams_templates", rowId: id, action: "update", changes: { status: [before.status, status] } });
      return true;
    });
    if (!r) return GONE;
    return { ok: true, message: status === "retired" ? "Retired." : "Brought back." };
  });
}
