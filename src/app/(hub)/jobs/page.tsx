import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { listFolders, listJobs } from "./data";
import { JobsClient } from "./jobs-client";

async function Loader() {
  const [folders, jobs] = await Promise.all([listFolders(), listJobs()]);
  return <JobsClient folders={folders} jobs={jobs} />;
}

export default function JobsPage() {
  return (
    <>
      <PageHeader title="Jobs" bare />
      <main className="p-4 sm:p-6 max-w-6xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading jobs…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
