import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { getOptions } from "@/lib/select-options";
import { listDemoFiles, listDemoNotes } from "./data";
import { SharedPartsClient } from "./shared-parts-client";

async function Loader() {
  const [notes, files, colours] = await Promise.all([listDemoNotes(), listDemoFiles(), getOptions("demo.colour")]);
  return <SharedPartsClient notes={notes} files={files} colours={colours} />;
}

export default function SharedPartsPage() {
  return (
    <>
      <PageHeader title="Shared parts" />
      <main className="p-4 sm:p-6 max-w-4xl">
        <p className="text-sm text-muted mb-4">
          The building blocks every page uses. Use this page to test them. Test data only: nothing here touches real jobs.
        </p>
        <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
