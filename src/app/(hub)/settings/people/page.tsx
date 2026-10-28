import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { listPeople } from "./data";
import { PeopleClient } from "./people-client";

async function PeopleLoader({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [people, sp] = await Promise.all([listPeople(), searchParams]);
  return <PeopleClient people={people} openId={Number(sp.open) || null} />;
}

export default function PeoplePage(props: PageProps<"/settings/people">) {
  return (
    <>
      <PageHeader title="People" />
      <main className="p-4 sm:p-6 max-w-5xl">
        <Suspense fallback={<p className="text-sm text-muted">Loading people…</p>}>
          <PeopleLoader searchParams={props.searchParams as Promise<{ open?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
