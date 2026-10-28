import type { Metadata } from "next";
import { Suspense } from "react";
import { loadTeamData } from "./data";
import { teamKeyOk } from "./key";
import { TeamApp } from "./team-app";

export const metadata: Metadata = { title: "CBS Team", robots: { index: false, follow: false } };

async function Team({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  if (!teamKeyOk(k)) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold mb-2">CBS Team</h1>
        <p>Ask the office for the team link.</p>
      </div>
    );
  }
  return <TeamApp data={await loadTeamData()} teamKey={k!} />;
}

// The team app: open link, no sign-in, name picked for each report and never remembered.
export default function TeamPage(props: PageProps<"/team">) {
  return (
    <div className="min-h-dvh bg-paper">
      <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
        <Team searchParams={props.searchParams as Promise<{ k?: string }>} />
      </Suspense>
    </div>
  );
}
