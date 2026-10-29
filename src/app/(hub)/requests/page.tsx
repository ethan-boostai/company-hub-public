import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { loadRequests } from "./data";
import { RequestsClient } from "./requests-client";

async function Loader({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const [data, sp] = await Promise.all([loadRequests(), searchParams]);
  return <RequestsClient initial={data} openId={Number(sp.request) || null} />;
}

export default function RequestsPage(props: PageProps<"/requests">) {
  return (
    <>
      <PageHeader title="Team requests" bare />
      {/* Team > Team requests: the Team page's tabs (People and companies > Team). */}
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading requests…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ request?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
