import type { Metadata } from "next";
import { Suspense } from "react";
import { teamKeyOk } from "../team/key";
import { loadYardData } from "./data";
import { YardApp } from "./yard-app";

export const metadata: Metadata = { title: "CBS Yard", robots: { index: false, follow: false } };

async function Yard({ searchParams }: { searchParams: Promise<{ k?: string }> }) {
  const { k } = await searchParams;
  if (!teamKeyOk(k)) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold mb-2">CBS Yard</h1>
        <p>Ask the office for the yard link.</p>
      </div>
    );
  }
  return <YardApp data={await loadYardData()} teamKey={k!} />;
}

// The yard tablet: opened with the team-app link key, no sign-in, name picked for each action and
// never remembered (a shared device).
export default function YardPage(props: PageProps<"/yard">) {
  return (
    <div className="min-h-dvh bg-paper">
      <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
        <Yard searchParams={props.searchParams as Promise<{ k?: string }>} />
      </Suspense>
    </div>
  );
}
