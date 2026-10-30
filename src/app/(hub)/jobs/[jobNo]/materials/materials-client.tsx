"use client";

import { useMemo, useState } from "react";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { Drawer } from "@/components/ui/overlay";
import { PageTop, RegisterLayout } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { niceDateTime } from "../../../_registers/dates";
import { RecordSelect } from "../../../_registers/ui";
import { errorsOf, LocationSelect } from "../../../equipment/parts";
import { qty } from "../../../equipment/rules";
import { materialTotals, type MaterialTotal } from "../../../_site/rules";
import { TwoLine } from "../../../_site/ui";
import { recordJobMaterial } from "./actions";
import type { JobMaterialsData, JobMoveRow } from "./data";

type View = "used" | "history";
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function MaterialsClient({ jobId, jobNo, initial }: { jobId: number; jobNo: string; initial: JobMaterialsData }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("used");
  const [query, setQuery] = useState("");
  const [recording, setRecording] = useState<"take" | "return" | null>(null);
  const totals = useMemo(() => materialTotals(data.moves), [data.moves]);
  const q = query.trim().toLowerCase();
  const shownTotals = totals.filter((t) => !q || t.name.toLowerCase().includes(q));
  const shownMoves = data.moves.filter((m) => !q || [m.name, m.where, m.reason, m.by, m.notes].some((x) => x.toLowerCase().includes(q)));
  const value = totals.reduce((s, t) => s + (t.value ?? 0), 0);
  const unpriced = totals.some((t) => t.value == null && t.used);

  const totalCols: Column<MaterialTotal>[] = [
    { key: "name", label: "Material", cell: (t) => t.name, sub: (t) => `Taken ${qty(t.taken)}, returned ${qty(t.returned)}` },
    { key: "used", label: "Used", cell: (t) => <TwoLine main={<strong>{qty(t.used)} {t.unit}</strong>} sub={t.value == null ? "No cost set" : money(t.value)} /> },
  ];
  const moveCols: Column<JobMoveRow>[] = [
    { key: "name", label: "Material", cell: (m) => m.name, sub: (m) => niceDateTime(m.at) },
    { key: "change", label: "Change", cell: (m) => <TwoLine main={`${m.change > 0 ? "+" : ""}${qty(m.change)} ${m.unit}`} sub={m.where} /> },
    { key: "reason", label: "Reason", cell: (m) => <TwoLine main={m.reason} sub={[m.by, m.notes].filter(Boolean).join(" · ")} /> },
  ];
  return (
    <RegisterLayout attention={[]}>
      <PageTop title="Materials" countLabel={`${totals.length} ${totals.length === 1 ? "material" : "materials"} · ${money(value)} used at cost`}
        newAction={{ label: "New", items: [
          { label: "Take stock for this job", hint: "It comes off stock, used on the job", onSelect: () => setRecording("take") },
          { label: "Return stock from this job", hint: "It goes back on stock", onSelect: () => setRecording("return") },
        ] }} />
      <FilterPills label="Show" value={view} onChange={setView} options={[
        { value: "used", label: "Used on this job", count: totals.length },
        { value: "history", label: "History", count: data.moves.length },
      ]} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: material, location, reason" label="Search materials" />
      </FilterRow>
      {view === "used" ? (
        <>
          <DataTable label="Materials used on this job" rows={shownTotals} columns={totalCols} rowKey={(t) => `${t.materialId}-${t.name}`}
            empty={totals.length ? "Nothing matches." : "No stock has been taken for this job yet. It's recorded when a load-up sheet is loaded, or with + New."} />
          {unpriced && <p className="mt-3 text-sm text-muted">Some materials have no cost on the register, so the value leaves them out.</p>}
        </>
      ) : (
        <DataTable label="Stock history for this job" rows={shownMoves} columns={moveCols} rowKey={(m) => m.id}
          empty={data.moves.length ? "Nothing matches." : "No stock moves for this job yet."} />
      )}

      <Drawer open={!!recording} onClose={() => setRecording(null)} title={recording === "return" ? `Return stock from job ${jobNo}` : `Take stock for job ${jobNo}`} width="max-w-[560px]">
        {recording && <RecordForm key={recording} jobId={jobId} direction={recording} data={data} onSaved={(d) => { setData(d); setRecording(null); }} />}
      </Drawer>
    </RegisterLayout>
  );
}

function RecordForm({ jobId, direction, data, onSaved }: { jobId: number; direction: "take" | "return"; data: JobMaterialsData; onSaved: (d: JobMaterialsData) => void }) {
  const [materialId, setMaterialId] = useState("");
  const m = data.materials.find((x) => String(x.id) === materialId);
  return (
    <GuardedForm action={recordJobMaterial} onSaved={(r) => r.data && onSaved(r.data)}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <>
            <input type="hidden" name="job_id" value={jobId} />
            <input type="hidden" name="direction" value={direction} />
            <RecordSelect label="Material" name="material_id" error={err.material_id} onChange={setMaterialId}
              options={data.materials.map((x) => ({ value: String(x.id), label: `${x.name} (${x.unit})` }))} />
            {m && direction === "take" && (
              <p className="-mt-2 mb-4 text-sm text-muted">
                {m.stock.length ? `In stock: ${m.stock.map((s) => `${qty(s.qty)} at ${s.label}`).join(", ")}.` : "None in stock anywhere."}
              </p>
            )}
            <LocationSelect data={data.locations} name="location" label={direction === "take" ? "From" : "Back to"} defaultValue="p:CBS Warehouse" error={err.location} />
            <TextField label={m ? `Quantity (${m.unit})` : "Quantity"} name="qty" inputMode="decimal" spellCheck={false} error={err.qty} />
            <TextArea label="Notes" name="notes" rows={2} error={err.notes} />
            <SaveButton>{direction === "take" ? "Take stock" : "Return stock"}</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}
