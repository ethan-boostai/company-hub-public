import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { ukToday } from "../_registers/dates";
import { loadTraining } from "./data";
import { TrainingClient } from "./training-client";

async function Loader({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [data, sp] = await Promise.all([loadTraining(), searchParams]);
  return <TrainingClient initial={data} today={ukToday()} start={sp.view === "matrix" ? "matrix" : "records"} />;
}

export default function TrainingPage(props: PageProps<"/training">) {
  return (
    <>
      <PageHeader title="Team training" />
      <main className="p-4 sm:p-6 max-w-6xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading team training…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ view?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
