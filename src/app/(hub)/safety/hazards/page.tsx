import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../../_registers/dates";
import { loadHazards } from "../data";
import { HazardsClient } from "./hazards-client";

async function Loader({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [data, sp] = await Promise.all([loadHazards(), searchParams]);
  return <HazardsClient initial={data} today={ukToday()} openId={Number(sp.open) || null} />;
}

// Health and safety > Hazards and CoSHH > Hazards: the company hazard library the RAMS builder uses.
export default function HazardsPage(props: PageProps<"/safety/hazards">) {
  return (
    <>
      <PageHeader title="Hazards and CoSHH" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading the hazard library…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ open?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
