import Link from "next/link";
import { Suspense } from "react";
import { searchHub } from "@/lib/search";
import { OpenTask } from "./open-task";
import { PageHeader } from "@/components/shell/page-header";

// Global search: jobs (number, description, client), tasks and people. The header box lists the
// same results as you type; this page shows them all.
function Group({ title, q, children, count }: { title: string; q: string; children: React.ReactNode; count: number }) {
  return (
    <section className="bg-white border border-line rounded-xl mb-4" aria-label={title}>
      <h2 className="px-4 pt-4 pb-2 font-semibold">{title} ({count})</h2>
      {count === 0 ? <p className="px-4 pb-4 text-sm text-muted">No {title.toLowerCase()} match &ldquo;{q}&rdquo;.</p> : <ul className="divide-y divide-line">{children}</ul>}
    </section>
  );
}

async function Results({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = String((await searchParams).q || "").trim().slice(0, 100);
  if (!q) return <p className="text-sm text-muted">Type in the search box at the top.</p>;
  const r = await searchHub(q, 50);
  return (
    <>
      <Group title="Jobs" q={q} count={r.jobs.length}>
        {r.jobs.map((h) => (
          <li key={h.id} className="px-4 py-3">
            <Link href={h.href} className="font-medium underline">{h.title}</Link>
            <span className="block text-sm text-muted">{h.sub}</span>
          </li>
        ))}
      </Group>
      <Group title="Tasks" q={q} count={r.tasks.length}>
        {r.tasks.map((h) => (
          <li key={h.id} className="px-4 py-3">
            <OpenTask id={h.id} title={h.title} />
            <span className="block text-sm text-muted">{h.sub}</span>
          </li>
        ))}
      </Group>
      <Group title="People" q={q} count={r.people.length}>
        {r.people.map((h) => (
          <li key={h.id} className="px-4 py-3">
            <Link href={h.href} className="font-medium underline">{h.title}</Link>
            {h.sub && <span className="text-sm text-muted"> · {h.sub}</span>}
          </li>
        ))}
      </Group>
    </>
  );
}

async function SearchHeader({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = String((await searchParams).q || "");
  return <PageHeader title="Search" search={q} />;
}

export default function SearchPage(props: PageProps<"/search">) {
  const sp = props.searchParams as Promise<{ q?: string }>;
  return (
    <>
      <Suspense fallback={<PageHeader title="Search" />}>
        <SearchHeader searchParams={sp} />
      </Suspense>
      <main className="p-4 sm:p-6 max-w-4xl">
        <Suspense fallback={<p className="text-sm text-muted">Searching…</p>}>
          <Results searchParams={sp} />
        </Suspense>
      </main>
    </>
  );
}
