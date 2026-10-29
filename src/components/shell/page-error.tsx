"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";

// Shown in place of a page that failed to load (for example the database didn't answer in time),
// instead of leaving "Loading…" on screen. Server error details stay in the logs.
export function PageError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <main className="p-6 max-w-xl" role="alert">
      <h1 className="text-lg font-semibold mb-2">This page couldn&apos;t load</h1>
      <p className="text-sm text-muted mb-4">
        The hub didn&apos;t get an answer from the database in time. Nothing you saved earlier is affected. Try again in a moment.
      </p>
      <button
        type="button"
        onClick={() => startTransition(() => { router.refresh(); reset(); })}
        className="rounded-lg bg-brand px-4 py-2 font-semibold text-white"
      >
        Try again
      </button>
    </main>
  );
}
