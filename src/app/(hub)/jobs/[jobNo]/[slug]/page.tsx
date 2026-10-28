import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findMenuItem } from "@/lib/jobs/menu";
import { getJob } from "../data";

async function Body({ params }: { params: Promise<{ jobNo: string; slug: string }> }) {
  const { jobNo, slug } = await params;
  const item = findMenuItem(slug);
  const job = await getJob(jobNo);
  if (!item || !job) notFound();
  const locked = job.stage === "estimate" && !item.openAtEstimate;
  return (
    <div className="bg-white border border-line rounded-xl p-5 max-w-xl">
      <h2 className="text-lg font-semibold mb-2">{item.label}</h2>
      {locked ? (
        <p className="text-sm text-muted">
          {item.label} unlocks after approval. Job {job.jobNo} is still at Estimate. It opens once the job is Approved (Work Order in ServiceM8).
        </p>
      ) : (
        <p className="text-sm text-muted">{item.label} is built in Phase {item.phase}. Until then, use the old hub for this page.</p>
      )}
      <Link href={`/jobs/${job.jobNo}`} className="inline-block mt-4 text-sm underline">Go to the job</Link>
    </div>
  );
}

export default function JobSubPage(props: PageProps<"/jobs/[jobNo]/[slug]">) {
  return (
    <main className="p-4 sm:p-6">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Body params={props.params as Promise<{ jobNo: string; slug: string }>} />
      </Suspense>
    </main>
  );
}
