import { Suspense } from "react";
import { notFound } from "next/navigation";
import { readDb } from "@/lib/db";
import { changedSinceIssue } from "@/lib/rams/content";
import { builderLists, ramsQuery } from "@/lib/rams/data";
import { getJob } from "../data";
import { RamsListClient } from "./rams-list-client";

async function Body({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const job = await getJob(jobNo);
  if (!job) notFound();
  if (job.stage === "estimate") {
    return (
      <div className="m-4 sm:m-6 bg-white border border-line rounded-xl p-5 max-w-xl">
        <h2 className="text-lg font-semibold mb-2">RAMS</h2>
        <p className="text-sm text-muted">RAMS unlock after approval. Job {job.jobNo} is still at Estimate.</p>
      </div>
    );
  }
  const sql = await readDb();
  const [rows, lists] = await Promise.all([ramsQuery(sql, { jobId: job.id }), builderLists(sql)]);
  const changed = Object.fromEntries(rows.filter((r) => r.status === "issued").map((r) => [r.id, changedSinceIssue(r.content.register, lists.hazards, r.issuedAt)]));
  return (
    <RamsListClient
      jobNo={job.jobNo}
      rows={rows.map(({ content: _c, ...r }) => (void _c, r))}
      changed={changed}
      jobTypes={lists.jobTypes.map((t) => ({ key: t.key, name: t.name }))}
      subcontractors={lists.subcontractors}
    />
  );
}

// Job > Safety > RAMS: the job's CBS RAMS (built here, issued as PDFs, signed by the crew) and the
// subcontractors' own RAMS (uploaded and reviewed).
export default function RamsPage(props: PageProps<"/jobs/[jobNo]/rams">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading RAMS…</p>}>
      <Body params={props.params as Promise<{ jobNo: string }>} />
    </Suspense>
  );
}
