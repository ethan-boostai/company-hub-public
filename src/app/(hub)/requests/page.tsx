import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { loadRequests } from "./data";
import { RequestsClient } from "./requests-client";

async function Loader() {
  return <RequestsClient initial={await loadRequests()} />;
}

export default function RequestsPage() {
  return (
    <>
      <PageHeader title="Team requests" />
      <main className="p-4 sm:p-6 max-w-5xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading requests…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
