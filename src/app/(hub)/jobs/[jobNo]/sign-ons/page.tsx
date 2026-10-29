import { Suspense } from "react";
import { notFound } from "next/navigation";
import { crewPath } from "@/lib/signons/crew-link";
import { getJob } from "../data";
import { loadSignOns } from "./data";
import { SignOnsClient } from "./sign-ons-client";

async function Body({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const job = await getJob(jobNo);
  if (!job) notFound();
  if (job.stage === "estimate") {
    return (
      <div className="m-4 sm:m-6 bg-white border border-line rounded-xl p-5 max-w-xl">
        <h2 className="text-lg font-semibold mb-2">Sign-ons</h2>
        <p className="text-sm text-muted">Sign-ons unlock after approval. Job {job.jobNo} is still at Estimate.</p>
      </div>
    );
  }
  return <SignOnsClient jobId={job.id} jobNo={job.jobNo} initial={await loadSignOns(job.id)} crewLink={crewPath(job.jobNo)} />;
}

// Job > Safety > Sign-ons: everyone who has signed this job's documents (RAMS, pre-starts, toolbox
// talks, CPHSP inductions), and the job's crew page link.
export default function SignOnsPage(props: PageProps<"/jobs/[jobNo]/sign-ons">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading sign-ons…</p>}>
      <Body params={props.params as Promise<{ jobNo: string }>} />
    </Suspense>
  );
}
