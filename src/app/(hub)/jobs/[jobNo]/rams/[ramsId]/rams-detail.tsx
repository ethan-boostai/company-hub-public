"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RamsEditor, type EditorValue } from "@/components/rams/rams-editor";
import { SignOnForm } from "@/components/signons/sign-on-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { inputClass } from "@/components/ui/fields";
import { Modal } from "@/components/ui/overlay";
import { TOP_BTN } from "@/components/ui/page-top";
import { MenuButton, type MenuItem } from "@/components/ui/menu-button";
import { UploadFile } from "@/components/ui/upload-file";
import { ramsNo } from "@/lib/rams/content";
import type { BuilderLists, RamsRow } from "@/lib/rams/data";
import { niceDate, niceDateTime } from "../../../../_registers/dates";
import { statusPill } from "../rams-list-client";
import {
  addLibraryHazard, deleteRamsDraft, issueRams, newRevision, officeSignOn, reviewSubRams, saveAsJobType, saveRams, setSubRamsFile,
} from "../actions";

type Signed = { name: string; company: string; signedAt: string; via: string };
type Msg = { ok: boolean; text: string } | null;
const key = () => crypto.randomUUID();
const toValue = (r: RamsRow): EditorValue => ({ title: r.title, preparedById: r.preparedById, approvedById: r.approvedById, approverRole: r.approverRole, dated: r.dated, notes: r.notes, content: r.content });

