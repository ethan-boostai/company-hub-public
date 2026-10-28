import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../_registers/dates";
import { loadFleet } from "./data";
import { FleetClient } from "./fleet-client";

async function FleetLoader({ searchParams }: { searchParams: Promise<{ vehicle?: string }> }) {
  const [data, sp] = await Promise.all([loadFleet(), searchParams]);
  return <FleetClient initial={data} today={ukToday()} openVehicleId={Number(sp.vehicle) || null} />;
}

export default function FleetPage(props: PageProps<"/fleet">) {
  return (
    <>
      <PageHeader title="Fleet" />
      <main className="p-4 sm:p-6 max-w-6xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading the fleet…</p>}>
          <FleetLoader searchParams={props.searchParams as Promise<{ vehicle?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
