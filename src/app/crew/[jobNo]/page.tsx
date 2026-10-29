import type { Metadata } from "next";
import { Suspense } from "react";
import { crewTokenOk } from "@/lib/signons/crew-link";
import { loadCrew } from "./data";
import { CrewClient } from "./crew-client";

export const metadata: Metadata = { title: "CBS Crew", robots: { index: false, follow: false } };

async function Crew({ params, searchParams }: { params: Promise<{ jobNo: string }>; searchParams: Promise<{ t?: string }> }) {
  const [{ jobNo }, { t }] = await Promise.all([params, searchParams]);
  const data = crewTokenOk(jobNo, t) ? await loadCrew(jobNo) : null;
  if (!data) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-xl font-bold mb-2">CBS Crew</h1>
        <p>This link isn&apos;t valid. Ask the office for the job&apos;s crew link.</p>
      </div>
    );
  }
  return <CrewClient data={data} token={t!} />;
}

// A job's crew (onsite) page, opened from the ServiceM8 job: no sign-in, the name is picked for each
// action and never remembered.
export default function CrewPage(props: PageProps<"/crew/[jobNo]">) {
  return (
    <div className="min-h-dvh bg-paper">
      <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
        <Crew params={props.params as Promise<{ jobNo: string }>} searchParams={props.searchParams as Promise<{ t?: string }>} />
      </Suspense>
    </div>
  );
}
