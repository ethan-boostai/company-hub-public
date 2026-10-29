import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { readDb } from "@/lib/db";
import { jobTypes } from "@/lib/rams/data";
import { TemplatesClient } from "./templates-client";

async function Loader() {
  const sql = await readDb();
  const [types, used] = await Promise.all([
    jobTypes(sql, true),
    sql<{ template_key: string; n: number }[]>`select template_key, count(*)::int as n from rams where template_key is not null group by template_key`,
  ]);
  const counts = Object.fromEntries(used.map((u) => [u.template_key, u.n]));
  return (
    <TemplatesClient
      rows={types.map((t) => ({
        id: t.id, key: t.key, name: t.name, status: t.status,
        steps: Array.isArray(t.template.steps) ? t.template.steps.length : 0,
        hazards: Array.isArray(t.template.hazards) ? t.template.hazards.length : 0,
        used: counts[t.key] ?? 0,
      }))}
    />
  );
}

// Health and safety > Templates: what new documents start from. RAMS job types for now; toolbox talk
// topics and CPHSP wording join as those parts are built.
export default function TemplatesPage() {
  return (
    <>
      <PageHeader title="Templates" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading templates…</p>}>
          <Loader />
        </Suspense>
      </main>
    </>
  );
}
