"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { CheckboxField, TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { SignaturePad } from "@/components/ui/signature-pad";
import { UploadFile } from "@/components/ui/upload-file";
import { addMonths, niceDate } from "../../_registers/dates";
import { deleteHsDraft, issueHsDocument, saveHsDocument, setManualFile } from "../policy-actions";
import type { HsDocRow, PolicyData } from "../policy-data";
import { DEFAULT_PARAGRAPHS, issueName, KIND_LABEL, missingForIssue, policyDueItems, policyFileName, STATUS_LABEL, type DocKind } from "../policy-rules";
import { PersonSelect } from "../parts";

type Filter = "all" | "policy" | "manual" | "draft";
type Editing = { kind: DocKind; from: HsDocRow | null } | { id: number } | null;

const tone = (s: HsDocRow["status"]) => (s === "issued" ? "green" : s === "draft" ? "amber" : "grey");

export function PolicyClient({ initial, today }: { initial: PolicyData; today: string }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const issuedPolicy = data.docs.find((d) => d.kind === "policy" && d.status === "issued") ?? null;
  const startNew = (kind: DocKind) => setEditing({ kind, from: kind === "policy" ? issuedPolicy : null });
  const due = useMemo(() => policyDueItems(data.docs, today), [data.docs, today]);
  const attention: AttentionItem[] = due.map((d) => ({
    key: d.key, level: d.level, tag: d.tag, name: d.name, detail: d.detail,
    onOpen: () => (d.id ? setEditing({ id: d.id }) : startNew(d.kind)),
  }));

  const FILTERS: { value: Filter; label: string; test: (d: HsDocRow) => boolean }[] = [
    { value: "all", label: "All", test: () => true },
    { value: "policy", label: "Policy statement", test: (d) => d.kind === "policy" },
    { value: "manual", label: "Manual", test: (d) => d.kind === "manual" },
    { value: "draft", label: "Drafts", test: (d) => d.status === "draft" },
  ];
  const q = query.trim().toLowerCase();
  const shown = data.docs.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((d) => !q || [d.version, KIND_LABEL[d.kind], d.notes, d.issuedBy, d.signatoryName].some((x) => x.toLowerCase().includes(q)));

  const doc = editing && "id" in editing ? data.docs.find((d) => d.id === editing.id) ?? null : null;
  const saved = (all: PolicyData, id: number | null) => {
    setData(all);
    setEditing(id ? { id } : null);
  };

  const columns: Column<HsDocRow>[] = [
    { key: "doc", label: "Document", cell: (d) => KIND_LABEL[d.kind], sub: (d) => `Issue ${d.version}` },
    { key: "effective", label: "Effective", cell: (d) => niceDate(d.effectiveOn) || <span className="text-muted">Not set</span> },
    { key: "review", label: "Review due", cell: (d) => niceDate(d.reviewDue) || <span className="text-muted">Not set</span> },
    { key: "issued", label: "Issued", cell: (d) => (d.issuedOn ? `${niceDate(d.issuedOn)}, ${d.issuedBy}` : <span className="text-muted">Not issued</span>) },
    { key: "status", label: "Status", cell: (d) => <StatusPill tone={tone(d.status)}>{STATUS_LABEL[d.status]}</StatusPill> },
  ];

  const title = doc ? `${KIND_LABEL[doc.kind]} ${doc.version}` : editing && "kind" in editing ? `New ${KIND_LABEL[editing.kind]} issue` : "";

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Policy and manual"
        count={data.docs.length}
        newAction={{ label: "New", items: [
          { label: "Policy statement issue", onSelect: () => startNew("policy") },
          { label: "Manual issue", onSelect: () => startNew("manual") },
        ] }}
      />
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: data.docs.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: issue, issued by, notes" label="Search policy and manual" />
      </FilterRow>
      <DataTable label="Policy and manual" rows={shown} columns={columns} rowKey={(d) => d.id} onOpen={(d) => setEditing({ id: d.id })} empty={q ? "Nothing matches." : "Nothing issued yet."} />

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={title} width="max-w-2xl">
        {editing && (doc ? (
          doc.status === "draft"
            ? <DraftView key={JSON.stringify(doc)} doc={doc} data={data} today={today} onSaved={saved} onView={setViewing} onDelete={() => setConfirmDelete(true)} />
            : <IssuedView doc={doc} onView={setViewing} onNewIssue={() => startNew(doc.kind)} />
        ) : "kind" in editing ? (
          <DocForm key={`new-${editing.kind}`} kind={editing.kind} doc={null} from={editing.from} data={data} today={today} onSaved={saved} />
        ) : null)}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && !!doc}
        title={`Delete the draft ${doc?.version ?? ""}?`}
        message="The draft is removed. Issued documents are never deleted."
        confirmLabel="Delete draft"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!doc) return;
          const r = await deleteHsDraft(doc.id, crypto.randomUUID());
          if (r.ok && r.data) saved(r.data.all, null);
          return r;
        }}
      />
      <DocViewer file={viewing} onClose={() => setViewing(null)} />
    </RegisterLayout>
  );
}

