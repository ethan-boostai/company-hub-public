import "server-only";
import { db } from "@/lib/db";

const TABLE = /^[a-z_]{1,60}$/;

// The SharePoint folder for files attached to one record, from the database function
// upload_folder_<table>(id) when that table has one (added by each area's migration).
// - undefined: the table has no folder function; the caller uses its default folder.
// - null: the record doesn't exist (or its folder couldn't be worked out); refuse the upload.
// - otherwise the full folder, always inside "CBS System/".
export async function recordFolder(entityTable: string, entityId: number): Promise<string | null | undefined> {
  if (!TABLE.test(entityTable)) return null;
  const fn = `upload_folder_${entityTable}`;
  const sql = db();
  const [has] = await sql<{ ok: boolean }[]>`select to_regprocedure(${`public.${fn}(bigint)`}) is not null as ok`;
  if (!has?.ok) return undefined;
  if (!Number.isInteger(entityId) || entityId <= 0) return null;
  // The function name is built from a checked table name and confirmed to exist above.
  const [row] = await sql.unsafe<{ folder: string | null }[]>(`select public.${fn}($1::bigint) as folder`, [entityId]);
  const folder = row?.folder ?? null;
  return folder && folder.startsWith("CBS System/") && !folder.includes("..") ? folder : null;
}
