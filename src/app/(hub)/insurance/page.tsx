import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../_registers/dates";
import { loadInsurance } from "./data";
import { InsuranceClient, type Tab } from "./insurance-client";
import type { Open } from "./types";

type Params = { policy?: string; claim?: string; cert?: string; add?: string; vehicle?: string; accident?: string; asset?: string };
const id = (v: string | undefined) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : undefined);

// Links from other registers: ?claim=5 opens a claim; ?add=claim&vehicle=3 (or accident=, asset=)
// opens a new claim linked to that record.
function startFrom(sp: Params): { open: Open | null; tab: Tab } {
  if (id(sp.claim)) return { open: { kind: "claim", id: id(sp.claim)! }, tab: "claims" };
  if (sp.add === "claim") return { open: { kind: "claim", id: null, vehicleId: id(sp.vehicle), accidentId: id(sp.accident), assetId: id(sp.asset) }, tab: "claims" };
  if (id(sp.policy)) return { open: { kind: "policy", id: id(sp.policy)! }, tab: "policies" };
  if (id(sp.cert)) return { open: { kind: "cert", id: id(sp.cert)! }, tab: "certs" };
  return { open: null, tab: "policies" };
}

async function Loader({ searchParams }: { searchParams: Promise<Params> }) {
  const [data, sp] = await Promise.all([loadInsurance(), searchParams]);
  const { open, tab } = startFrom(sp);
  return <InsuranceClient initial={data} today={ukToday()} start={open} startTab={tab} />;
}

export default function InsurancePage(props: PageProps<"/insurance">) {
  return (
    <>
      <PageHeader title="Insurance and accreditations" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading insurance and accreditations…</p>}>
          <Loader searchParams={props.searchParams as Promise<Params>} />
        </Suspense>
      </main>
    </>
  );
}
