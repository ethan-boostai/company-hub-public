import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { isoTime } from "../_registers/form-values";
import { mergeOptions } from "../subcontractors/rules";
import { CATEGORY_LIST, DEFAULT_CATEGORIES, type RequestStatus, type Urgency } from "./rules";

export type RequestRow = {
  id: number;
  requestedBy: string;
  requestedById: number | null;
  category: string;
  urgency: Urgency;
  details: string;
  status: RequestStatus;
  response: string;
  requestedAt: string;
  closedAt: string | null;
  closedBy: string;
  source: "office" | "team";
};

export type RequestsData = { requests: RequestRow[]; people: { id: number; name: string }[]; categories: string[] };
type Sql = postgres.Sql | postgres.TransactionSql;

/* eslint-disable @typescript-eslint/no-explicit-any */
function toRow(r: any): RequestRow {
  return {
    id: Number(r.id), requestedBy: r.requested_by, requestedById: r.requested_by_id == null ? null : Number(r.requested_by_id),
    category: r.category, urgency: r.urgency, details: r.details, status: r.status, response: r.response ?? "",
    requestedAt: isoTime(r.requested_at)!, closedAt: isoTime(r.closed_at), closedBy: r.closed_by ?? "", source: r.source,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function loadRequests(): Promise<RequestsData> {
  const sql = await readDb();
  const [rows, people, cats] = await Promise.all([
    sql`select * from requests order by requested_at desc, id desc`,
    sql<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
    getOptions(CATEGORY_LIST),
  ]);
  return {
    requests: rows.map(toRow),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    categories: mergeOptions(DEFAULT_CATEGORIES, cats),
  };
}

export async function loadRequest(sql: Sql, id: number): Promise<RequestRow | null> {
  const [r] = await sql`select * from requests where id = ${id}`;
  return r ? toRow(r) : null;
}