function DocForm({ kind, doc, from, data, today, onSaved }: {
  kind: DocKind;
  doc: HsDocRow | null;
  from: HsDocRow | null; // a new policy issue starts from the issued wording
  data: PolicyData;
  today: string;
  onSaved: (all: PolicyData, id: number | null) => void;
}) {
  const src = doc ?? from;
  const [paragraphs, setParagraphs] = useState<{ key: number; text: string }[]>(() =>
    (src?.paragraphs.length ? src.paragraphs : DEFAULT_PARAGRAPHS).map((text, key) => ({ key, text })));
  const [next, setNext] = useState(1000);
  return (
    <GuardedForm action={saveHsDocument} onSaved={(r) => r.data && onSaved(r.data.all, r.data.id)}>
      {(state) => {
        const err = state && !state.ok ? state.fieldErrors ?? {} : {};
        return (
          <>
            {doc && <input type="hidden" name="id" value={doc.id} />}
            <input type="hidden" name="kind" value={kind} />
            <TextField label="Issue name" name="version" defaultValue={doc?.version ?? issueName(today)} error={err.version} hint="Shown on the document, e.g. October 2026" autoComplete="off" />
            <div className="grid gap-x-3 sm:grid-cols-2">
              <TextField label="Effective from" name="effective_on" type="date" defaultValue={doc ? doc.effectiveOn ?? "" : today} error={err.effective_on} />
              <TextField label="Review due" name="review_due" type="date" defaultValue={doc ? doc.reviewDue ?? "" : addMonths(today, 12)} error={err.review_due} />
            </div>
            {kind === "policy" && (
              <>
                <PersonSelect label="Signed by" name="signatory_id" people={data.people} defaultValue={src?.signatoryId ?? null} />
                <div className="grid gap-x-3 sm:grid-cols-2">
                  <TextField label="Their position" name="signatory_role" defaultValue={src?.signatoryRole || "Director"} autoComplete="off" />
                  <TextField label="H&S advisor" name="advisor" defaultValue={src?.advisor || "Citation"} autoComplete="off" />
                </div>
                <fieldset className="mb-4">
                  <legend className="block text-sm font-medium mb-1">Wording</legend>
                  {err.paragraphs && <p className="mb-2 text-sm text-danger">{err.paragraphs}</p>}
                  {paragraphs.map((p, i) => (
                    <div key={p.key} className="mb-2 flex items-start gap-2">
                      <textarea name="paragraph" aria-label={`Paragraph ${i + 1}`} defaultValue={p.text} rows={3} spellCheck
                        className="w-full rounded-lg border border-line bg-white px-3 py-2 focus:outline-none focus:border-brand" />
                      <button type="button" aria-label={`Remove paragraph ${i + 1}`} onClick={() => setParagraphs((l) => l.filter((x) => x.key !== p.key))}
                        className="rounded-lg border border-line px-2.5 py-1 text-lg leading-none">×</button>
                    </div>
                  ))}
                  <button type="button" onClick={() => { setParagraphs((l) => [...l, { key: next, text: "" }]); setNext(next + 1); }}
                    className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper">Add paragraph</button>
                </fieldset>
              </>
            )}
            <TextArea label="Notes" name="notes" defaultValue={doc?.notes} rows={3} />
            <SaveButton>{doc ? "Save draft" : "Create draft"}</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}

function DraftView({ doc, data, today, onSaved, onView, onDelete }: {
  doc: HsDocRow;
  data: PolicyData;
  today: string;
  onSaved: (all: PolicyData, id: number | null) => void;
  onView: (f: ViewableFile) => void;
  onDelete: () => void;
}) {
  const [use, setUse] = useState<"saved" | "drawn">(data.hasSavedSignature ? "saved" : "drawn");
  const [drawn, setDrawn] = useState("");
  const [saveAsMine, setSaveAsMine] = useState(!data.hasSavedSignature);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [fileMsg, setFileMsg] = useState("");
  const missing = missingForIssue(doc);

  async function issue() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await issueHsDocument(doc.id, doc.kind === "policy" ? { use, drawn, saveAsMine } : { use: "none" }, crypto.randomUUID());
      if (r.ok && r.data) onSaved(r.data.all, r.data.id);
      else if (!r.ok) setMsg(r.message);
    } catch {
      setMsg("It wasn't issued. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="mb-4"><StatusPill tone="amber">Draft</StatusPill></p>
      <DocForm kind={doc.kind} doc={doc} from={null} data={data} today={today} onSaved={onSaved} />

      {doc.kind === "policy" && (
        <div className="mt-4">
          <button type="button" onClick={() => onView({ id: 0, name: `Policy statement ${doc.version} (preview).pdf`, mime: "application/pdf", url: `/api/safety/policy/${doc.id}/preview` })}
            className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-paper">
            Open preview
          </button>
        </div>
      )}

      {doc.kind === "manual" && (
        <section className="mt-6 border-t border-line pt-4">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <h3 className="flex-1 font-semibold">Manual PDF</h3>
            <UploadFile entityTable="hs_documents" entityId={doc.id} role="manual" label={doc.fileId ? "Upload new PDF" : "Upload manual PDF"}
              fileName={policyFileName("manual", doc.version)}
              accept={{ types: "application/pdf,.pdf", check: (f) => /\.pdf$/i.test(f.name), message: "The manual must be a PDF. Choose the PDF of the manual." }}
              onUploaded={async (f) => {
                setFileMsg("");
                try {
                  const r = await setManualFile(doc.id, f.id, crypto.randomUUID());
                  if (r.ok && r.data) onSaved(r.data.all, r.data.id);
                  else if (!r.ok) setFileMsg(r.message);
                } catch {
                  setFileMsg("The file uploaded but couldn't be added. Refresh and try again.");
                }
              }} />
          </div>
          {doc.fileId ? (
            <button type="button" onClick={() => onView({ id: doc.fileId!, name: doc.fileName, mime: "application/pdf" })}
              className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm font-medium hover:bg-paper">{doc.fileName}</button>
          ) : <p className="text-sm text-muted">No PDF yet. The manual is PDF only.</p>}
          {fileMsg && <p role="alert" className="mt-2 text-sm text-danger">{fileMsg}</p>}
        </section>
      )}

      <section className="mt-6 border-t border-line pt-4" aria-label="Issue">
        <h3 className="mb-2 font-semibold">Issue</h3>
        {!data.canIssue ? (
          <p className="text-sm text-muted">Only people with the &quot;Issue H&amp;S policy&quot; tick on their Team record can issue this.</p>
        ) : missing.length ? (
          <p className="text-sm text-muted">Save the draft with {missing.join(", ")} first.</p>
        ) : (
          <>
            {doc.kind === "policy" && (
              <>
                {data.hasSavedSignature && (
                  <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Signature">
                    {(["saved", "drawn"] as const).map((u) => (
                      <button key={u} type="button" aria-pressed={use === u} onClick={() => setUse(u)}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-medium ${use === u ? "border-brand bg-brand text-white" : "border-line bg-white"}`}>
                        {u === "saved" ? "Use my saved signature" : "Sign now"}
                      </button>
                    ))}
                  </div>
                )}
                {use === "drawn" && (
                  <>
                    <SignaturePad onChange={setDrawn} label="Your signature" />
                    <CheckboxField label="Save this as my signature" checked={saveAsMine} onChange={(e) => setSaveAsMine(e.target.checked)} />
                  </>
                )}
              </>
            )}
            <p className="mb-3 text-sm text-muted">Issuing makes this the current {doc.kind === "policy" ? "policy statement" : "manual"}; the one before becomes Superseded. It can&apos;t be changed afterwards.</p>
            <button type="button" onClick={issue} disabled={busy || (doc.kind === "policy" && use === "drawn" && !drawn)}
              className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
              {busy ? "Issuing…" : `Issue ${doc.kind === "policy" ? "policy statement" : "manual"}`}
            </button>
          </>
        )}
        {msg && <p role="alert" className="mt-2 text-sm text-danger">{msg}</p>}
      </section>

      <div className="mt-8 border-t border-line pt-5">
        <button type="button" onClick={onDelete} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete draft</button>
      </div>
    </div>
  );
}

function IssuedView({ doc, onView, onNewIssue }: { doc: HsDocRow; onView: (f: ViewableFile) => void; onNewIssue: () => void }) {
  return (
    <div>
      <p className="mb-4"><StatusPill tone={tone(doc.status)}>{STATUS_LABEL[doc.status]}</StatusPill></p>
      <dl className="mb-4 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="font-semibold">Issue</dt><dd>{doc.version}</dd>
        <dt className="font-semibold">Effective from</dt><dd>{niceDate(doc.effectiveOn)}</dd>
        <dt className="font-semibold">Review due</dt><dd>{niceDate(doc.reviewDue)}</dd>
        <dt className="font-semibold">Issued</dt><dd>{niceDate(doc.issuedOn)}, {doc.issuedBy}</dd>
        {doc.kind === "policy" && <><dt className="font-semibold">Signed by</dt><dd>{[doc.signatoryName, doc.signatoryRole].filter(Boolean).join(", ")}</dd></>}
        {doc.notes && <><dt className="font-semibold">Notes</dt><dd className="whitespace-pre-wrap">{doc.notes}</dd></>}
      </dl>
      <div className="flex flex-wrap gap-3">
        {doc.fileId && (
          <button type="button" onClick={() => onView({ id: doc.fileId!, name: doc.fileName, mime: "application/pdf" })}
            className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-paper">
            Open {doc.kind === "policy" ? "policy statement" : "manual"}
          </button>
        )}
        {doc.status === "issued" && (
          <button type="button" onClick={onNewIssue} className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-paper">Start the next issue</button>
        )}
      </div>
    </div>
  );
}
