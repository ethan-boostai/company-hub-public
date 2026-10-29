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
      <PageHeader title="Training and qualifications" bare />
      {/* Team > Training and qualifications: the Team page's tabs (People and companies > Team). */}
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading training and qualifications…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ view?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
