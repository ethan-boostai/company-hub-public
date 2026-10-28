import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listFolders } from "../data";
import { getJob } from "./data";
import { JobHeader } from "./job-header";
import { JobNotes } from "./job-notes";

async function JobBody({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const [job, folders] = await Promise.all([getJob(jobNo), listFolders()]);
  if (!job) notFound();
  return (
    <div className="flex flex-col gap-4">
      <JobHeader job={job} folders={folders} />
      <JobNotes jobNo={job.jobNo} notes={job.notes} description={job.description} />
    </div>
  );
}

export default function JobPage(props: PageProps<"/jobs/[jobNo]">) {
  return (
    <main className="p-4 sm:p-6 max-w-5xl">
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <JobBody params={props.params as Promise<{ jobNo: string }>} />
      </Suspense>
    </main>
  );
}
