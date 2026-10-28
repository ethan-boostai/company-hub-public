import "server-only";
import { readDb } from "@/lib/db";

export type DemoNote = { id: number; text: string; by: string };

export const DEMO_LIST = "demo.notes";

export async function listDemoNotes(): Promise<DemoNote[]> {
  const sql = await readDb();
  const rows = await sql<{ id: string; value: string; created_by: string | null }[]>`
    select id, value, created_by from select_options where list = ${DEMO_LIST} order by id desc limit 50`;
  return rows.map((r) => ({ id: Number(r.id), text: r.value, by: r.created_by ?? "" }));
}

export async function listDemoFiles(): Promise<{ id: number; name: string; mime: string; size: number; storage: string }[]> {
  const sql = await readDb();
  const rows = await sql<{ id: string; name: string; mime: string | null; size_bytes: string | null; storage: string }[]>`
    select id, name, mime, size_bytes, storage from files where entity_table = 'demo' order by id desc limit 20`;
  return rows.map((r) => ({ id: Number(r.id), name: r.name, mime: r.mime ?? "", size: Number(r.size_bytes ?? 0), storage: r.storage }));
}
