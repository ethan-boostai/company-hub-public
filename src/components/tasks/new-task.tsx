"use client";

import { useEffect, useRef, useState } from "react";
import { CentredPanel } from "@/components/ui/overlay";
import { REQ_STAGES, builtIn, type ReqStage } from "@/lib/requirements";
import type { PickerTile } from "@/lib/tasks/types";
import { addRequirements, loadPicker, type PickerData } from "@/app/actions/tasks";

// The job page's + New task, as the live Job File's (Task Types, Stage Pick, Site Pick and Multi
// Pick in CBS - Job File): a centred box, Office tasks / On site tasks, Other at the top, tiles grouped
// by stage with Now on the job's current stage. Tick several tiles, then one Add. Tiles already on the
// job show On or Done and open their task; locked tiles say why.

function nowGroups(stage: string | undefined): ReqStage[] {
  if (stage === "estimate") return ["estimate"];
  if (stage === "approved") return ["approved_planning", "approved_onsite"];
  if (stage === "completed") return ["completed"];
  return [];
}

const ICON: Record<string, string> = {
  Survey: "M3 17l6-6 4 4 8-8M14 7h7v7",
  "H&S": "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  Procurement: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  Paperwork: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  Client: "M12 8a3.5 3.5 0 1 0 0-.01M5 20a7 7 0 0 1 14 0",
  Snag: "M5 21V4h11l-2 4 2 4H5",
  Office: "M4 5h16v14H4zM4 9h16",
};

