import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/shell/page-header";

// Global search. Searches people for now; jobs, tasks and records are added as each phase lands.
async function Results({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = String((await searchParams).q || "").trim().slice(0, 100);
  if (!q) return <p className="text-sm text-muted">Type in the search box at the top.</p>;
  const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const people = await db()<{ id: string; name: string; role: string | null; active: boolean }[]>`
    select id, name, role, active from people
    where name ilike ${like} or role ilike ${like} or email ilike ${like}
    order by active desc, lower(name) limit 50`;
  return (
    <div className="bg-white border border-line rounded-xl">
      <h2 className="px-4 pt-4 pb-2 font-semibold">People ({people.length})</h2>
      {people.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted">No people match &ldquo;{q}&rdquo;.</p>
      ) : (
        <ul className="divide-y divide-line">
          {people.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <Link href={`/settings/people?open=${p.id}`} className="font-medium underline">{p.name}</Link>
              <span className="text-sm text-muted"> {p.role ? `· ${p.role}` : ""}{p.active ? "" : " · left"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
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
