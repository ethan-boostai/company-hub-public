import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { getCurrentPerson } from "@/lib/auth/session";
import { ukToday } from "../_registers/dates";
import { loadEquipment } from "./data";
import { EquipmentClient } from "./equipment-client";

async function EquipmentLoader({ searchParams }: { searchParams: Promise<{ report?: string; asset?: string; material?: string }> }) {
  const [data, person, sp] = await Promise.all([loadEquipment(), getCurrentPerson(), searchParams]);
  return <EquipmentClient initial={data} today={ukToday()} me={person?.name ?? ""} openReportId={Number(sp.report) || null}
    openAssetId={Number(sp.asset) || null} openMaterialId={Number(sp.material) || null} />;
}

export default function EquipmentPage(props: PageProps<"/equipment">) {
  return (
    <>
      <PageHeader title="Equipment and materials" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading equipment and materials…</p>}>
          <EquipmentLoader searchParams={props.searchParams as Promise<{ report?: string; asset?: string; material?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
