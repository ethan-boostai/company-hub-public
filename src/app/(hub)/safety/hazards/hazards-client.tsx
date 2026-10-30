"use client";

import { useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { addMonths, dueState, niceDate } from "../../_registers/dates";
import { Choice } from "../../_registers/ui";
import { deleteHazard, saveHazard, setHazardStatus } from "../actions";
import type { HazardData, HazardRow } from "../data";
import { CheckGroup, PersonSelect, RatingPill, SafetyReport, RiskFields } from "../parts";
import { ACTIVITY_LIST, CONTROL_CODES, hazardDueItems, HAZARD_STATUSES } from "../rules";
import { SafetyTabs } from "../tabs";

type Filter = "active" | "review" | "archived" | "all";
type Editing = HazardRow | "new" | null;

export function HazardsClient({ initial, today, openId }: { initial: HazardData; today: string; openId: number | null }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState("");
  const [editing, setEditing] = useState<Editing>(() => initial.hazards.find((h) => h.id === openId) ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const due = useMemo(() => hazardDueItems(data.hazards, today), [data.hazards, today]);
  const reviewIds = new Set(due.map((d) => d.id));
  const FILTERS: { value: Filter; label: string; test: (h: HazardRow) => boolean }[] = [
    { value: "active", label: "Active", test: (h) => h.status === "active" },
    { value: "review", label: "Review due", test: (h) => reviewIds.has(h.id) },
    { value: "archived", label: "Archived", test: (h) => h.status === "archived" },
    { value: "all", label: "All", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const test = FILTERS.find((f) => f.value === filter)!.test;
  const shown = data.hazards.filter(test)
    .filter((h) => !activity || h.activity === activity)
    .filter((h) => !q || [h.hazard, h.activity, h.harm, h.controls, h.ownerName, h.source, h.notes].some((x) => x.toLowerCase().includes(q)));

  const current = editing && editing !== "new" ? data.hazards.find((h) => h.id === editing.id) ?? editing : null;
  const attention: AttentionItem[] = due.map((d) => ({
    key: `h${d.id}`, level: d.level, tag: d.tag, name: d.name, detail: d.detail,
    onOpen: () => setEditing(data.hazards.find((h) => h.id === d.id) ?? null),
  }));

  function saved(all: HazardData, id: number | null) {
    setData(all);
    setEditing(id ? all.hazards.find((h) => h.id === id) ?? null : null);
  }

  async function changeStatus(h: HazardRow) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await setHazardStatus(h.id, h.status === "active" ? "archived" : "active", crypto.randomUUID());
      if (r.ok && r.data) saved(r.data.all, r.data.id);
      else if (!r.ok) setMsg(r.message);
    } catch {
      setMsg("Couldn't change it. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<HazardRow>[] = [
    { key: "hazard", label: "Hazard", cell: (h) => h.hazard, sub: (h) => h.activity },
    { key: "risk", label: "Risk", cell: (h) => <RatingPill rating={h.riskRating} /> },
    { key: "residual", label: "After controls", cell: (h) => <RatingPill rating={h.residualRisk} /> },
    {
      key: "review", label: "Review due", cell: (h) => {
        const d = dueState(h.reviewOn, today, 30, 30);
        return h.reviewOn ? <span className={d === "overdue" ? "font-semibold text-danger" : d === "soon" ? "font-semibold text-[#7a4a00]" : ""}>{niceDate(h.reviewOn)}</span> : <span className="text-muted">Not set</span>;
      },
    },
    { key: "status", label: "Status", cell: (h) => (h.status === "active" ? <StatusPill tone="green">Active</StatusPill> : <StatusPill tone="grey">Archived</StatusPill>) },
  ];

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Hazards and CoSHH"
        count={data.hazards.length}
        reports={[{ label: "Create report", hint: "Hazard register: choose what to include", onSelect: () => setReportOpen(true) }]}
        newAction={{ label: "New hazard", onSelect: () => setEditing("new") }}
      >
        <SafetyTabs active="hazards" />
      </PageTop>

      <FilterPills label="Show" value={filter} onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: data.hazards.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search hazards: name, activity, harm or controls" label="Search hazards" />
        <select aria-label="Activity" value={activity} onChange={(e) => setActivity(e.target.value)} className="h-11 rounded-lg border border-line bg-white px-3 text-[15px]">
          <option value="">All activities</option>
          {data.activities.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      </FilterRow>
      <DataTable label="Hazards" rows={shown} columns={columns} rowKey={(h) => h.id} onOpen={(h) => setEditing(h)} empty={q || activity ? "No hazards match." : "No hazards here yet."} />

      <Drawer open={!!editing} onClose={() => setEditing(null)} title={current ? current.hazard : "New hazard"} width="max-w-[560px]">
        {editing && (
          <div key={current ? JSON.stringify(current) : "new"}>
            <GuardedForm action={saveHazard} onSaved={(r) => r.data && saved(r.data.all, r.data.id)}>
              {(state) => {
                const err = state && !state.ok ? state.fieldErrors ?? {} : {};
                return (
                  <>
                    {current && <input type="hidden" name="id" value={current.id} />}
                    <TextField label="Hazard" name="hazard" defaultValue={current?.hazard} error={err.hazard} required autoComplete="off" />
                    <SelectWithAdd list={ACTIVITY_LIST} name="activity" label="Activity" options={data.activities} defaultValue={current?.activity ?? ""} />
                    <TextArea label="Harm (what could happen, and to whom)" name="harm" defaultValue={current?.harm} rows={3} />
                    <RiskFields title="Risk before controls" prefix="" likelihood={current?.likelihood ?? null} consequence={current?.consequence ?? null} />
                    <TextArea label="Controls" name="controls" defaultValue={current?.controls} rows={5} />
                    <CheckGroup label="Control types" name="control_codes" options={CONTROL_CODES} defaultValues={current?.controlCodes ?? []} columns={3} />
                    <RiskFields title="Risk after controls" prefix="residual_" likelihood={current?.residualLikelihood ?? null} consequence={current?.residualConsequence ?? null} />
                    <CheckGroup label="Equipment that brings this hazard (added to a RAMS when the equipment is picked)" name="plant_categories"
                      options={Array.from(new Set([...data.categories, ...(current?.plantCategories ?? [])])).map((c) => ({ value: c, label: c }))}
                      defaultValues={current?.plantCategories ?? []} />
                    <PersonSelect label="Owner" name="owner_id" people={data.people} defaultValue={current?.ownerId ?? null} error={err.owner_id} />
                    <div className="grid gap-x-3 sm:grid-cols-2">
                      <TextField label="Last reviewed" name="last_reviewed_on" type="date" defaultValue={current?.lastReviewedOn ?? ""} error={err.last_reviewed_on} />
                      <TextField label="Review due" name="review_on" type="date" defaultValue={current ? current.reviewOn ?? "" : addMonths(today, 12)} error={err.review_on} />
                    </div>
                    <TextField label="Source" name="source" defaultValue={current?.source ?? "Library"} hint="Where it came from, e.g. Library, Incident 12, Toolbox talk" autoComplete="off" />
                    {current && <Choice label="Status" name="status" options={HAZARD_STATUSES} defaultValue={current.status} />}
                    <TextArea label="Notes" name="notes" defaultValue={current?.notes} rows={3} />
                    {current && <p className="mb-3 text-xs text-muted">RAMS key: {current.ramsKey}</p>}
                    <SaveButton>{current ? "Save" : "Add hazard"}</SaveButton>
                  </>
                );
              }}
            </GuardedForm>

            {current && (
              <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
                <button type="button" disabled={busy} onClick={() => changeStatus(current)} className="px-4 py-2 rounded-lg border border-dark font-semibold disabled:opacity-50">
                  {current.status === "active" ? "Archive hazard" : "Restore hazard"}
                </button>
                <button type="button" onClick={() => setConfirmDelete(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">Delete hazard</button>
                {msg && <p role="alert" className="w-full text-sm text-danger">{msg}</p>}
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmDelete && !!current}
        title={`Delete ${current?.hazard ?? "this hazard"}?`}
        message="It's removed from the library for good. To keep it out of new RAMS but keep the record, archive it instead."
        confirmLabel="Delete hazard"
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!current) return;
          const r = await deleteHazard(current.id, crypto.randomUUID());
          if (r.ok && r.data) saved(r.data.all, null);
          return r;
        }}
      />

      <SafetyReport
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Hazard register report"
        fileName="Hazard register.pdf"
        url="/api/safety/hazards/report"
        whoOptions={[{ value: "active", label: "Active hazards" }, { value: "review", label: "Review due or overdue" }, { value: "archived", label: "Archived hazards" }, { value: "all", label: "All hazards" }]}
        columns={[
          { key: "activity", label: "Activity" }, { key: "harm", label: "Harm" }, { key: "risk", label: "Risk before controls" },
          { key: "controls", label: "Controls" }, { key: "residual", label: "Risk after controls" }, { key: "owner", label: "Owner", on: false },
          { key: "review", label: "Review due" }, { key: "status", label: "Status", on: false },
        ]}
      />
    </RegisterLayout>
  );
}
