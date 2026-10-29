import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { isoDate } from "../_registers/form-values";
import type { Pick } from "./data";
import type { DocKind, DocStatus } from "./policy-rules";

export type HsDocRow = {
  id: number;
  kind: DocKind;
  version: string;
  status: DocStatus;
  effectiveOn: string | null;
  reviewDue: string | null;
  paragraphs: string[];
  signatoryId: number | null;
  signatoryName: string;
  signatoryRole: string;
  advisor: string;
  fileId: number | null;
  fileName: string;
  issuedBy: string;
  issuedOn: string | null;
  notes: string;
};

export type PolicyData = {
  docs: HsDocRow[];
  people: Pick[];
  canIssue: boolean; // the signed-in person has the "Issue H&S policy" tick
  hasSavedSignature: boolean; // the signed-in person has a saved signature
};

type Sql = postgres.Sql | postgres.TransactionSql;
const n = (v: unknown) => (v == null ? null : Number(v));

export async function docQuery(sql: Sql, id: number | null): Promise<HsDocRow[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select d.*, coalesce(d.signatory_name, p.name) as signer, f.name as file_name
    from hs_documents d left join people p on p.id = d.signatory_id left join files f on f.id = d.file_id
    where ${id === null ? sql`true` : sql`d.id = ${id}`}
    order by d.kind, (d.status = 'issued') desc, (d.status = 'draft') desc, d.effective_on desc nulls first, d.id desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind as DocKind,
    version: String(r.version),
    status: r.status as DocStatus,
    effectiveOn: isoDate(r.effective_on),
    reviewDue: isoDate(r.review_due),
    paragraphs: (r.paragraphs as string[]) ?? [],
    signatoryId: n(r.signatory_id),
    signatoryName: (r.signer as string) ?? "",
    signatoryRole: (r.signatory_role as string) ?? "",
    advisor: (r.advisor as string) ?? "",
    fileId: n(r.file_id),
    fileName: (r.file_name as string) ?? "",
    issuedBy: (r.issued_by as string) ?? "",
    issuedOn: isoDate(r.issued_on),
    notes: (r.notes as string) ?? "",
  }));
}

export async function loadPolicy(personId: number, sql?: Sql): Promise<PolicyData> {
  const s = sql ?? (await readDb());
  const [docs, people, me] = await Promise.all([
    docQuery(s, null),
    s<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
    s<{ can: boolean; sig: boolean }[]>`select active and 'hs_issue' = any(lists) as can, signature_file_id is not null as sig from people where id = ${personId}`,
  ]);
  return {
    docs,
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    canIssue: !!me[0]?.can,
    hasSavedSignature: !!me[0]?.sig,
  };
}
