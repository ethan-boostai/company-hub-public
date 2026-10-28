import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { listTasks } from "@/lib/tasks/data";
import { ActionsBoard } from "./board";

async function Loader({ searchParams }: { searchParams: Promise<{ older?: string }> }) {
  const older = (await searchParams).older === "1";
  // The full list. Filters are applied on the device (office only); the TV will use this same list
  // with no filters at all.
  const tasks = await listTasks({ doneDays: older ? null : 7 });
  return <ActionsBoard tasks={tasks} olderShown={older} />;
}

export default function ActionsPage(props: PageProps<"/actions">) {
  return (
    <>
      <PageHeader title="Actions board" />
      <main className="p-4 sm:p-6">
        <Suspense fallback={<p className="text-sm text-muted">Loading tasks…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ older?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
