import { Suspense } from "react";
import { notFound } from "next/navigation";
import { ukToday } from "../../../_registers/dates";
import { getJob } from "../data";
import { EstimateLock } from "../../../_site/ui";
import { loadJobPlant } from "./data";
import { PlantClient } from "./plant-client";

async function Body({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const job = await getJob(jobNo);
  if (!job) notFound();
  if (job.stage === "estimate") return <EstimateLock label="Plant" jobNo={job.jobNo} />;
  return <PlantClient jobId={job.id} jobNo={job.jobNo} today={ukToday()} initial={await loadJobPlant(job.id)} />;
}

// Job > Site > Plant: equipment booked out to this job, booked from here, a load-up sheet or the yard.
export default function PlantPage(props: PageProps<"/jobs/[jobNo]/plant">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading plant…</p>}>
      <Body params={props.params as Promise<{ jobNo: string }>} />
    </Suspense>
  );
}
