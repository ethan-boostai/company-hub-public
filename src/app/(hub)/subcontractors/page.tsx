import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../_registers/dates";
import { loadCompanies } from "./data";
import { CompaniesClient } from "./companies-client";

async function Loader() {
  const data = await loadCompanies();
  return <CompaniesClient initial={data} today={ukToday()} />;
}

export default function SubcontractorsPage() {
  return (
    <>
      <PageHeader title="Subcontractors and suppliers" />
      <main className="p-4 sm:p-6 max-w-6xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading subcontractors and suppliers…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