function Tile({ tile, selected, onClick }: { tile: PickerTile; selected: boolean; onClick: () => void }) {
  const locked = !!tile.lock;
  const state = tile.repeatable ? null : tile.state === "on" ? "On" : tile.state === "done" ? "Done" : null;
  const path = ICON[builtIn(tile.key)?.category ?? "Office"] ?? ICON.Office;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={state ? undefined : selected}
      aria-label={`${tile.label}${state ? ` (${state})` : ""}${locked ? " (locked)" : ""}${selected ? " (selected)" : ""}`}
      className={`flex min-h-[46px] items-center gap-2 rounded-[10px] border p-2.5 text-left text-sm ${
        locked
          ? "cursor-not-allowed border-line bg-[#f7f7f5] text-muted"
          : selected
            ? "border-brand bg-[#fff4ea] shadow-[inset_0_0_0_1px_#F47920]"
            : "border-line bg-white hover:border-brand hover:bg-[#fff8f2]"
      }`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[18px] w-[18px] shrink-0 fill-none stroke-[#6b6e70]" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
      <span className="flex-1 min-w-0 leading-tight">{tile.label}</span>
      {locked && <small className="rounded-md bg-[#fff1d6] px-1.5 py-px text-[11px] font-bold text-[#8a5a00]">🔒</small>}
      {state && (
        <small className={`rounded-md px-1.5 py-px text-[11px] font-bold ${state === "Done" ? "bg-[#eef0f2] text-[#5c5f62]" : "bg-[#e6f4ea] text-[#1a7f37]"}`}>{state}</small>
      )}
      {selected && <small className="whitespace-nowrap rounded-md bg-[#fde4d0] px-1.5 py-0.5 text-[11.5px] font-bold text-[#b85a12]">✓ Selected</small>}
    </button>
  );
}

export function NewTaskPicker({
  open,
  jobNo,
  onClose,
  onOpenTask,
  onOther,
  onAdded,
}: {
  open: boolean;
  jobNo: string | null;
  onClose: () => void;
  onOpenTask: (id: number) => void;
  onOther: (side: "office" | "site") => void;
  onAdded: (ids: number[]) => void;
}) {
  const [side, setSide] = useState<"office" | "site">("office");
  const [data, setData] = useState<PickerData | null>(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState<{ text: string; tone: "lock" | "error" | "busy" } | null>(null);
  const [selected, setSelected] = useState<{ key: string; side: "office" | "site" }[]>([]);
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSide("office");
    setMsg(null);
    setSelected([]);
    setData(null);
    setError("");
    requestKey.current = null;
    loadPicker(jobNo)
      .then((d) => !cancelled && (d ? setData(d) : setError("Sign in again to add tasks.")))
      .catch(() => !cancelled && setError("The task list didn't load. Check the connection and try again."));
    return () => { cancelled = true; };
  }, [open, jobNo]);

  const job = data?.job ?? null;
  const now = nowGroups(job?.stage);
  const tiles = (data?.tiles || []).filter((t) => t.sides.includes(side));
  const isSel = (t: PickerTile) => selected.some((s) => s.key === t.key);

  const tap = (t: PickerTile) => {
    if (busy) return;
    if (t.lock) {
      setMsg({ text: t.lock, tone: "lock" });
      return;
    }
    if (!t.repeatable && t.taskId) {
      onOpenTask(t.taskId);
      return;
    }
    setMsg(null);
    setSelected((s) => (s.some((x) => x.key === t.key) ? s.filter((x) => x.key !== t.key) : [...s, { key: t.key, side: t.sides.includes(side) ? side : t.side }]));
  };

  async function add() {
    if (busy || !job || !selected.length) return;
    setBusy(true);
    setMsg({ text: `Adding ${selected.length} task${selected.length === 1 ? "" : "s"}…`, tone: "busy" });
    requestKey.current ??= crypto.randomUUID();
    try {
      const r = await addRequirements(job.jobNo, selected.map((s) => ({ reqKey: s.key, side: s.side })), requestKey.current);
      if (!r.ok || !r.data) {
        requestKey.current = null;
        setMsg({ text: r.message || "Could not add them. Try again.", tone: "error" });
        return;
      }
      onAdded(r.data.ids);
    } catch {
      requestKey.current = null;
      setMsg({ text: "Could not add them. Check your connection and try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  const n = selected.length;
  return (
    <CentredPanel
      open={open}
      onClose={onClose}
      busy={busy}
      title="New task"
      subtitle={job ? `Job ${job.jobNo}. Tick everything this job needs, then Add.` : "Loading the job…"}
      head={
        <div className="mt-2.5 inline-flex overflow-hidden rounded-[9px] border border-[#c4c6c8]" role="group" aria-label="Task side">
          {(["office", "site"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={side === s}
              onClick={() => { setSide(s); setMsg(null); }}
              className={`px-4 py-2 text-sm font-semibold ${side === s ? "bg-dark text-white" : "bg-white text-[#5c5f62]"}`}
            >
              {s === "office" ? "Office tasks" : "On site tasks"}
            </button>
          ))}
        </div>
      }
      footer={
        <div className="flex items-center gap-2">
          <span
            role={msg?.tone === "error" || msg?.tone === "lock" ? "alert" : "status"}
            className={`flex-1 min-w-0 text-sm ${msg?.tone === "error" ? "text-danger" : msg?.tone === "lock" ? "text-[#8a5a00]" : "text-[#5c5f62]"}`}
          >
            {msg ? (msg.tone === "lock" ? `🔒 ${msg.text}` : msg.text) : ""}
          </span>
          <button
            type="button"
            onClick={add}
            disabled={!n || busy}
            className="rounded-lg border border-brand bg-brand px-4 py-2 text-sm font-bold text-white disabled:cursor-default disabled:border-[#f6c6a3] disabled:bg-[#f6c6a3]"
          >
            {n ? `Add ${n} task${n === 1 ? "" : "s"}` : "Add tasks"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-[10px] border border-[#c4c6c8] bg-white px-4 py-2 text-[15px]">
            Cancel
          </button>
        </div>
      }
    >
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-muted">Loading…</p>}
      {job && (
        <>
          <button
            type="button"
            onClick={() => onOther(side)}
            className="mt-3 mb-0.5 flex w-full items-center gap-2 rounded-[10px] border-2 border-brand bg-white p-2.5 text-left text-sm font-semibold hover:bg-[#fff8f2]"
          >
            {side === "site" ? "On site task" : "Other"}
            <small className="font-normal text-muted">· any one-off task{side === "site" ? " for the site" : ""}</small>
          </button>
          {REQ_STAGES.map((g) => {
            const group = tiles.filter((t) => t.stage === g.key);
            if (!group.length) return null;
            return (
              <section key={g.key} aria-label={g.label}>
                <h3 className="flex items-center gap-1.5 pt-3 pb-1.5 text-xs font-bold uppercase tracking-[0.04em] text-[#5c5f62]">
                  {g.label}
                  <span className="font-normal normal-case tracking-normal text-[#8a8d90]">{g.hint}</span>
                  {now.includes(g.key) && <span className="rounded-md bg-[#e8f0f8] px-1.5 py-px text-[11px] normal-case tracking-normal text-[#2c5d8a]">Now</span>}
                </h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
                  {group.map((t) => <Tile key={t.key} tile={t} selected={isSel(t)} onClick={() => tap(t)} />)}
                </div>
              </section>
            );
          })}
        </>
      )}
    </CentredPanel>
  );
}
