"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SearchSuggest } from "@/components/ui/search-suggest";
import { findJobs } from "@/app/actions/tasks";

// The claim's job: found by number, title or client from the hub's jobs (ServiceM8 is the master).
// An old claim's number that the hub doesn't hold is shown as it is until a job is picked.
export function ClaimJobField({ jobNo, jobId, jobTitle, error }: { jobNo: string; jobId: number | null; jobTitle: string; error?: string }) {
  const [job, setJob] = useState<{ jobNo: string; title: string; known: boolean } | null>(jobNo ? { jobNo, title: jobTitle, known: !!jobId } : null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<{ term: string; hits: { jobNo: string; title: string; client: string }[] }>({ term: "", hits: [] });
  const term = q.trim();
  const hits = found.term === term ? found.hits : [];

  useEffect(() => {
    if (!term) return;
    let cancelled = false;
    const t = setTimeout(() => findJobs(term).then((r) => !cancelled && setFound({ term, hits: r })).catch(() => !cancelled && setFound({ term, hits: [] })), 150);
    return () => { cancelled = true; clearTimeout(t); };
  }, [term]);

  return (
    <div className="mb-4">
      <p className="block text-sm font-medium mb-1">Job</p>
      <input type="hidden" name="job_no" value={job?.jobNo ?? ""} />
      {job ? (
        <p className="text-sm" data-testid="claim-job">
          {job.known ? <Link href={`/jobs/${encodeURIComponent(job.jobNo)}`} className="font-medium underline">Job {job.jobNo}</Link> : <span className="font-medium">Job {job.jobNo}</span>}
          {job.title && <span className="text-muted"> · {job.title}</span>}
          {!job.known && <span className="text-muted"> (not a job in the hub)</span>}{" "}
          <button type="button" className="underline ml-1" onClick={() => { setJob(null); setQ(""); }}>Change</button>
        </p>
      ) : (
        <SearchSuggest
          value={q}
          onChange={setQ}
          results={hits.map((h) => ({ key: h.jobNo, title: `#${h.jobNo} ${h.title}`, sub: h.client }))}
          busy={!!term && found.term !== term}
          onPick={(s) => setJob({ jobNo: s.key, title: hits.find((h) => h.jobNo === s.key)?.title || "", known: true })}
          placeholder="Find the job: number, title or client (optional)"
          label="Find the job"
          emptyText="No job matches."
        />
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
