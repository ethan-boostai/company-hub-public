"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageTabs } from "@/components/shell/page-tabs";
import { inputClass } from "@/components/ui/fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlay";
import { PageTop, RegisterLayout } from "@/components/ui/page-top";
import { ReportDialog } from "@/components/ui/report-dialog";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { createJobType } from "./actions";
import { TEMPLATE_REPORT_COLUMNS, TEMPLATE_REPORT_DETAIL, TEMPLATE_REPORT_WHICH } from "./report-options";

type Row = { id: number; key: string; name: string; status: "active" | "retired"; steps: number; hazards: number; used: number };
type Filter = "active" | "retired" | "all";

export function TemplatesClient({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [reportOpen, setReportOpen] = useState(false);

  const FILTERS: { value: Filter; label: string; test: (r: Row) => boolean }[] = [
    { value: "active", label: "In use", test: (r) => r.status === "active" },
    { value: "retired", label: "Retired", test: (r) => r.status === "retired" },
    { value: "all", label: "All", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const shown = rows.filter(FILTERS.find((f) => f.value === filter)!.test).filter((r) => !q || r.name.toLowerCase().includes(q));
  const open = (id: number) => router.push(`/safety/templates/rams/${id}`);

  async function create() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await createJobType(name, crypto.randomUUID());
      if (r.ok && r.data) open(r.data.id);
      else { setMsg(r.message ?? ""); setBusy(false); }
    } catch {
      setMsg("It wasn't created. Check the connection and try again.");
      setBusy(false);
    }
  }

  const columns: Column<Row>[] = [
    { key: "name", label: "Job type", cell: (r) => r.name },
    { key: "content", label: "Starts with", cell: (r) => `${r.steps} ${r.steps === 1 ? "step" : "steps"}, ${r.hazards} ${r.hazards === 1 ? "hazard" : "hazards"}` },
    { key: "used", label: "RAMS made", cell: (r) => String(r.used) },
    { key: "status", label: "Status", cell: (r) => (r.status === "active" ? <StatusPill tone="green">In use</StatusPill> : <StatusPill tone="grey">Retired</StatusPill>) },
  ];

  return (
    // Job types have no review dates, so Needs attention stays "All clear" (it's on every register page).
    <RegisterLayout attention={[]}>
      <PageTop
        title="Templates"
        count={shown.length}
        reports={[{ label: "Create report", hint: "Choose which job types and what to show", onSelect: () => setReportOpen(true) }]}
        newAction={{ label: "New job type", onSelect: () => { setName(""); setMsg(""); setAdding(true); } }}
      >
        <PageTabs label="Templates" tabs={[{ key: "rams", label: "RAMS job types", href: "/safety/templates" }]} active="rams" />
      </PageTop>
      <p className="mb-3 text-sm text-muted">Each job type is what a new CBS RAMS starts with (Job &gt; RAMS &gt; + New &gt; CBS RAMS): its steps, hazards from the library, PPE and permits.</p>
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: rows.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search job types" label="Search job types" />
      </FilterRow>
      <DataTable label="RAMS job types" rows={shown} columns={columns} rowKey={(r) => r.id} onOpen={(r) => open(r.id)}
        empty={rows.length ? "Nothing matches." : "No job types yet. Use + New job type, or Save as job type on a RAMS."} />

      <Modal open={adding} onClose={() => !busy && setAdding(false)} title="New job type" size="max-w-md">
        <div className="p-5">
          <label className="mb-4 block">
            <span className="block text-sm font-medium mb-1">Job type name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} spellCheck className={inputClass} placeholder="e.g. Loft conversion" />
          </label>
          {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
          <Button tone="primary" onClick={create} busy={busy} busyLabel="Creating…">Create job type</Button>
        </div>
      </Modal>

      <ReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        id="templates"
        fileName="RAMS job types.pdf"
        groups={[
          { key: "which", label: "Job types", type: "pick", initial: filter, options: TEMPLATE_REPORT_WHICH.map((w) => ({ value: w.value, label: w.label })) },
          { key: "cols", label: "Columns", type: "ticks", initial: TEMPLATE_REPORT_COLUMNS.filter((c) => c.default).map((c) => c.key), options: TEMPLATE_REPORT_COLUMNS.map((c) => ({ value: c.key, label: c.label })) },
          { key: "detail", label: "Under the list", type: "ticks", initial: [], options: TEMPLATE_REPORT_DETAIL.map((d) => ({ value: d.key, label: d.label })) },
        ]}
        url={(h) => `/safety/templates/report?which=${h.pick("which")}&cols=${h.ticked("cols").join(",")}&detail=${h.ticked("detail").join(",")}`}
      />
    </RegisterLayout>
  );
}
