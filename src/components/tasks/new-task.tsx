"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { REQ_STAGES, type ReqStage } from "@/lib/requirements";
import type { NewTaskDraft, PickerTile } from "@/lib/tasks/types";
import { findJobs, loadPicker, type PickerData } from "@/app/actions/tasks";

// Which stage groups are "Now" for a job.
function nowGroups(stage: string | undefined): ReqStage[] {
  if (stage === "estimate") return ["estimate"];
  if (stage === "approved") return ["approved_planning", "approved_onsite"];
  if (stage === "completed") return ["completed"];
  return [];
}

function TileButton({ tile, onClick }: { tile: PickerTile; onClick: () => void }) {
  const locked = !!tile.lock;
  const badge =
    tile.repeatable
      ? tile.open + tile.done > 0 ? `${tile.open} open · ${tile.done} done` : null
      : tile.state === "on" ? "On" : tile.state === "done" ? "Done" : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${tile.label}${badge ? ` (${badge})` : ""}${locked ? " (locked)" : ""}`}
      className={`text-left rounded-lg border px-3 py-2 text-sm min-h-[3.25rem] ${locked ? "border-line bg-paper text-muted" : tile.state === "available" ? "border-line bg-white hover:border-brand" : "border-brand/40 bg-brand/5"}`}
    >
      <span className="flex items-start gap-1.5">
        <span className="flex-1 font-medium">{tile.label}</span>
        {locked && <span aria-hidden="true">🔒</span>}
      </span>
      <span className="mt-1 flex flex-wrap gap-1 text-xs">
        {badge && (
          <span className={`rounded px-1.5 py-0.5 font-semibold ${tile.state === "done" ? "bg-[#ececea] text-[#3d4043]" : "bg-[#e6f4ea] text-[#1a7f37]"}`}>{badge}</span>
        )}
        {tile.cdm && <span className="rounded px-1.5 py-0.5 bg-[#e3edf9] text-[#1f4e8c]">CDM</span>}
        {tile.repeatable && <span className="text-muted">Adds a new one each time</span>}
      </span>
    </button>
  );
}

// + New task: Office tasks / On site tasks, Other (one-off) at the top, requirements grouped by stage.
// A non-repeatable requirement already on the job shows On or Done and opens that task.
export function NewTaskPicker({
  open,
  jobNo: initialJobNo,
  onClose,
  onDraft,
  onOpenTask,
}: {
  open: boolean;
  jobNo: string | null;
  onClose: () => void;
  onDraft: (d: NewTaskDraft, people: { id: number; name: string }[]) => void;
  onOpenTask: (id: number) => void;
}) {
  const [side, setSide] = useState<"office" | "site">("office");
  const [jobNo, setJobNo] = useState<string | null>(initialJobNo);
  const [data, setData] = useState<PickerData | null>(null);
  const [error, setError] = useState("");
  const [lockMsg, setLockMsg] = useState("");
  const [filter, setFilter] = useState("");
  const [jobQuery, setJobQuery] = useState("");
  const [jobHits, setJobHits] = useState<{ jobNo: string; title: string; client: string }[]>([]);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobNo(initialJobNo);
    setSide("office");
    setLockMsg("");
    setFilter("");
    setJobQuery("");
    setJobHits([]);
  }, [open, initialJobNo]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setError("");
    loadPicker(jobNo)
      .then((d) => !cancelled && (d ? setData(d) : setError("Sign in again to add tasks.")))
      .catch(() => !cancelled && setError("The task list didn't load. Check the connection and try again."));
    return () => { cancelled = true; };
  }, [open, jobNo]);

  useEffect(() => {
    if (!open || jobNo || !jobQuery.trim()) return;
    let cancelled = false;
    const t = setTimeout(() => findJobs(jobQuery).then((r) => !cancelled && setJobHits(r)).catch(() => undefined), 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [open, jobNo, jobQuery]);

  const job = data?.job ?? null;
  const now = nowGroups(job?.stage);
  const needle = filter.trim().toLowerCase();
  const tiles = (data?.tiles || []).filter((t) => t.side === side && (!needle || t.label.toLowerCase().includes(needle)));
  const people = data?.people || [];

  const pick = (t: PickerTile) => {
    if (t.lock) {
      setLockMsg(t.lock);
      return;
    }
    if (!t.repeatable && t.taskId) {
      onOpenTask(t.taskId);
      return;
    }
    onDraft({ jobId: job?.id ?? null, jobNo: job?.jobNo ?? null, reqKey: t.key, title: "", side: t.side }, people);
  };

  return (
    <Drawer open={open} onClose={onClose} title="New task" width="max-w-2xl">
      {error && <p role="alert" className="text-sm text-danger mb-3">{error}</p>}

      <div className="mb-4">
        {job ? (
          <p className="text-sm">
            Job <span className="font-semibold">{job.jobNo}</span> · {job.title}{" "}
            {!initialJobNo && <button type="button" className="underline ml-1" onClick={() => setJobNo(null)}>Change job</button>}
          </p>
        ) : (
          <div>
            <p className="text-sm text-muted mb-2">No job chosen: this will be an office task with no job. To add a requirement, choose the job.</p>
            <SearchBox value={jobQuery} onChange={setJobQuery} placeholder="Find a job: number, title or client" label="Find a job" />
            {jobHits.length > 0 && (
              <ul className="mt-1 border border-line rounded-lg divide-y divide-line bg-white">
                {jobHits.map((h) => (
                  <li key={h.jobNo}>
                    <button type="button" onClick={() => setJobNo(h.jobNo)} className="w-full text-left px-3 py-2 text-sm hover:bg-paper">
                      #{h.jobNo} {h.title} <span className="text-muted">{h.client}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="flex rounded-lg border border-line overflow-hidden w-fit mb-4" role="group" aria-label="Task side">
        {(["office", "site"] as const).map((s) => (
          <button key={s} type="button" aria-pressed={side === s} onClick={() => { setSide(s); setLockMsg(""); }}
            className={`px-4 py-1.5 text-sm ${side === s ? "bg-brand text-white font-semibold" : "hover:bg-paper"}`}>
            {s === "office" ? "Office tasks" : "On site tasks"}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onDraft({ jobId: job?.id ?? null, jobNo: job?.jobNo ?? null, reqKey: null, title: "", side: job ? side : "office" }, people)}
        className="w-full text-left rounded-lg border-2 border-dashed border-brand/60 px-3 py-3 mb-4 hover:bg-brand/5"
      >
        <span className="font-semibold">{side === "site" && job ? "On site task" : "Other"}</span>
        <span className="text-sm text-muted"> · any one-off task{side === "site" && job ? " for the site" : ""}</span>
      </button>

      {lockMsg && <p role="alert" className="mb-3 rounded-lg bg-paper px-3 py-2 text-sm">🔒 {lockMsg}</p>}

      {job && (
        <>
          <div className="mb-3">
            <SearchBox value={filter} onChange={setFilter} placeholder="Filter the list" label="Filter requirements" />
          </div>
          {!data && !error && <p className="text-sm text-muted">Loading…</p>}
          {REQ_STAGES.map((g) => {
            const group = tiles.filter((t) => t.stage === g.key);
            if (!group.length) return null;
            return (
              <section key={g.key} className="mb-4" aria-label={g.label}>
                <h3 className="font-semibold text-sm mb-1.5">
                  {g.label} <span className="font-normal text-muted">· {g.hint}</span>
                  {now.includes(g.key) && <span className="ml-2 rounded bg-brand px-1.5 py-0.5 text-xs text-white">Now</span>}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {group.map((t) => <TileButton key={t.key} tile={t} onClick={() => pick(t)} />)}
                </div>
              </section>
            );
          })}
        </>
      )}
    </Drawer>
  );
}
