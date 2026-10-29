import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { listPeople } from "./data";
import { PeopleClient } from "./people-client";

async function PeopleLoader({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const [people, sp] = await Promise.all([listPeople(), searchParams]);
  return <PeopleClient people={people} openId={Number(sp.open) || null} />;
}

// People and companies > Team (the Team tab).
export default function TeamPage(props: PageProps<"/people">) {
  return (
    <>
      <PageHeader title="Team" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading the team…</p>}>
          <PeopleLoader searchParams={props.searchParams as Promise<{ open?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
