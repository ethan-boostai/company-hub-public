"use client";

import { useState } from "react";
import type { ActionResult } from "@/lib/action-types";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { Drawer, Modal } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { niceDate, niceDateTime } from "../../../_registers/dates";
import type { Sheet } from "../../../_site/load-up";
import { loadUpAttention, sheetState, STATE_LABELS, STATE_TONES } from "../../../_site/load-up-rules";
import { LoadedView, LoadScreen } from "../../../_site/load-screen";
import { TwoLine } from "../../../_site/ui";
import { createLoadUpPdf, deleteLoadUp, loadSheetAction, markProblemsSorted, reportProblemAction, setLoadUpStatus, type Saved } from "./actions";
import type { LoadUpData } from "./data";
import { SheetForm } from "./sheet-form";

type Filter = "open" | "loaded" | "all";
const summary = (s: Sheet) => {
  const kit = s.lines.filter((l) => l.kind === "equipment" || l.kind === "custom_equipment").length;
  const mat = s.lines.filter((l) => l.kind === "material" || l.kind === "custom_material").length;
  const buy = s.lines.filter((l) => l.kind === "buy").length;
  return [kit && `${kit} equipment`, mat && `${mat} material${mat === 1 ? "" : "s"}`, buy && `${buy} to buy`].filter(Boolean).join(", ") || "Nothing on it yet";
};

