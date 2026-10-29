import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../../_registers/dates";
import { loadSubstances } from "../data";
import { CoshhClient } from "./coshh-client";

async function Loader({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [data, sp] = await Promise.all([loadSubstances(), searchParams]);
  return <CoshhClient initial={data} today={ukToday()} openId={Number(sp.open) || null} />;
}

// Health and safety > Hazards and CoSHH > CoSHH: the company CoSHH register (one assessment per
// substance, with its safety data sheet and CoSHH pack).
export default function CoshhPage(props: PageProps<"/safety/coshh">) {
  return (
    <>
      <PageHeader title="Hazards and CoSHH" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading the CoSHH register…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ open?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
