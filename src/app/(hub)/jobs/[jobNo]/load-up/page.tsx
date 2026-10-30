import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getCurrentPerson } from "@/lib/auth/session";
import { ukToday } from "../../../_registers/dates";
import { EstimateLock } from "../../../_site/ui";
import { getJob } from "../data";
import { loadLoadUp } from "./data";
import { LoadUpClient } from "./load-up-client";

async function Body({ params, searchParams }: { params: Promise<{ jobNo: string }>; searchParams: Promise<{ sheet?: string }> }) {
  const [{ jobNo }, sp] = await Promise.all([params, searchParams]);
  const job = await getJob(jobNo);
  if (!job) notFound();
  if (job.stage === "estimate") return <EstimateLock label="Load-up sheets" jobNo={job.jobNo} />;
  const [data, me] = await Promise.all([loadLoadUp(job.id), getCurrentPerson()]);
  return <LoadUpClient jobId={job.id} jobNo={job.jobNo} today={ukToday()} meId={me?.id ?? null} initial={data} openId={Number(sp.sheet) || null} />;
}

// Job > Site > Load-up: what goes in which van for this job. The office prepares it, the crew load it.
export default function LoadUpPage(props: PageProps<"/jobs/[jobNo]/load-up">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading load-up sheets…</p>}>
      <Body params={props.params as Promise<{ jobNo: string }>} searchParams={props.searchParams as Promise<{ sheet?: string }>} />
    </Suspense>
  );
}