export function LoadUpClient({ jobId, jobNo, today, meId, initial, openId }: {
  jobId: number; jobNo: string; today: string; meId: number | null; initial: LoadUpData; openId: number | null;
}) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("open");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<number | "new" | null>(openId && initial.sheets.some((s) => s.id === openId) ? openId : null);
  const [dirty, setDirty] = useState(false);
  const [checklist, setChecklist] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const sheet = typeof open === "number" ? data.sheets.find((s) => s.id === open) ?? null : null;

  function saved(r: Saved, keepOpen = true) {
    setData(r.all);
    setOpen(keepOpen ? r.id : null);
  }
  async function act(fn: (key: string) => Promise<ActionResult<Saved>>) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fn(crypto.randomUUID());
      if (r.ok && r.data) saved(r.data);
      setMsg({ ok: r.ok, message: r.message ?? "" });
    } catch {
      setMsg({ ok: false, message: "It wasn't saved. Check the connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const FILTERS: { value: Filter; label: string; test: (s: Sheet) => boolean }[] = [
    { value: "open", label: "To load", test: (s) => s.status !== "loaded" },
    { value: "loaded", label: "Loaded", test: (s) => s.status === "loaded" },
    { value: "all", label: "All", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const shown = data.sheets.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((s) => !q || [String(s.id), s.vehicleLabel, s.crewNames.join(" "), s.notes, ...s.lines.map((l) => l.name)].some((x) => x.toLowerCase().includes(q)));
  const attention: AttentionItem[] = loadUpAttention(data.sheets, today).map((a) => ({
    key: `${a.tag}-${a.sheet.id}`, level: a.level, tag: a.tag, name: `Load-up sheet ${a.sheet.id}`, detail: a.detail, onOpen: () => setOpen(a.sheet.id),
  }));
  const columns: Column<Sheet>[] = [
    { key: "date", label: "Date", cell: (s) => niceDate(s.sheetDate), sub: (s) => `Sheet ${s.id}` },
    { key: "van", label: "Van and crew", cell: (s) => <TwoLine main={s.vehicleLabel || "No van yet"} sub={s.crewNames.join(", ")} /> },
    { key: "what", label: "On the sheet", cell: (s) => <TwoLine main={summary(s)} sub={s.problemsOpen ? "Problems reported" : ""} /> },
    { key: "state", label: "Status", cell: (s) => { const st = sheetState(s, today); return <StatusPill tone={STATE_TONES[st]}>{STATE_LABELS[st]}</StatusPill>; } },
  ];

  const close = () => {
    setOpen(null);
    setDirty(false);
    setMsg(null);
  };
  const smallBtn = "px-3 py-1.5 rounded-lg border border-line bg-white text-sm font-semibold hover:bg-paper disabled:opacity-50";

  return (
    <RegisterLayout attention={attention}>
      <PageTop title="Load-up sheets" count={data.sheets.length} newAction={{ label: "New load-up sheet", onSelect: () => { setOpen("new"); setMsg(null); } }} />
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: data.sheets.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: van, crew, item" label="Search load-up sheets" />
      </FilterRow>
      <DataTable label="Load-up sheets" rows={shown} columns={columns} rowKey={(s) => s.id} onOpen={(s) => { setOpen(s.id); setMsg(null); }}
        empty={data.sheets.length ? "Nothing matches." : "No load-up sheets for this job yet. Use + New load-up sheet."} />

      <Drawer open={open !== null} onClose={close} title={open === "new" ? `New load-up sheet for job ${jobNo}` : sheet ? `Load-up sheet ${sheet.id}` : ""} width="max-w-[820px]">
        {open === "new" && (
          <SheetForm jobId={jobId} jobNo={jobNo} sheet={null} data={data} today={today} meId={meId} onDirty={setDirty} onSaved={(r) => saved(r)} />
        )}
        {sheet && (
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-paper p-3" data-testid="sheet-status">
              <StatusPill tone={STATE_TONES[sheetState(sheet, today)]}>{STATE_LABELS[sheetState(sheet, today)]}</StatusPill>
              <span className="mr-auto text-sm text-muted">Created {niceDateTime(sheet.createdAt)}{sheet.createdBy ? ` by ${sheet.createdBy}` : ""}</span>
              {sheet.status === "draft" && (
                <button type="button" disabled={busy || dirty} onClick={() => act((key) => setLoadUpStatus(jobId, sheet.id, "ready", key))}
                  className="px-3 py-1.5 rounded-lg bg-ok text-white text-sm font-semibold disabled:opacity-50">Send to crew (ready to load)</button>
              )}
              {sheet.status === "ready" && (
                <>
                  <button type="button" disabled={busy || dirty} onClick={() => setChecklist(true)} className={smallBtn}>Open crew checklist</button>
                  <button type="button" disabled={busy || dirty} onClick={() => act((key) => setLoadUpStatus(jobId, sheet.id, "draft", key))} className={smallBtn}>Back to draft</button>
                </>
              )}
              {sheet.pdf && <button type="button" onClick={() => setViewing(sheet.pdf)} className={smallBtn}>Open PDF</button>}
              {sheet.status !== "draft" && (
                <button type="button" disabled={busy} onClick={() => act((key) => createLoadUpPdf(jobId, sheet.id, key))} className={smallBtn}>Create PDF</button>
              )}
            </div>
            {dirty && sheet.status !== "loaded" && <p className="mb-3 text-sm text-muted">Save your changes first, then send it to the crew.</p>}
            {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-3 text-sm ${msg.ok ? "text-ok" : "text-danger"}`}>{msg.message}</p>}

            {sheet.status === "loaded" ? (
              <>
                <LoadedView sheet={sheet} />
                {sheet.problemsOpen ? (
                  <button type="button" disabled={busy} onClick={() => act((key) => markProblemsSorted(jobId, sheet.id, key))}
                    className="mt-3 px-4 py-2 rounded-lg bg-dark text-white font-semibold disabled:opacity-50">Mark problems sorted</button>
                ) : sheet.problemsSortedBy ? <p className="mt-2 text-sm text-muted">Problems sorted by {sheet.problemsSortedBy}, {niceDateTime(sheet.problemsSortedAt)}.</p> : null}
              </>
            ) : (
              <>
                {sheet.problems && (
                  <section className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm">
                    <h3 className="mb-1 font-semibold">Problems reported</h3>
                    <p className="whitespace-pre-line">{sheet.problems}</p>
                    {sheet.problemsOpen && (
                      <button type="button" disabled={busy} onClick={() => act((key) => markProblemsSorted(jobId, sheet.id, key))} className={`mt-2 ${smallBtn}`}>Mark problems sorted</button>
                    )}
                  </section>
                )}
                <SheetForm key={`${sheet.id}-${JSON.stringify(sheet.lines)}-${sheet.status}`} jobId={jobId} jobNo={jobNo} sheet={sheet} data={data} today={today} meId={meId}
                  onDirty={setDirty} onSaved={(r) => { saved(r); setMsg(null); }} />
                <div className="mt-6 border-t border-line pt-4">
                  <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete this sheet</button>
                </div>
              </>
            )}
          </div>
        )}
      </Drawer>

      <Modal open={checklist && !!sheet && sheet.status === "ready"} onClose={() => setChecklist(false)} title={sheet ? `Load up: sheet ${sheet.id}` : "Load up"} size="max-w-3xl">
        {sheet && sheet.status === "ready" && (
          <div className="p-4 max-h-[80dvh] overflow-y-auto">
            <LoadScreen sheet={sheet}
              onLoad={async (results, extra) => {
                const r = await loadSheetAction(jobId, sheet.id, results, extra, crypto.randomUUID());
                if (r.ok && r.data) {
                  saved(r.data);
                  setChecklist(false);
                  setMsg({ ok: true, message: r.message ?? "" });
                }
                return { ok: r.ok, message: r.message ?? "" };
              }}
              onReport={async (text) => {
                const r = await reportProblemAction(jobId, sheet.id, text, crypto.randomUUID());
                if (r.ok && r.data) saved(r.data);
                return { ok: r.ok, message: r.message ?? "" };
              }} />
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmDelete && !!sheet}
        title={`Delete load-up sheet ${sheet?.id ?? ""}?`}
        message="This deletes the sheet and its lines. Its PDF stays in SharePoint. It cannot be undone."
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!sheet) return;
          const r = await deleteLoadUp(jobId, sheet.id, crypto.randomUUID());
          if (r.ok && r.data) saved(r.data, false);
          return r;
        }}
      />
      <DocViewer file={viewing} onClose={() => setViewing(null)} />
    </RegisterLayout>
  );
}
