import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { requirePerson } from "@/lib/auth/session";
import { ukToday } from "../../_registers/dates";
import { loadPolicy } from "../policy-data";
import { PolicyClient } from "./policy-client";

async function Loader() {
  const person = await requirePerson();
  const data = await loadPolicy(person.id);
  return <PolicyClient initial={data} today={ukToday()} />;
}

// Health and safety > Policy and manual: the H&S policy statement (General Statement) and the H&S
// manual, one record per issue.
export default function PolicyPage() {
  return (
    <>
      <PageHeader title="Policy and manual" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading the policy and manual…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
