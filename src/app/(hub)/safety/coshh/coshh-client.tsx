"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { UploadFile } from "@/components/ui/upload-file";
import { addMonths, dueState, niceDate } from "../../_registers/dates";
import { Choice, Section } from "../../_registers/ui";
import { deleteSubstance, saveSubstance, setSdsFile } from "../actions";
import type { SubstanceData, SubstanceRow } from "../data";
import { CheckGroup, GhsIcon, GhsPicker, PersonSelect, ReportDialog, SupplierSelect } from "../parts";
import { GHS, PPE, ROUTES, substanceDueItems, SUBSTANCE_STATUSES, WHO } from "../rules";
import { SafetyTabs } from "../tabs";

type Filter = "assessed" | "draft" | "review" | "all";
type Editing = SubstanceRow | "new" | null;

export function CoshhClient({ initial, today, openId }: { initial: SubstanceData; today: string; openId: number | null }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(() => (initial.substances.some((s) => s.id === openId) ? openId : null));
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [viewing, setViewing] = useState<ViewableFile | null>(null);
  const [sdsMsg, setSdsMsg] = useState("");

  const due = useMemo(() => substanceDueItems(data.substances, today), [data.substances, today]);
  const reviewIds = new Set(due.filter((d) => d.tag === "Review").map((d) => d.id));
  const FILTERS: { value: Filter; label: string; test: (s: SubstanceRow) => boolean }[] = [
    { value: "all", label: "All", test: () => true },
    { value: "assessed", label: "Assessed", test: (s) => s.status === "assessed" },
    { value: "draft", label: "Draft", test: (s) => s.status === "draft" },
    { value: "review", label: "Review due", test: (s) => reviewIds.has(s.id) },
  ];
  const q = query.trim().toLowerCase();
  const shown = data.substances.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((s) => !q || [s.product, s.supplierName, s.useFor, s.location, s.ingredients, s.notes].some((x) => x.toLowerCase().includes(q)));

  const editing: Editing = editingId === "new" ? "new" : editingId ? data.substances.find((s) => s.id === editingId) ?? null : null;
  const current = editing && editing !== "new" ? editing : null;
  const open = (id: number | "new" | null) => {
    setNote("");
    setSdsMsg("");
    setEditingId(id);
  };
  const attention: AttentionItem[] = due.map((d, i) => ({ key: `s${d.id}-${i}`, level: d.level, tag: d.tag, name: d.name, detail: d.detail, onOpen: () => open(d.id) }));

  const columns: Column<SubstanceRow>[] = [
    { key: "product", label: "Product", cell: (s) => s.product, sub: (s) => s.supplierName },
    {
      key: "ghs", label: "Hazards", cell: (s) => s.ghs.length
        ? <span className="flex flex-wrap gap-0.5" aria-label={s.ghs.map((g) => GHS.find((x) => x.value === g)?.label ?? g).join(", ")}>{s.ghs.map((g) => <GhsIcon key={g} value={g} size={24} />)}</span>
        : <span className="text-muted">None</span>,
    },
    {
      key: "review", label: "Review due", cell: (s) => {
        const d = dueState(s.reviewOn, today, 30, 30);
        return s.reviewOn ? <span className={d === "overdue" ? "font-semibold text-danger" : d === "soon" ? "font-semibold text-[#7a4a00]" : ""}>{niceDate(s.reviewOn)}</span> : <span className="text-muted">Not set</span>;
      },
    },
    { key: "pack", label: "Pack", cell: (s) => (s.packFileId ? `v${s.version}` : <span className="text-muted">None</span>) },
    { key: "status", label: "Status", cell: (s) => (s.status === "assessed" ? <StatusPill tone="green">Assessed</StatusPill> : <StatusPill tone="amber">Draft</StatusPill>) },
  ];

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Hazards and CoSHH"
        count={data.substances.length}
        reports={[{ label: "Create report", hint: "CoSHH register: choose what to include", onSelect: () => setReportOpen(true) }]}
        newAction={{ label: "New CoSHH assessment", onSelect: () => open("new") }}
      >
        <SafetyTabs active="coshh" />
      </PageTop>

      <FilterPills label="Show" value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: data.substances.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search CoSHH: product, supplier, use or ingredients" label="Search CoSHH" />
      </FilterRow>
      <DataTable label="CoSHH register" rows={shown} columns={columns} rowKey={(s) => s.id} onOpen={(s) => open(s.id)} empty={q ? "No substances match." : "No substances here yet."} />

      <Drawer open={!!editing} onClose={() => open(null)} title={current ? current.product : "New CoSHH assessment"} width="max-w-2xl">
        {editing && (
          <div key={current ? JSON.stringify(current) : "new"}>
            {current && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {current.status === "assessed" ? <StatusPill tone="green">Assessed</StatusPill> : <StatusPill tone="amber">Draft</StatusPill>}
                {current.packFileId ? (
                  <button type="button" onClick={() => setViewing({ id: current.packFileId!, name: current.packFileName, mime: "application/pdf" })}
                    className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper">
                    Open CoSHH pack v{current.version}
                  </button>
                ) : (
                  <span className="text-sm text-muted">No CoSHH pack yet. One is made when it&apos;s saved as Assessed.</span>
                )}
                {current.status === "assessed" && current.packFileId && !current.packCurrent && (
                  <p role="alert" className="w-full text-sm text-danger">The pack is out of date with the assessment. Save again to make a new one.</p>
                )}
              </div>
            )}
            {note && <p role="status" className="mb-4 rounded-lg border border-[#e8cd8a] bg-[#f8e7bf] px-3 py-2 text-sm text-[#7a4a00]">{note}</p>}

            <GuardedForm action={saveSubstance} onSaved={(r) => {
              if (!r.data) return;
              setData(r.data.all);
              setEditingId(r.data.id);
              setNote(r.data.note ?? "");
            }}>
              {(state) => {
                const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                const s = current;
                return (
                  <>
                    {s && <input type="hidden" name="id" value={s.id} />}
                    <TextField label="Product" name="product" defaultValue={s?.product} error={err.product} required autoComplete="off" />
                    <SupplierSelect suppliers={data.suppliers} defaultValue={s?.supplierId ?? null} error={err.supplier_id} />
                    <TextField label="Used for (the process)" name="use_for" defaultValue={s?.useFor} autoComplete="off" />
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <TextField label="Where it's kept" name="location" defaultValue={s?.location} autoComplete="off" />
                      <TextField label="Quantity" name="quantity" defaultValue={s?.quantity} autoComplete="off" />
                    </div>

                    <Section title="Hazards">
                      <GhsPicker defaultValues={s?.ghs ?? []} />
                      <TextArea label="Ingredients" name="ingredients" defaultValue={s?.ingredients} rows={3} />
                    </Section>

                    <Section title="Exposure">
                      {ROUTES.map((r) => (
                        <fieldset key={r.value} className="mb-3 rounded-lg border border-line p-3">
                          <legend className="px-1 text-sm font-semibold">{r.label}</legend>
                          <TextArea label="Effect" name={`exp_${r.value}_effect`} defaultValue={s?.exposure[r.value].effect} rows={2} />
                          <TextArea label="Control" name={`exp_${r.value}_control`} defaultValue={s?.exposure[r.value].control} rows={2} />
                          <TextArea label="First aid" name={`exp_${r.value}_first_aid`} defaultValue={s?.exposure[r.value].firstAid} rows={2} />
                        </fieldset>
                      ))}
                      <CheckGroup label="Who could be exposed" name="who_exposed" options={WHO} defaultValues={s?.whoExposed ?? []} />
                      <div className="grid gap-x-3 sm:grid-cols-2">
                        <TextField label="How often" name="frequency" defaultValue={s?.frequency} autoComplete="off" />
                        <TextField label="For how long" name="duration" defaultValue={s?.duration} autoComplete="off" />
                      </div>
                    </Section>

                    <Section title="Controls">
                      <TextArea label="Controls" name="controls" defaultValue={s?.controls} rows={4} />
                      <TextArea label="Storage" name="storage" defaultValue={s?.storage} rows={3} />
                      <TextArea label="Spills and disposal" name="spills_disposal" defaultValue={s?.spillsDisposal} rows={3} />
                      <CheckGroup label="PPE" name="ppe" options={PPE} defaultValues={s?.ppe ?? []} />
                      <TextField label="Other PPE" name="ppe_other" defaultValue={s?.ppeOther} autoComplete="off" />
                    </Section>

                    <Section title="Assessment">
                      <PersonSelect label="Assessed by" name="assessed_by_id" people={data.people} defaultValue={s?.assessedById ?? null} />
                      <div className="grid gap-x-3 sm:grid-cols-2">
                        <TextField label="Assessed on" name="assessed_on" type="date" defaultValue={s ? s.assessedOn ?? "" : today} error={err.assessed_on} />
                        <TextField label="Review due" name="review_on" type="date" defaultValue={s ? s.reviewOn ?? "" : addMonths(today, 12)} error={err.review_on} />
                      </div>
                      <TextField label="Safety data sheet dated" name="sds_date" type="date" defaultValue={s?.sdsDate ?? ""} error={err.sds_date} />
                      <Choice label="Status" name="status" options={SUBSTANCE_STATUSES} defaultValue={s?.status ?? "draft"} />
                      <p className="-mt-2 mb-4 text-xs text-muted">
                        Assessed needs a supplier, what it&apos;s used for, controls, assessed by and on, review due and the safety data sheet. A new pack (and version) is made only when the hazards, exposure, controls, storage, spills, PPE or the safety data sheet change.
                      </p>
                      <TextArea label="Notes" name="notes" defaultValue={s?.notes} rows={3} />
                    </Section>
                    <SaveButton>{s ? "Save" : "Add substance"}</SaveButton>
                  </>
                );
              }}
            </GuardedForm>

            <section className="mt-6 border-t border-line pt-4">
              <div className="mb-2 flex flex-wrap items-center gap-3">
                <h3 className="flex-1 font-semibold">Safety data sheet</h3>
                {current && (
                  <UploadFile entityTable="substances" entityId={current.id} role="sds" label={current.sdsFileId ? "Upload new SDS" : "Upload SDS"}
                    onUploaded={async (f) => {
                      setSdsMsg("");
                      try {
                        const r = await setSdsFile(current.id, f.id, crypto.randomUUID());
                        if (r.ok && r.data) {
                          setData(r.data.all);
                          setNote(r.data.note ?? "");
                        } else if (!r.ok) setSdsMsg(r.message);
                      } catch {
                        setSdsMsg("The file uploaded but couldn't be set as the SDS. Refresh and try again.");
                      }
                    }} />
                )}
              </div>
              {!current && <p className="text-sm text-muted">Add the substance first, then upload its safety data sheet.</p>}
              {current && !current.sdsFileId && <p className="text-sm text-muted">No safety data sheet yet.</p>}
              {current?.sdsFileId && (
                <button type="button" onClick={() => setViewing({ id: current.sdsFileId!, name: current.sdsFileName, mime: /\.pdf$/i.test(current.sdsFileName) ? "application/pdf" : "" })}
                  className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm font-medium hover:bg-paper">
                  {current.sdsFileName}
                </button>
              )}
              {sdsMsg && <p role="alert" className="mt-2 text-sm text-danger">{sdsMsg}</p>}
            </section>

            {current && (
              <div className="mt-8 border-t border-line pt-5">
                <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete substance</button>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && !!current}
        title={`Delete ${current?.product ?? "this substance"}?`}
        message="Its CoSHH assessment is removed from the register. The pack and safety data sheet stay in SharePoint."
        confirmLabel="Delete substance"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!current) return;
          const r = await deleteSubstance(current.id, crypto.randomUUID());
          if (r.ok && r.data) {
            setData(r.data.all);
            open(null);
          }
          return r;
        }}
      />
      <DocViewer file={viewing} onClose={() => setViewing(null)} />

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="CoSHH register report"
        fileName="CoSHH register.pdf"
        url="/api/safety/coshh/report"
        whoOptions={[{ value: "all", label: "All substances" }, { value: "assessed", label: "Assessed" }, { value: "draft", label: "Draft" }, { value: "review", label: "Review due or overdue" }]}
        columns={[
          { key: "supplier", label: "Supplier" }, { key: "use", label: "Used for" }, { key: "location", label: "Where it's kept", on: false },
          { key: "ghs", label: "Hazard pictograms" }, { key: "ppe", label: "PPE", on: false }, { key: "assessed", label: "Assessed by and on", on: false },
          { key: "review", label: "Review due" }, { key: "version", label: "Pack version", on: false }, { key: "status", label: "Status" },
        ]}
      />
    </RegisterLayout>
  );
}
