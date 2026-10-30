import type { ReactNode } from "react";

// The message a Site page shows while its job is still at Estimate (Site pages unlock at Approved).
export function EstimateLock({ label, jobNo }: { label: string; jobNo: string }) {
  return (
    <div className="m-4 sm:m-6 bg-white border border-line rounded-xl p-5 max-w-xl">
      <h2 className="text-lg font-semibold mb-2">{label}</h2>
      <p className="text-sm text-muted">{label} unlocks after approval. Job {jobNo} is still at Estimate.</p>
    </div>
  );
}

// A table cell with a grey second line (the shared table only shows `sub` in its first column).
export function TwoLine({ main, sub }: { main: ReactNode; sub?: ReactNode }) {
  return (
    <>
      {main}
      {sub ? <span className="block text-sm text-muted">{sub}</span> : null}
    </>
  );
}