export function RamsDetail({ initial, lists, revisions, signed, names, changed }: {
  initial: RamsRow; lists: BuilderLists; revisions: { id: number; revision: number; status: string }[]; signed: Signed[];
  names: { today: string[]; crew: string[] }; changed: string[];
}) {
  const router = useRouter();
  const [r, setR] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [signing, setSigning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [jobTypeName, setJobTypeName] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState(initial.reviewNote);
  const no = ramsNo(r.jobNo, r.seq);
  const heading = r.kind === "cbs" ? `RAMS ${no} rev ${r.revision}` : `Subcontractor RAMS ${no}`;

  async function run<T>(fn: () => Promise<{ ok: boolean; message?: string; data?: T }>, done?: (d: T) => void) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ ok: res.ok, text: res.message ?? (res.ok ? "Saved." : "It wasn't saved.") });
      if (res.ok && res.data !== undefined) done?.(res.data);
    } catch {
      setMsg({ ok: false, text: "It wasn't saved. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  async function issue(v: EditorValue, saved: boolean) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      if (!saved) {
        const s = await saveRams(r.id, v, key());
        if (!s.ok) { setMsg({ ok: false, text: s.message }); return; }
      }
      const res = await issueRams(r.id, key());
      setMsg({ ok: res.ok, text: res.message ?? "" });
      if (res.ok && res.data) { setR(res.data); router.refresh(); }
    } catch {
      setMsg({ ok: false, text: "It wasn't issued. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const more: MenuItem[] = [];
  if (r.kind === "cbs" && r.status !== "draft") {
    more.push({ label: "Create new revision", hint: "A draft copy to change and issue again", onSelect: () => run(() => newRevision(r.id, key()), (d) => router.push(`/jobs/${r.jobNo}/rams/${d.id}`)) });
  }
  if (r.kind === "cbs") more.push({ label: "Save as job type", hint: "Use this RAMS to start others (Templates)", onSelect: () => setJobTypeName(r.title) });
  if (r.kind === "subcontractor" || r.status === "draft") more.push({ label: r.kind === "cbs" ? "Delete draft" : "Delete", danger: true, onSelect: () => setConfirmDelete(true) });

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <Link href={`/jobs/${r.jobNo}/rams`} className="text-sm underline">All RAMS on job {r.jobNo}</Link>
      <div className="mt-2 mb-4 flex flex-wrap items-start gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-3xl font-bold text-ink">{heading}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base text-muted">
            <span className="inline-block w-28">{statusPill(r)}</span>
            <span>{r.title}</span>
            {r.issuedAt && <span>· Issued {niceDate(r.issuedAt.slice(0, 10))} by {r.issuedBy}</span>}
          </div>
        </div>
        {more.length > 0 && <MenuButton label="More" items={more} />}
      </div>

      {revisions.length > 1 && r.kind === "cbs" && (
        <nav aria-label="Revisions" className="mb-4 flex flex-wrap gap-2 text-sm">
          {revisions.map((x) => (
            <Link key={x.id} href={`/jobs/${r.jobNo}/rams/${x.id}`} aria-current={x.id === r.id ? "page" : undefined}
              className={`rounded-full border px-3 py-1 ${x.id === r.id ? "border-dark bg-dark text-white" : "border-line bg-white"}`}>
              Rev {x.revision} ({x.status === "issued" ? "Issued" : x.status === "draft" ? "Draft" : "Superseded"})
            </Link>
          ))}
        </nav>
      )}

      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.text}</p>}

      {r.kind === "subcontractor" ? (
        <div className="rounded-xl border border-line bg-white p-5">
          <dl className="mb-4 grid grid-cols-[9rem_1fr] gap-y-2 text-sm">
            <dt className="font-semibold">Subcontractor</dt><dd>{r.subcontractor || "-"}</dd>
            <dt className="font-semibold">Covers</dt><dd>{r.title}</dd>
            <dt className="font-semibold">File</dt>
            <dd>{r.fileId ? <button type="button" className="underline" onClick={() => setViewing({ id: r.fileId!, name: r.fileName, mime: "" })}>Open {r.fileName}</button> : "Not uploaded yet"}</dd>
          </dl>
          <div className="mb-5">
            <UploadFile entityTable="rams" entityId={r.id} jobId={r.jobId} role="subcontractor-rams" label={r.fileId ? "Upload new version" : "Upload file"}
              onUploaded={(f) => run(() => setSubRamsFile(r.id, f.id, key()), (d) => setR(d))} />
          </div>
          <label className="mb-3 block">
            <span className="block text-sm font-medium mb-1">Review note (needed to reject)</span>
            <textarea value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} rows={3} spellCheck className={inputClass} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="button" disabled={busy || !r.fileId} onClick={() => run(() => reviewSubRams(r.id, "approved", reviewNote, key()), (d) => setR(d))} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">Approve</button>
            <button type="button" disabled={busy} onClick={() => run(() => reviewSubRams(r.id, "rejected", reviewNote, key()), (d) => setR(d))} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold disabled:opacity-50">Reject</button>
          </div>
        </div>
      ) : (
        <>
          {r.status !== "draft" && (
            <div className="mb-4 rounded-xl border border-line bg-white p-5">
              {changed.length > 0 && r.status === "issued" && (
                <p className="mb-3 rounded-lg border border-[#e8cd8a] bg-[#f8e7bf] p-3 text-sm">
                  Changed in the hazards library since this was issued: {changed.join(", ")}. Create a new revision if this RAMS needs them.
                </p>
              )}
              <div className="mb-4 flex flex-wrap gap-3">
                {r.fileId && <button type="button" onClick={() => setViewing({ id: r.fileId!, name: r.fileName, mime: "application/pdf" })} className={`${TOP_BTN} border border-dark font-semibold`}>Open PDF</button>}
                {r.signedFileId && <button type="button" onClick={() => setViewing({ id: r.signedFileId!, name: `${heading} - signed copy`, mime: "application/pdf" })} className={`${TOP_BTN} border border-dark font-semibold`}>Open signed copy</button>}
                {r.status === "issued" && <button type="button" onClick={() => setSigning(true)} className={`${TOP_BTN} bg-brand text-white font-semibold`}>Sign on (this device)</button>}
              </div>
              <h2 className="mb-2 font-semibold">Signed on to rev {r.revision} ({signed.length})</h2>
              {signed.length === 0 ? <p className="text-sm text-muted">Nobody yet. The crew can also sign on the job&apos;s crew page.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {signed.map((s) => <li key={s.name} className="py-1.5">{s.name}{s.company ? `, ${s.company}` : ""} <span className="text-muted">· {niceDateTime(s.signedAt)} ({s.via === "crew" ? "crew page" : "office"})</span></li>)}
                </ul>
              )}
            </div>
          )}
          <RamsEditor
            key={`${r.id}-${r.status}`}
            initial={toValue(r)}
            lists={lists}
            readOnly={r.status !== "draft"}
            onSave={async (v) => {
              const res = await saveRams(r.id, v, key());
              if (res.ok && res.data) setR(res.data);
              return res;
            }}
            onAddToLibrary={(h) => addLibraryHazard(h, `RAMS ${no}`, key())}
            extra={(v, saved, saving) => (
              <button type="button" disabled={busy || saving} onClick={() => issue(v, saved)} className="px-4 py-2 rounded-lg border border-dark font-semibold disabled:opacity-50">
                {busy ? "Working…" : "Issue RAMS"}
              </button>
            )}
          />
        </>
      )}

      <DocViewer file={viewing} onClose={() => setViewing(null)} />

      <Modal open={signing} onClose={() => setSigning(false)} title={`Sign on: ${heading}`} size="max-w-lg">
        <div className="p-5">
          <SignOnForm docLabel={`${heading}: ${r.title}`} acceptText="I have read and understood this RAMS (risk assessment and method statement), and I will follow it. If anything changes on site I will stop and tell my supervisor."
            names={names} onSign={async (p) => { const res = await officeSignOn(r.id, p, key()); if (res.ok) router.refresh(); return res; }} />
        </div>
      </Modal>

      <Modal open={jobTypeName !== null} onClose={() => !busy && setJobTypeName(null)} title="Save as job type" size="max-w-md">
        <div className="p-5">
          <p className="mb-3 text-sm">Saves this RAMS&apos;s steps, hazards, PPE and permits as a job type, to start new RAMS from. Kept in Health and safety &gt; Templates.</p>
          <label className="mb-4 block">
            <span className="block text-sm font-medium mb-1">Job type name</span>
            <input value={jobTypeName ?? ""} onChange={(e) => setJobTypeName(e.target.value)} spellCheck className={inputClass} />
          </label>
          <button type="button" disabled={busy} onClick={() => run(() => saveAsJobType(r.id, jobTypeName ?? "", key()), () => setJobTypeName(null))} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">Save job type</button>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={r.kind === "cbs" ? `Delete ${heading} (draft)?` : `Delete ${heading}?`}
        message={r.kind === "cbs" ? "The draft is removed. Issued revisions stay on record." : "This subcontractor RAMS record is removed. An uploaded file stays in SharePoint."}
        confirmLabel="Delete"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          const res = await deleteRamsDraft(r.id, key());
          if (res.ok) router.push(`/jobs/${r.jobNo}/rams`);
          return res;
        }}
      />
    </div>
  );
}
