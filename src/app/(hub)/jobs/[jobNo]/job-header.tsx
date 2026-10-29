"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/overlay";
import { STAGES, STAGE_ORDER, jobTitle, stageOf, type Stage } from "@/lib/jobs/stages";
import type { Folder } from "../data";
import type { JobDetail } from "./data";
import { moveJobFolder, setJobStatus, setJobType } from "./actions";

// Pick-one dialog used for both folder and status: any to any, optional note, one Save.
function PickDialog({
  open, title, intro, options, current, onSave, onClose,
}: {
  open: boolean; title: string; intro: string; options: { value: string; label: string }[]; current: string | null;
  onSave: (value: string, note: string, key: string) => Promise<{ ok: boolean; message?: string }>; onClose: () => void;
}) {
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // One key per intended save, made in the browser on the first click and kept for repeats.
  const key = useRef<string | null>(null);
  const close = () => { if (!busy) { setValue(""); setNote(""); setError(""); onClose(); } };
  async function save() {
    if (busy || !value) return;
    setBusy(true);
    setError("");
    try {
      key.current ??= crypto.randomUUID();
      const r = await onSave(value, note, key.current);
      key.current = null;
      if (!r.ok) { setError(r.message || "That didn't work."); return; }
      setValue(""); setNote(""); onClose();
    } catch {
      setError("That didn't work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={close} title={title} busy={busy}>
      <div className="p-5">
        <p className="text-lg font-semibold mb-1">{title}</p>
        <p className="text-sm text-muted mb-3">{intro}</p>
        <div className="flex flex-col gap-1 max-h-[50dvh] overflow-y-auto" role="radiogroup" aria-label={title}>
          {options.map((o) => (
            <label key={o.value} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${o.value === current ? "opacity-50" : "cursor-pointer hover:bg-paper"} ${value === o.value ? "border-brand bg-brand/10" : "border-line"}`}>
              <input type="radio" name="pick" value={o.value} disabled={o.value === current || busy} checked={value === o.value} onChange={() => setValue(o.value)} />
              {o.label}{o.value === current ? " (now)" : ""}
            </label>
          ))}
        </div>
        <label className="block text-sm font-medium mt-4 mb-1" htmlFor="pick-note">Note for ServiceM8 (optional)</label>
        <textarea id="pick-note" spellCheck rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
          className="w-full rounded-lg border border-line px-3 py-2 focus:outline-none focus:border-brand" />
        {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={close} disabled={busy} className="px-4 py-2 rounded-lg border border-line hover:bg-paper disabled:opacity-50">Cancel</button>
          <button type="button" onClick={save} disabled={busy || !value} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function JobHeader({ job, folders }: { job: JobDetail; folders: Folder[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"folder" | "status" | "type" | null>(null);
  const [message, setMessage] = useState("");
  const typeKey = useRef<string | null>(null);
  const stage = stageOf(job.stage);
  const st = STAGES[stage];
  const done = (r: { ok: boolean; message?: string }) => {
    if (r.ok) { setMessage(r.message || ""); router.refresh(); }
    return r;
  };
  const toCdm = job.jobType !== "cdm";
  const strip: Stage[] = ["estimate", "approved", "completed"];

  return (
    <section className="bg-white border border-line rounded-xl p-4 sm:p-5" aria-label="Job details">
      <h2 className="text-xl font-semibold">#{job.jobNo} {jobTitle(job.description)}</h2>
      <p className="text-sm text-muted mt-1">
        {[job.client, job.site.split(/\r?\n/)[0], job.po ? `Client ref ${job.po}` : ""].filter(Boolean).join(" · ") || "No client or site in ServiceM8 yet."}
      </p>
      {job.contact && <p className="text-sm text-muted">Raised by: {job.contact}</p>}

      <ol className="mt-4 flex flex-wrap gap-1 text-sm" aria-label="Stage">
        {strip.map((s) => {
          const idx = STAGE_ORDER.indexOf(s);
          const cur = STAGE_ORDER.indexOf(stage === "unsuccessful" ? "estimate" : stage);
          return (
            <li key={s} className={`rounded-md px-3 py-1 ${s === stage ? "bg-brand text-white font-semibold" : idx < cur ? "bg-brand/20" : "bg-paper text-muted"}`}>
              {STAGES[s].label}
            </li>
          );
        })}
        {stage === "unsuccessful" && <li className={`rounded-md px-3 py-1 font-semibold ${STAGES.unsuccessful.chip}`}>Unsuccessful</li>}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setDialog("status")} className={`rounded-full px-3 py-1.5 text-sm font-semibold ${st.chip}`} aria-label={`Status: ${st.label}. Change status`}>
          {st.label}
        </button>
        <button type="button" onClick={() => setDialog("folder")} className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-paper" aria-label={`Folder: ${job.folderName || "No folder"}. Change folder`}>
          Folder: {job.folderName || "No folder"}
        </button>
        <span className="text-sm">
          {job.jobType === "cdm" ? "CDM job" : "Project job"} ·{" "}
          <button type="button" onClick={() => setDialog("type")} className="underline">
            {toCdm ? "Convert to CDM" : "Convert back to a project"}
          </button>
        </span>
        <a href={`https://go.servicem8.com/openjob/${job.sm8Uuid}`} target="_blank" rel="noopener" className="ml-auto rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
          Open in ServiceM8
        </a>
      </div>
      {message && <p role="status" className="mt-3 text-sm text-ok">{message}</p>}

      <PickDialog
        open={dialog === "folder"}
        title={`Move job #${job.jobNo}`}
        intro="Pick any folder. The status stays as it is."
        options={folders.map((f) => ({ value: f.uuid, label: f.name }))}
        current={job.folderUuid}
        onSave={async (v, note, key) => done(await moveJobFolder(job.jobNo, v, note, key))}
        onClose={() => setDialog(null)}
      />
      <PickDialog
        open={dialog === "status"}
        title={`Set job #${job.jobNo} status`}
        intro="Pick any status. The folder stays as it is."
        options={STAGE_ORDER.map((s) => ({ value: s, label: STAGES[s].label }))}
        current={stage}
        onSave={async (v, note, key) => done(await setJobStatus(job.jobNo, v, note, key))}
        onClose={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog === "type"}
        title={toCdm ? `Convert job ${job.jobNo} to a CDM job?` : `Convert job ${job.jobNo} back to a project?`}
        message={toCdm
          ? "CBS becomes Principal Contractor: CBS permits apply to everyone on site and the visitors log switches on."
          : "All documents are kept."}
        confirmLabel={toCdm ? "Convert to CDM" : "Convert to a project"}
        danger={false}
        onConfirm={async () => {
          typeKey.current ??= crypto.randomUUID();
          const r = await setJobType(job.jobNo, toCdm ? "cdm" : "project", typeKey.current);
          typeKey.current = null;
          return done(r);
        }}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}
