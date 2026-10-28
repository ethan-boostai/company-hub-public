import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { builtInTypes, customTypes } from "@/lib/tasks/requirement-types";
import { RequirementTypesClient } from "./client";

async function Loader() {
  const custom = await customTypes(true);
  return <RequirementTypesClient custom={custom} builtIn={builtInTypes()} />;
}

export default function RequirementTypesPage() {
  return (
    <>
      <PageHeader title="Requirement types" />
      <main className="p-4 sm:p-6 max-w-4xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
