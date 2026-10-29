import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";

export type SignOnRow = {
  id: number;
  docType: string;
  docId: number;
  docRevision: number;
  docLabel: string;
  name: string;
  company: string;
  isWorker: boolean;
  signedAt: string;
  via: "office" | "crew";
  presenter: string;
  signatureFileId: number | null;
  reviewed: boolean;
  reviewedBy: string;
};

type Sql = postgres.Sql | postgres.TransactionSql;

export async function loadSignOns(jobId: number, sql?: Sql): Promise<SignOnRow[]> {
  const s = sql ?? (await readDb());
  const rows = await s<Record<string, unknown>[]>`select * from sign_ons where job_id = ${jobId} order by signed_at desc, id desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    docType: String(r.doc_type),
    docId: Number(r.doc_id),
    docRevision: Number(r.doc_revision),
    docLabel: (r.doc_label as string) ?? "",
    name: String(r.name),
    company: (r.company as string) ?? "",
    isWorker: !!r.is_worker,
    signedAt: (r.signed_at as Date).toISOString(),
    via: r.signed_via as "office" | "crew",
    presenter: (r.presenter as string) ?? "",
    signatureFileId: r.signature_file_id == null ? null : Number(r.signature_file_id),
    reviewed: !!r.reviewed,
    reviewedBy: (r.reviewed_by as string) ?? "",
  }));
}
