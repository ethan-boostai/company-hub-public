import { Suspense } from "react";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { changedSinceIssue } from "@/lib/rams/content";
import { builderLists, ramsQuery } from "@/lib/rams/data";
import { signNames } from "@/lib/signons/service";
import { getJob } from "../../data";
import { RamsDetail } from "./rams-detail";

async function Body({ params }: { params: Promise<{ jobNo: string; ramsId: string }> }) {
  const { jobNo, ramsId } = await params;
  const job = await getJob(jobNo);
  const id = Number(ramsId);
  if (!job || !Number.isInteger(id) || id <= 0) notFound();
  if (job.stage === "estimate") {
    return <p className="m-6 text-sm text-muted">RAMS unlock after approval. Job {job.jobNo} is still at Estimate.</p>;
  }
  const sql = await readDb();
  const [r] = await ramsQuery(sql, { id });
  if (!r || r.jobId !== job.id) notFound();
  const [lists, revisions, signed, names] = await Promise.all([
    builderLists(sql),
    sql<{ id: string; revision: number; status: string }[]>`select id, revision, status from rams where job_id = ${job.id} and seq = ${r.seq} order by revision desc`,
    sql<{ name: string; company: string | null; signed_at: Date; signed_via: string }[]>`
      select name, company, signed_at, signed_via from sign_ons where doc_type = 'rams' and doc_id = ${id} and doc_revision = ${r.revision} order by signed_at`,
    signNames(job.id),
  ]);
  return (
    <RamsDetail
      initial={r}
      lists={lists}
      revisions={revisions.map((x) => ({ id: Number(x.id), revision: x.revision, status: x.status }))}
      signed={signed.map((s) => ({ name: s.name, company: s.company ?? "", signedAt: s.signed_at.toISOString(), via: s.signed_via }))}
      names={names}
      changed={changedSinceIssue(r.content.register, lists.hazards, r.issuedAt)}
    />
  );
}

// One RAMS: the builder for a draft, the issued view (PDF, signing, new revision) or a
// subcontractor's RAMS (upload and review).
export default function RamsDetailPage(props: { params: Promise<{ jobNo: string; ramsId: string }> }) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading RAMS…</p>}>
      <Body params={props.params} />
    </Suspense>
  );
}
