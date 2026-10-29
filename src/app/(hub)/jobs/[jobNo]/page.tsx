import { Suspense } from "react";
import { notFound } from "next/navigation";
import { listFolders } from "../data";
import { getJob } from "./data";
import { JobHeader } from "./job-header";
import { JobNotes } from "./job-notes";
import { JobTasks } from "./job-tasks";
import { listTasks } from "@/lib/tasks/data";
import { getCurrentPerson } from "@/lib/auth/session";

async function JobBody({ params }: { params: Promise<{ jobNo: string }> }) {
  const { jobNo } = await params;
  const [job, folders] = await Promise.all([getJob(jobNo), listFolders()]);
  if (!job) notFound();
  const [tasks, me] = await Promise.all([listTasks({ jobId: job.id, doneDays: null }), getCurrentPerson()]);
  // As the old Job File: the job in the centre, its Tasks panel down the right.
  return (
    <div className="flex items-start">
      <main className="flex-1 min-w-0 p-4 sm:p-6 pb-20 min-[1100px]:pb-6">
        <div className="flex flex-col gap-4 max-w-4xl">
          <JobHeader job={job} folders={folders} />
          <JobNotes jobNo={job.jobNo} notes={job.notes} description={job.description} />
        </div>
      </main>
      <JobTasks jobNo={job.jobNo} tasks={tasks} meId={me?.id ?? null} />
    </div>
  );
}

export default function JobPage(props: PageProps<"/jobs/[jobNo]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-muted">Loading…</p>}>
      <JobBody params={props.params as Promise<{ jobNo: string }>} />
    </Suspense>
  );
}
