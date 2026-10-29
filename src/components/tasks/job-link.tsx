"use client";

import { useEffect, useState } from "react";
import { SearchSuggest } from "@/components/ui/search-suggest";
import { findJobs } from "@/app/actions/tasks";

// "Link to" on a new one-off task: Nothing (an office task) or a job, found by number, title or client.
export function JobLinkField({ initialJobNo }: { initialJobNo: string | null }) {
  const [mode, setMode] = useState<"none" | "job">(initialJobNo ? "job" : "none");
  const [job, setJob] = useState<{ jobNo: string; title: string } | null>(initialJobNo ? { jobNo: initialJobNo, title: "" } : null);
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
    <fieldset className="mb-4">
      <legend className="block text-sm font-medium mb-1">Link to</legend>
      <input type="hidden" name="jobNo" value={mode === "job" && job ? job.jobNo : ""} />
      <div className="flex rounded-lg border border-line overflow-hidden w-fit mb-2">
        {(["none", "job"] as const).map((m) => (
          <label key={m} className={`px-3 py-1.5 text-sm cursor-pointer border-r border-line last:border-r-0 ${mode === m ? "bg-brand text-white font-semibold" : "hover:bg-paper"}`}>
            <input type="radio" name="linkTo" value={m} checked={mode === m} onChange={() => setMode(m)} className="sr-only" />
            {m === "none" ? "Nothing" : "Job"}
          </label>
        ))}
      </div>
      {mode === "job" &&
        (job ? (
          <p className="text-sm">
            <span className="font-medium">Job {job.jobNo}</span>
            {job.title && <span className="text-muted"> · {job.title}</span>}{" "}
            <button type="button" className="underline ml-1" onClick={() => { setJob(null); setQ(""); }}>Change</button>
          </p>
        ) : (
          <SearchSuggest
            value={q}
            onChange={setQ}
            results={hits.map((h) => ({ key: h.jobNo, title: `#${h.jobNo} ${h.title}`, sub: h.client }))}
            busy={!!term && found.term !== term}
            onPick={(s) => setJob({ jobNo: s.key, title: hits.find((h) => h.jobNo === s.key)?.title || "" })}
            placeholder="Find the job: number, title or client"
            label="Find the job"
            emptyText="No job matches."
          />
        ))}
      {mode === "none" && <p className="text-xs text-muted">An office task with no job. Tasks with no job don&apos;t take file uploads.</p>}
    </fieldset>
  );
}
