import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getJob } from "../data";
import { EstimateLock } from "../../../_site/ui";
import { loadJobMaterials } from "./data";
import { MaterialsClient } from "./materials-client";

async function Body({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const job = await getJob(jobNo);
  if (!job) notFound();
  if (job.stage === "estimate") return <EstimateLock label="Materials" jobNo={job.jobNo} />;
  return <MaterialsClient jobId={job.id} jobNo={job.jobNo} initial={await loadJobMaterials(job.id)} />;
}

// Job > Site > Materials: stock taken for this job and returned from it, and what that comes to.
export default function MaterialsPage(props: PageProps<"/jobs/[jobNo]/materials">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading materials…</p>}>
      <Body params={props.params as Promise<{ jobNo: string }>} />
    </Suspense>
  );
}
