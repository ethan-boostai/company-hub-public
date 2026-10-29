import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { TeamTabs } from "@/components/shell/team-tabs";
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
      <main className="p-4 sm:p-6 max-w-5xl">
        {/* Team > Team requests: the Team page's tabs (People and companies > Team). */}
        <h1 className="text-2xl font-bold text-ink">Team</h1>
        <div className="mb-4"><TeamTabs active="requests" /></div>
        <Suspense fallback={<p className="text-sm text-muted">Loading requests…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ request?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
