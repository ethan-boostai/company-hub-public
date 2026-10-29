import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { jobTitle } from "@/lib/jobs/stages";
import { getJob } from "./data";
import { JobMenu } from "./job-menu";

async function JobFrame({ params, children }: { params: Promise<{ jobNo: string }>; children: ReactNode }) {
  const { jobNo } = await params;
  const job = await getJob(jobNo);
  if (!job) notFound();
  return (
    <>
      <PageHeader title={`#${job.jobNo} ${jobTitle(job.description)}`} bare />
      <div className="md:flex">
        <JobMenu jobNo={job.jobNo} atEstimate={job.stage === "estimate"} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </>
  );
}

// One job page per job (no tabs); the job's own pages sit in the left job menu.
export default function JobLayout({ params, children }: LayoutProps<"/jobs/[jobNo]">) {
  return (
    <Suspense fallback={<p className="p-6 text-muted">Loading job…</p>}>
      <JobFrame params={params as Promise<{ jobNo: string }>}>{children}</JobFrame>
    </Suspense>
  );
}
