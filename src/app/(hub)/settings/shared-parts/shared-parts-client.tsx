"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ReportDialog } from "@/components/ui/report-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { UploadFile } from "@/components/ui/upload-file";
import { deleteDemoNote, saveDemoNote, type DemoNote } from "./actions";

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-line rounded-xl p-5 mb-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

export function SharedPartsClient({
  notes: initialNotes,
  files: initialFiles,
  colours,
}: {
  notes: DemoNote[];
  files: { id: number; name: string; mime: string; size: number }[];
  colours: string[];
}) {
  const [notes, setNotes] = useState(initialNotes);
  const [noteQuery, setNoteQuery] = useState("");
  const [deleting, setDeleting] = useState<DemoNote | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [files, setFiles] = useState(initialFiles);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);

  const shownNotes = notes.filter((n) => n.text.toLowerCase().includes(noteQuery.trim().toLowerCase()));

  return (
    <div>
      <Card title="1. Save button that can't double save">
        <p className="text-sm text-muted mb-3">Double-click Save as fast as you can. Only one note is added. The save is slowed down on purpose to make this easy to test.</p>
        <GuardedForm action={saveDemoNote} onSaved={(r) => r.data && setNotes((n) => [r.data!, ...n])} className="flex flex-wrap items-end gap-3">
          {(state) => (
            <>
              <div className="flex-1 min-w-56">
                <TextField label="Test note" name="text" error={state && !state.ok ? state.fieldErrors?.text : undefined} />
              </div>
              <div className="mb-4">
                <SaveButton>Add note</SaveButton>
              </div>
            </>
          )}
        </GuardedForm>
        <div className="mt-2">
          <SearchBox value={noteQuery} onChange={setNoteQuery} placeholder="Search test notes" label="Search test notes" />
          <ul className="mt-2 divide-y divide-line border border-line rounded-lg" data-testid="demo-notes">
            {shownNotes.map((n) => (
              <li key={n.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="flex-1">{n.text} <span className="text-muted">· {n.by}</span></span>
                <button type="button" onClick={() => setDeleting(n)} className="text-danger underline">Delete</button>
              </li>
            ))}
            {shownNotes.length === 0 && <li className="px-3 py-2 text-sm text-muted">No test notes.</li>}
          </ul>
        </div>
      </Card>

      <Card title="2. In-app &quot;are you sure&quot;">
        <p className="text-sm text-muted">Press Delete on a test note above. You get an in-app question, never a browser pop-up.</p>
      </Card>

      <Card title="3. Drawer">
        <p className="text-sm text-muted mb-3">Opens a side panel. The page behind does not scroll; only the drawer does.</p>
        <button type="button" onClick={() => setDrawer(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold">Open drawer</button>
      </Card>

      <Card title="4. Dropdown that lets you add options">
        <SelectWithAdd list="demo.colour" name="colour" label="Test colour" options={colours} />
      </Card>

      <Card title="5. Upload file and in-window viewer">
        <p className="text-sm text-muted mb-3">Any file type. Pictures and PDFs open in-window with an option to open full screen in a new tab.</p>
        <UploadFile entityTable="demo" onUploaded={(f) => setFiles((list) => [f, ...list])} />
        <ul className="mt-3 divide-y divide-line border border-line rounded-lg" data-testid="demo-files">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="flex-1 truncate">{f.name}</span>
              <span className="text-muted">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" onClick={() => setViewing(f)} className="underline">Open file</button>
            </li>
          ))}
          {files.length === 0 && <li className="px-3 py-2 text-sm text-muted">No test files yet.</li>}
        </ul>
      </Card>

      <Card title="6. House PDF format">
        <p className="text-sm text-muted mb-3">A sample document in the one house format every builder PDF uses (test job 12).</p>
        <button type="button" onClick={() => setPdfOpen(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold">Open sample PDF</button>
      </Card>

      <Card title="Buttons and Create report">
        <p className="text-sm text-muted mb-3">The one Button: primary (orange, one per page or dialog), secondary, danger and quiet. The slow one disables itself until its click finishes, so it can&apos;t be pressed twice. Create report is the one report dialog every page uses.</p>
        <div className="flex flex-wrap gap-2">
          <Button tone="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button tone="danger">Danger</Button>
          <Button tone="quiet">Quiet</Button>
          <Button busyLabel="Working…" onClick={() => new Promise((r) => setTimeout(r, 1500))}>Slow click</Button>
          <Button tone="primary" onClick={() => setReportOpen(true)}>Create report</Button>
        </div>
      </Card>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        id="shared-parts"
        note="A test report. It opens the sample PDF."
        fileName="Job 12 - Sample document.pdf"
        groups={[
          { key: "which", label: "Which records", type: "pick", initial: "all", options: [{ value: "all", label: "All" }, { value: "due", label: "Only those due" }] },
          { key: "cols", label: "Columns", type: "ticks", twoColumns: true, initial: ["a", "b"], options: [
            { value: "a", label: "Name" }, { value: "b", label: "Status" },
            { value: "c", label: "Cost", hint: "3 with costs" },
            { value: "d", label: "Notes", off: (st) => (st.which === "due" ? "Not on the due list" : false) },
          ] },
          { key: "when", label: "Dates", type: "dates", initial: ["", ""], options: [{ value: "from", label: "From" }, { value: "to", label: "To" }] },
        ]}
        check={(h) => (h.ticked("cols").length ? null : "Tick at least one column.")}
        url={() => "/api/pdf/sample"}
      />

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Test drawer">
        {Array.from({ length: 60 }, (_, i) => (
          <p key={i} className="py-2 border-b border-line text-sm">Line {i + 1}. Scroll inside this drawer; the page behind stays still.</p>
        ))}
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this test note?"
        message={deleting ? `"${deleting.text}" will be removed.` : ""}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const r = await deleteDemoNote(deleting.id, crypto.randomUUID());
          if (r.ok) setNotes((n) => n.filter((x) => x.id !== deleting.id));
          return r;
        }}
      />

      <DocViewer file={viewing} onClose={() => setViewing(null)} />
      <DocViewer file={pdfOpen ? { id: 0, name: "Job 12 - Sample document.pdf", mime: "application/pdf", url: "/api/pdf/sample" } : null} onClose={() => setPdfOpen(false)} />
    </div>
  );
}
