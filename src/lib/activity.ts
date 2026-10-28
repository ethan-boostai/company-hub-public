import "server-only";
import type postgres from "postgres";

type Action = "create" | "update" | "delete" | "status";
type Changes = Record<string, [unknown, unknown]>;

// Field-by-field differences between two versions of a row (only the fields listed).
export function diff(before: Record<string, unknown> | null, after: Record<string, unknown>, fields: string[]): Changes {
  const out: Changes = {};
  for (const f of fields) {
    const a = before ? before[f] ?? null : null;
    const b = after[f] ?? null;
    if (JSON.stringify(a) !== JSON.stringify(b)) out[f] = [a, b];
  }
  return out;
}

// Records who changed what. Pass the transaction so the log is saved with the change.
export async function logActivity(
  sql: postgres.Sql | postgres.TransactionSql,
  entry: { person: string; table: string; rowId: number | null; jobId?: number | null; action: Action; changes?: Changes },
): Promise<void> {
  await sql`
    insert into activity_log (person_name, table_name, row_id, job_id, action, changes)
    values (${entry.person}, ${entry.table}, ${entry.rowId}, ${entry.jobId ?? null}, ${entry.action},
            ${entry.changes ? sql.json(entry.changes as never) : null})`;
}
