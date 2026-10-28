import "server-only";
import { readDb } from "@/lib/db";

export async function getOptions(list: string): Promise<string[]> {
  const sql = await readDb();
  const rows = await sql<{ value: string }[]>`
    select value from select_options where list = ${list} order by sort nulls last, lower(value)`;
  return rows.map((r) => r.value);
}
