import "server-only";
import type postgres from "postgres";
import { readDb } from "@/lib/db";
import { getOptions } from "@/lib/select-options";
import { normalise, type RamsContent } from "./content";

type Sql = postgres.Sql | postgres.TransactionSql;
const n = (v: unknown) => (v == null ? null : Number(v));
const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v ? String(v) : null);
const day = (v: unknown) => (v instanceof Date ? new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(v) : v ? String(v).slice(0, 10) : null);

export type RamsRow = {
  id: number;
  jobId: number;
  jobNo: string;
  kind: "cbs" | "subcontractor";
  seq: number;
  revision: number;
  status: "draft" | "issued" | "superseded";
  title: string;
  templateKey: string;
  content: RamsContent;
  preparedById: number | null;
  preparedBy: string;
  approvedById: number | null;
  approvedBy: string;
  approverRole: string;
  dated: string | null;
  subcontractorId: number | null;
  subcontractor: string;
  reviewStatus: "pending" | "approved" | "rejected" | null;
  reviewNote: string;
  fileId: number | null;
  fileName: string;
  signedFileId: number | null;
  issuedAt: string | null;
  issuedBy: string;
  notes: string;
  signedCount: number;
};

export async function ramsQuery(sql: Sql, where: { jobId?: number; id?: number }): Promise<RamsRow[]> {
  const rows = await sql<Record<string, unknown>[]>`
    select r.*, j.job_no, pp.name as prepared_name, ap.name as approved_name, s.company as sub_name, f.name as file_name,
           (select count(*)::int from sign_ons so where so.doc_type = 'rams' and so.doc_id = r.id and so.doc_revision = r.revision) as signed_count
    from rams r join jobs j on j.id = r.job_id
    left join people pp on pp.id = r.prepared_by_id left join people ap on ap.id = r.approved_by_id
    left join subcontractors s on s.id = r.subcontractor_id left join files f on f.id = r.file_id
    where ${where.id ? sql`r.id = ${where.id}` : sql`r.job_id = ${where.jobId ?? 0}`}
    order by r.kind, r.seq, r.revision desc`;
  return rows.map((r) => ({
    id: Number(r.id), jobId: Number(r.job_id), jobNo: String(r.job_no), kind: r.kind as RamsRow["kind"], seq: Number(r.seq), revision: Number(r.revision),
    status: r.status as RamsRow["status"], title: String(r.title), templateKey: (r.template_key as string) ?? "", content: normalise(r.data),
    preparedById: n(r.prepared_by_id), preparedBy: (r.prepared_name as string) ?? "", approvedById: n(r.approved_by_id), approvedBy: (r.approved_name as string) ?? "",
    approverRole: (r.approver_role as string) ?? "", dated: day(r.dated), subcontractorId: n(r.subcontractor_id), subcontractor: (r.sub_name as string) ?? "",
    reviewStatus: (r.review_status as RamsRow["reviewStatus"]) ?? null, reviewNote: (r.review_note as string) ?? "",
    fileId: n(r.file_id), fileName: (r.file_name as string) ?? "", signedFileId: n(r.signed_file_id), issuedAt: iso(r.issued_at), issuedBy: (r.issued_by as string) ?? "",
    notes: (r.notes as string) ?? "", signedCount: Number(r.signed_count ?? 0),
  }));
}

export type LibraryHazard = {
  id: number; ramsKey: string; hazard: string; harm: string; controls: string; likelihood: number | null; consequence: number | null;
  residualLikelihood: number | null; residualConsequence: number | null; controlCodes: string[]; plantCategories: string[]; updatedAt: string | null;
};
export type Pick = { id: number; name: string };
export type JobType = { id: number; key: string; name: string; status: "active" | "retired"; template: Record<string, unknown>; notes: string };

export type BuilderLists = {
  hazards: LibraryHazard[]; // active library hazards
  categories: string[]; // equipment categories (each brings its hazards)
  substances: (Pick & { supplier: string })[]; // assessed CoSHH substances
  people: Pick[];
  subcontractors: Pick[];
  jobTypes: JobType[];
};

export async function libraryHazards(sql: Sql, all = false): Promise<LibraryHazard[]> {
  const rows = await sql<Record<string, unknown>[]>`select * from hazards where ${all ? sql`true` : sql`status = 'active'`} order by lower(hazard)`;
  return rows.map((r) => ({
    id: Number(r.id), ramsKey: String(r.rams_key), hazard: String(r.hazard), harm: (r.harm as string) ?? "", controls: (r.controls as string) ?? "",
    likelihood: n(r.likelihood), consequence: n(r.consequence), residualLikelihood: n(r.residual_likelihood), residualConsequence: n(r.residual_consequence),
    controlCodes: (r.control_codes as string[]) ?? [], plantCategories: (r.plant_categories as string[]) ?? [], updatedAt: iso(r.updated_at ?? r.created_at),
  }));
}

export async function jobTypes(sql: Sql, all = false): Promise<JobType[]> {
  const rows = await sql<Record<string, unknown>[]>`select * from rams_templates where ${all ? sql`true` : sql`status = 'active'`}
    order by (key = 'general') desc, lower(name)`;
  return rows.map((r) => ({ id: Number(r.id), key: String(r.key), name: String(r.name), status: r.status as JobType["status"], template: (r.template as Record<string, unknown>) ?? {}, notes: (r.notes as string) ?? "" }));
}

export async function builderLists(sql?: Sql): Promise<BuilderLists> {
  const s = sql ?? (await readDb());
  const [hazards, categories, substances, people, subs, types] = await Promise.all([
    libraryHazards(s),
    getOptions("equipment.category"),
    s<{ id: string; product: string; supplier: string | null }[]>`
      select su.id, su.product, sp.name as supplier from substances su left join suppliers sp on sp.id = su.supplier_id
      where su.status = 'assessed' order by lower(su.product)`,
    s<{ id: string; name: string }[]>`select id, name from people where active order by lower(name)`,
    s<{ id: string; company: string }[]>`select id, company from subcontractors order by lower(company)`,
    jobTypes(s),
  ]);
  return {
    hazards,
    categories: Array.from(new Set([...categories, ...hazards.flatMap((h) => h.plantCategories)])).sort((a, b) => a.localeCompare(b)),
    substances: substances.map((r) => ({ id: Number(r.id), name: r.product, supplier: r.supplier ?? "" })),
    people: people.map((p) => ({ id: Number(p.id), name: p.name })),
    subcontractors: subs.map((p) => ({ id: Number(p.id), name: p.company })),
    jobTypes: types,
  };
}
