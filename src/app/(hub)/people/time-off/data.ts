import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate, isoTime } from "../../_registers/form-values";
import { mergeOptions } from "../../subcontractors/rules";
import { DEFAULT_KINDS, KIND_LIST, type PartDay, type Status } from "./rules";

// Only ever loaded after canSeeTimeOff() has passed: these rows hold personal notes.
export type TimeOffRow = {
  id: number;
  personId: number;
  kind: string;
  fromDate: string;
  toDate: string;
  partDay: PartDay;
  days: number;
  daysOverridden: boolean;
  notes: string;
  status: Status;
  response: string;
  requestedAt: string;
  decidedBy: string;
  decidedAt: string | null;
  source: "office" | "team";
};

export type TimeOffData = { rows: TimeOffRow[]; people: { id: number; name: string; active: boolean }[]; kinds: string[] };
type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function loadTimeOff(given?: Sql): Promise<TimeOffData> {
  const sql = given ?? (await readDb());
  const [rows, people, kinds] = await Promise.all([
    sql`select * from time_off order by from_date desc, id desc`,
    sql`select id, name, active from people order by lower(name)`,
    sql<{ value: string }[]>`select value from select_options where list = ${KIND_LIST} order by sort nulls last, lower(value)`,
  ]);
  return {
    rows: rows.map((r) => ({
      id: Number(r.id), personId: Number(r.person_id), kind: r.kind, fromDate: isoDate(r.from_date)!, toDate: isoDate(r.to_date)!,
      partDay: r.part_day, days: Number(r.days), daysOverridden: r.days_overridden, notes: s(r.notes), status: r.status,
      response: s(r.response), requestedAt: isoTime(r.requested_at) ?? "", decidedBy: s(r.decided_by), decidedAt: isoTime(r.decided_at),
      source: r.source,
    })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name, active: p.active })),
    kinds: mergeOptions(DEFAULT_KINDS, [...kinds.map((k) => k.value), ...rows.map((r) => r.kind)]),
  };
}
