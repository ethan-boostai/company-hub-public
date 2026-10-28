import "server-only";
import { readDb } from "@/lib/db";
import { REQUIREMENTS, builtIn, customId, customKey, type ReqStage, type Side } from "@/lib/requirements";

export type ReqType = { key: string; label: string; stage: ReqStage; side: Side; repeatable: boolean; cdm: boolean; custom: boolean; active: boolean };

export async function customTypes(includeInactive = false): Promise<ReqType[]> {
  const sql = await readDb();
  const rows = await sql<{ id: string; name: string; stage: ReqStage; side: Side; repeatable: boolean; active: boolean }[]>`
    select id, name, stage, side, repeatable, active from requirement_types
    where ${includeInactive} or active order by sort nulls last, lower(name)`;
  return rows.map((r) => ({ key: customKey(Number(r.id)), label: r.name, stage: r.stage, side: r.side, repeatable: r.repeatable, cdm: false, custom: true, active: r.active }));
}

export function builtInTypes(): ReqType[] {
  return REQUIREMENTS.map((r) => ({ key: r.key, label: r.label, stage: r.stage, side: r.side, repeatable: !!r.repeatable, cdm: !!r.cdm, custom: false, active: true }));
}

// A requirement by key, built-in or custom (custom from the given list, or the database).
export async function findType(key: string): Promise<ReqType | null> {
  const b = builtIn(key);
  if (b) return { key: b.key, label: b.label, stage: b.stage, side: b.side, repeatable: !!b.repeatable, cdm: !!b.cdm, custom: false, active: true };
  const id = customId(key);
  if (!id) return null;
  const sql = await readDb();
  const [r] = await sql<{ name: string; stage: ReqStage; side: Side; repeatable: boolean; active: boolean }[]>`
    select name, stage, side, repeatable, active from requirement_types where id = ${id}`;
  return r ? { key, label: r.name, stage: r.stage, side: r.side, repeatable: r.repeatable, cdm: false, custom: true, active: r.active } : null;
}
