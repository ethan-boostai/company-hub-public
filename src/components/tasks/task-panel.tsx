"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { UploadFile } from "@/components/ui/upload-file";
import { JobLinkField } from "./job-link";
import { builtIn, canSendToSite, REQ_STAGES, taskCategory } from "@/lib/requirements";
import { Button } from "@/components/ui/button";
import { STATUS_LABEL, type NewTaskDraft, type TaskStatus } from "@/lib/tasks/types";
import { changeTaskStatus, deleteTask, loadTaskPanel, moveTaskSide, saveTask, sendTaskBack, verifyTask, type PanelData } from "@/app/actions/tasks";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

// One save key per intended action, made in the browser on the first click and kept for repeats.
function useOnceKey() {
  const k = useRef<string | null>(null);
  return { get: () => (k.current ??= crypto.randomUUID()), reset: () => { k.current = null; } };
}

function Badge({ children, tone = "bg-paper text-ink" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>;
}

// The one task panel, used everywhere (Actions board, job page, + New task). One Save.
export function TaskPanel({
  taskId,
  draft,
  people,
  onClose,
  onSaved,
  onOpenTask,
}: {
  taskId: number | null;
  draft: NewTaskDraft | null;
  people: { id: number; name: string }[];
  onClose: () => void;
  onSaved: (id: number) => void;
  onOpenTask: (id: number) => void;
}) {
  const open = taskId !== null || draft !== null;
  const [data, setData] = useState<PanelData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [status, setStatus] = useState<TaskStatus>("todo");
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackTo, setSendBackTo] = useState<"todo" | "in_progress">("todo");
  const [sendBackNote, setSendBackNote] = useState("");
  const actionKey = useOnceKey();

  async function reload(id: number) {
    const d = await loadTaskPanel(id).catch(() => null);
    if (!d) {
      setLoadError("That task couldn't be opened. It may have been removed.");
      return;
    }
    setData(d);
    setStatus(d.task.status);
  }

  useEffect(() => {
    // Fresh state for each task opened.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    setLoadError("");
    setMessage("");
    setSendBackOpen(false);
    setStatus("todo");
    if (taskId !== null) reload(taskId);
  }, [taskId, draft]);

  const t = data?.task;
  const isNew = !t && !!draft;
  const reqKey = t ? t.reqKey : draft?.reqKey ?? null;
  const jobNo = t ? t.jobNo : draft?.jobNo ?? null;
  const side = t ? t.side : draft?.side ?? "office";
  const req = reqKey ? builtIn(reqKey) : undefined;
  const stageLabel = REQ_STAGES.find((s) => s.key === (t?.stage ?? req?.stage))?.label;
  const category = t ? t.category : taskCategory(reqKey);
  const choices = data?.people ?? people;
  const title = isNew ? (draft!.title ? `New task: ${draft!.title}` : "New task") : t ? t.title : "Task";

  async function run(fn: (key: string) => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    if (busy || !t) return;
    setBusy(true);
    setMessage("");
    try {
      const r = await fn(actionKey.get());
      actionKey.reset();
      if (!r.ok) {
        setMessage(r.message || "That didn't work.");
        return;
      }
      if (r.message) setMessage(r.message);
      after?.();
      await reload(t.id);
      onSaved(t.id);
    } catch {
      setMessage("That didn't work. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    // Every task opens in the old hub's 560px right-hand drawer (#ctd), wherever it's opened from.
    <Drawer open={open} onClose={onClose} title={title} busy={busy} width="max-w-[560px]">
      {loadError && <p role="alert" className="text-sm text-danger">{loadError}</p>}
      {!isNew && !t && !loadError && <p className="text-sm text-muted">Opening…</p>}
      {(isNew || t) && (
        <div key={t ? `t${t.id}` : "new"}>
          <div className="flex flex-wrap items-center gap-1.5 mb-4 text-sm">
            {isNew && draft!.linkJob ? null : jobNo ? (
              <Link href={`/jobs/${jobNo}`} className="underline font-medium" onClick={onClose}>
                Job {jobNo}{t?.jobTitle ? ` · ${t.jobTitle}` : ""}
              </Link>
            ) : (
              <span className="text-muted">No job (office task)</span>
            )}
            <Badge>{category}</Badge>
            {side === "site" && <Badge tone="bg-[#e3edf9] text-[#1f4e8c]">On site</Badge>}
            {stageLabel && <Badge tone="bg-paper text-muted">{stageLabel}</Badge>}
            {t?.submittedAt && t.status !== "done" && (
              <Badge tone="bg-[#fff1d6] text-[#8a5300]">Submitted by {t.submittedBy} · {fmt(t.submittedAt)}</Badge>
            )}
            {t?.verifiedAt && <Badge tone="bg-[#e6f4ea] text-[#1a7f37]">Verified by {t.verifiedBy}</Badge>}
          </div>
          {t?.sentBackAt && t.status !== "done" && (
            <div className="mb-4 rounded-lg border border-[#f2a900] bg-[#fff8e6] px-3 py-2 text-sm">
              <p className="font-semibold">Sent back by {t.sentBackBy} · {fmt(t.sentBackAt)}</p>
              <p>{t.sentBackNote}</p>
            </div>
          )}

          {/* Office or site (as the live drawer): first in the drawer, above Status. Job tasks only. */}
          {t && t.jobId && t.status !== "done" && (
            t.side === "site" ? (
              <section aria-label="On site" className="mb-4 rounded-lg border border-[#f4b27a] bg-[#fff4ea] px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="flex-1 text-sm">
                    <strong>On site task</strong> · {req?.label ?? "One-off task"} · on the job portal
                  </p>
                  <Button size="small" disabled={busy} onClick={() => run((k) => moveTaskSide(t.id, "office", k))}>Move to office</Button>
                </div>
                {t.submittedAt && (
                  <p className="mt-2 text-sm"><strong>Submitted</strong> by {t.submittedBy} {fmt(t.submittedAt)}. Check the form, then approve it or send it back.</p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button tone="primary" size="small" disabled={busy} onClick={() => run((k) => changeTaskStatus(t.id, "done", k), () => setMessage("Approved and marked Done."))}>
                    Approve and mark done
                  </Button>
                  <Button size="small" disabled={busy} onClick={() => setSendBackOpen(!sendBackOpen)} aria-expanded={sendBackOpen}>
                    Send back to site
                  </Button>
                </div>
                {sendBackOpen && (
                  <div className="mt-3 rounded-lg border border-line bg-white p-3">
                    <TextArea label="What needs doing again? The crew see this on the job portal." value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} rows={2} />
                    <div className="flex gap-4 text-sm mb-3">
                      <label className="flex items-center gap-1.5"><input type="radio" checked={sendBackTo === "todo"} onChange={() => setSendBackTo("todo")} /> Back to To do</label>
                      <label className="flex items-center gap-1.5"><input type="radio" checked={sendBackTo === "in_progress"} onChange={() => setSendBackTo("in_progress")} /> Keep In progress</label>
                    </div>
                    <Button size="small" tone="primary" disabled={!sendBackNote.trim()} busy={busy} busyLabel="Sending…"
                      onClick={() => run((k) => sendTaskBack(t.id, sendBackTo, sendBackNote, k), () => { setSendBackOpen(false); setSendBackNote(""); })}>
                      Send back
                    </Button>
                  </div>
                )}
              </section>
            ) : (
              <section aria-label="Office or site" className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-3">
                <p className="flex-1 text-sm"><strong>Office task</strong> · not on the job portal</p>
                {canSendToSite(t.reqKey) && (
                  <Button size="small" disabled={busy} onClick={() => run((k) => moveTaskSide(t.id, "site", k))}>Send to site</Button>
                )}
              </section>
            )
          )}

          <GuardedForm
            action={saveTask}
            onSaved={(r) => {
              if (!r.data) return;
              if (r.data.existing) onOpenTask(r.data.id);
              else {
                if (t) reload(t.id);
                onSaved(r.data.id);
              }
            }}
          >
            {t && <input type="hidden" name="id" value={t.id} />}
            {isNew && (
              <>
                {!draft!.linkJob && <input type="hidden" name="jobNo" value={draft!.jobNo || ""} />}
                <input type="hidden" name="reqKey" value={draft!.reqKey || ""} />
                <input type="hidden" name="side" value={draft!.side} />
              </>
            )}
            <TextField label="Title" name="title" defaultValue={t ? t.title : draft?.title} required={!reqKey} placeholder={reqKey ? "Leave blank for the usual name" : ""} />
            <TextArea label="Description" name="notes" defaultValue={t?.notes} rows={3} />
            {isNew && draft!.linkJob && <JobLinkField initialJobNo={draft!.jobNo} />}

            <fieldset className="mb-4">
              <legend className="block text-sm font-medium mb-1">Status</legend>
              <div className="flex rounded-lg border border-line overflow-hidden w-fit">
                {(["todo", "in_progress", "done"] as TaskStatus[]).map((s) => (
                  <label key={s} className={`px-3 py-1.5 text-sm cursor-pointer border-r border-line last:border-r-0 ${status === s ? "bg-brand text-white font-semibold" : "hover:bg-paper"}`}>
                    <input type="radio" name="status" value={s} checked={status === s} onChange={() => setStatus(s)} className="sr-only" />
                    {STATUS_LABEL[s]}
                  </label>
                ))}
              </div>
            </fieldset>
            {status === "in_progress" && (
              <TextField
                label="In hand"
                name="inHandNote"
                defaultValue={t?.inHandNote}
                maxLength={200}
                placeholder="What's happening, e.g. waiting for the supplier"
                hint={t?.inHandBy ? `Last note by ${t.inHandBy}, ${fmt(t.inHandAt)}` : "A short note on this In progress task."}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="mb-4">
                <label htmlFor="task-assignee" className="block text-sm font-medium mb-1">Assigned to</label>
                <select id="task-assignee" name="assigneeId" defaultValue={t?.assigneeId ?? ""} className="w-full rounded-lg border border-line bg-white px-3 py-2">
                  <option value="">Not assigned</option>
                  {choices.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <TextField label="Due" name="dueOn" type="date" defaultValue={t?.dueOn ?? ""} />
            </div>
            <SaveButton>{isNew ? "Add task" : "Save"}</SaveButton>
          </GuardedForm>

          {isNew && <p className="mt-3 text-xs text-muted">Files can be added once the task is saved.</p>}

          {t && (
            <>
              {message && <p role="status" className="mt-3 text-sm">{message}</p>}

              {t.page && t.jobNo && (
                <Link href={`/jobs/${t.jobNo}/${t.page}`} onClick={onClose} className="mt-5 inline-block rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-paper">
                  Open {req?.label ?? "page"}
                </Link>
              )}

              <section className="mt-6 border-t border-line pt-4" aria-label="Files">
                <h3 className="font-semibold mb-2">Files</h3>
                {t.jobId ? (
                  <>
                    <UploadFile entityTable="tasks" entityId={t.id} jobId={t.jobId} onUploaded={() => reload(t.id)} />
                    <ul className="mt-2 text-sm divide-y divide-line">
                      {data!.files.map((f) => (
                        <li key={f.id} className="py-1.5 flex gap-2">
                          <span className="flex-1 truncate">{f.name}</span>
                          <button type="button" className="underline" onClick={() => setViewing({ id: f.id, name: f.name, mime: f.mime, storage: f.storage })}>
                            Open file
                          </button>
                        </li>
                      ))}
                      {data!.files.length === 0 && <li className="py-1.5 text-muted">No files yet.</li>}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-muted">Tasks with no job don&apos;t take files.</p>
                )}
              </section>

              {t.status === "done" && (
                <section className="mt-6 border-t border-line pt-4" aria-label="Sign-off">
                  <h3 className="font-semibold mb-1">Sign-off</h3>
                  <p className="text-sm text-muted mb-2">Done by {t.doneBy} · {fmt(t.doneAt)}</p>
                  {t.verifiedAt ? (
                    <button type="button" disabled={busy} onClick={() => run((k) => verifyTask(t.id, false, k))} className="rounded-lg border border-line px-3 py-1.5 text-sm disabled:opacity-50">
                      Undo verify
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => run((k) => verifyTask(t.id, true, k))} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
                      Verify
                    </button>
                  )}
                </section>
              )}

              <section className="mt-6 border-t border-line pt-4">
                <button type="button" onClick={() => setConfirmRemove(true)} className="text-sm text-danger underline">
                  {t.reqKey ? "Remove from job" : "Delete task"}
                </button>
              </section>

              {data!.history.length > 0 && (
                <section className="mt-6 border-t border-line pt-4" aria-label="History">
                  <h3 className="font-semibold mb-2">History</h3>
                  <ul className="text-xs text-muted space-y-1">
                    {data!.history.map((h, i) => (
                      <li key={i}>
                        {fmt(h.at)} · {h.by} · {h.action === "create" ? "added the task" : Object.keys(h.changes).map((k) => k.replace("_", " ")).join(", ") || h.action}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <ConfirmDialog
                open={confirmRemove}
                title={t.reqKey ? `Remove ${t.title} from job ${t.jobNo}?` : `Delete ${t.title}?`}
                message={t.reqKey ? "The task is hidden and the requirement is taken off the job. Its files are kept. You can add it again from + New task." : "The task is hidden from every list. Its files are kept."}
                confirmLabel={t.reqKey ? "Remove from job" : "Delete task"}
                onConfirm={async () => {
                  const r = await deleteTask(t.id, actionKey.get());
                  actionKey.reset();
                  if (r.ok) {
                    onSaved(t.id);
                    onClose();
                  }
                  return r;
                }}
                onClose={() => setConfirmRemove(false)}
              />
            </>
          )}
        </div>
      )}
      <DocViewer file={viewing} onClose={() => setViewing(null)} />
    </Drawer>
  );
}
