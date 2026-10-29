import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { readDb } from "@/lib/db";
import { fromTemplate, type JobTypeTemplate } from "@/lib/rams/content";
import { builderLists, jobTypes } from "@/lib/rams/data";
import { JobTypeEditor } from "./job-type-editor";

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const sql = await readDb();
  const t = (await jobTypes(sql, true)).find((x) => x.id === id);
  if (!t) notFound();
  const lists = await builderLists(sql);
  const start = fromTemplate(t.template as Partial<JobTypeTemplate>, lists.hazards);
  start.content.steps = start.content.steps.filter((s) => s.group === "task");
  // Hazards the job type names that are retired or gone from the library: listed, so they aren't lost silently.
  const missing = ((t.template.hazards as string[] | undefined) ?? []).filter((k) => !lists.hazards.some((h) => h.ramsKey === k));
  return <JobTypeEditor id={t.id} name={t.name} status={t.status} activity={start.title || t.name} content={start.content} lists={lists} missing={missing} />;
}

// Templates > RAMS job types > one job type, in the RAMS builder (template mode).
export default function JobTypePage(props: { params: Promise<{ id: string }> }) {
  return (
    <>
      <PageHeader title="Templates" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading the job type…</p>}>
          <Loader params={props.params} />
        </Suspense>
      </main>
    </>
  );
}
