import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate } from "../_registers/form-values";
import { mergeOptions } from "../subcontractors/rules";
import { QUAL_LIST, STANDARD_QUALS } from "./rules";

export type TrainingRow = {
  id: number;
  personId: number;
  qualification: string;
  provider: string;
  reference: string;
  issuedOn: string | null;
  expiresOn: string | null;
  notes: string;
};

// People come from People (Settings). "crew" is the per-person "Crew list" tick there.
export type TrainingPerson = { id: number; name: string; active: boolean; crew: boolean };

export type TrainingData = { records: TrainingRow[]; people: TrainingPerson[]; quals: string[] };

type Sql = postgres.Sql | postgres.TransactionSql;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function loadTraining(given?: Sql): Promise<TrainingData> {
  const sql = given ?? (await readDb());
  const [records, people, quals] = await Promise.all([
    sql`select * from training_records order by id`,
    sql`select id, name, active, 'crew' = any(lists) as crew from people order by lower(name)`,
    sql<{ value: string }[]>`select value from select_options where list = ${QUAL_LIST} order by sort nulls last, lower(value)`,
  ]);
  return {
    records: records.map((r) => ({
      id: Number(r.id), personId: Number(r.person_id), qualification: r.qualification, provider: s(r.provider), reference: s(r.reference),
      issuedOn: isoDate(r.issued_on), expiresOn: isoDate(r.expires_on), notes: s(r.notes),
    })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name, active: p.active, crew: p.crew })),
    quals: mergeOptions(STANDARD_QUALS, [...quals.map((q) => q.value), ...records.map((r) => r.qualification)]),
  };
}
