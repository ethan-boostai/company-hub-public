import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listFolders } from "../data";
import { getJob } from "./data";
import { JobHeader } from "./job-header";
import { JobNotes } from "./job-notes";
import { JobTasks } from "./job-tasks";
import { listTasks } from "@/lib/tasks/data";

async function JobBody({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const [job, folders] = await Promise.all([getJob(jobNo), listFolders()]);
  if (!job) notFound();
  const tasks = await listTasks({ jobId: job.id, doneDays: null });
  return (
    <div className="flex flex-col gap-4">
      <JobHeader job={job} folders={folders} />
      <JobTasks jobNo={job.jobNo} tasks={tasks} />
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
