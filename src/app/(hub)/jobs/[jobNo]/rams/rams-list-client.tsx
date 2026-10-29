"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Modal } from "@/components/ui/overlay";
import { inputClass } from "@/components/ui/fields";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import { SearchBox } from "@/components/ui/search-box";
import { ramsNo } from "@/lib/rams/content";
import type { RamsRow } from "@/lib/rams/data";
import { niceDate } from "../../../_registers/dates";
import { createRams, createSubRams } from "./actions";

type Row = Omit<RamsRow, "content">;
type Filter = "current" | "all";
const ADD = "__add__";

export function statusPill(r: Row) {
  if (r.kind === "subcontractor") {
    if (r.reviewStatus === "approved") return <StatusPill tone="green">Approved</StatusPill>;
    if (r.reviewStatus === "rejected") return <StatusPill tone="red">Rejected</StatusPill>;
    return <StatusPill tone="amber">{r.fileId ? "To review" : "Waiting for file"}</StatusPill>;
  }
  if (r.status === "issued") return <StatusPill tone="green">Issued</StatusPill>;
  if (r.status === "superseded") return <StatusPill tone="grey">Superseded</StatusPill>;
  return <StatusPill tone="amber">Draft</StatusPill>;
}

export function RamsListClient({ jobNo, rows, changed, jobTypes, subcontractors }: {
  jobNo: string; rows: Row[]; changed: Record<number, string[]>; jobTypes: { key: string; name: string }[]; subcontractors: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("current");
  const [query, setQuery] = useState("");
  const [picker, setPicker] = useState<"cbs" | "sub" | null>(null);
  const [jobType, setJobType] = useState("");
  const [subId, setSubId] = useState("");
  const [subTitle, setSubTitle] = useState("");
  const [newSub, setNewSub] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const open = (id: number) => router.push(`/jobs/${jobNo}/rams/${id}`);

  const FILTERS: { value: Filter; label: string; test: (r: Row) => boolean }[] = [
    { value: "current", label: "Current", test: (r) => r.status !== "superseded" },
    { value: "all", label: "All revisions", test: () => true },
  ];
  const q = query.trim().toLowerCase();
  const shown = rows.filter(FILTERS.find((f) => f.value === filter)!.test)
    .filter((r) => !q || [r.title, r.subcontractor, ramsNo(r.jobNo, r.seq)].some((x) => x.toLowerCase().includes(q)));

  const attention: AttentionItem[] = [
    ...rows.filter((r) => r.kind === "cbs" && r.status === "draft").map((r): AttentionItem => ({
      key: `d${r.id}`, level: "soon", tag: "Draft", name: `${ramsNo(r.jobNo, r.seq)} rev ${r.revision}`, detail: `${r.title}: not issued yet`, onOpen: () => open(r.id),
    })),
    ...rows.filter((r) => (changed[r.id] ?? []).length).map((r): AttentionItem => ({
      key: `c${r.id}`, level: "soon", tag: "Hazards changed", name: `${ramsNo(r.jobNo, r.seq)} rev ${r.revision}`,
      detail: `Changed in the library since issue: ${changed[r.id].join(", ")}. It may need a new revision.`, onOpen: () => open(r.id),
    })),
    ...rows.filter((r) => r.kind === "subcontractor" && r.reviewStatus !== "approved").map((r): AttentionItem => ({
      key: `s${r.id}`, level: r.reviewStatus === "rejected" ? "overdue" : "soon", tag: r.reviewStatus === "rejected" ? "Rejected" : r.fileId ? "To review" : "No file",
      name: r.subcontractor || "Subcontractor", detail: r.title, onOpen: () => open(r.id),
    })),
  ];

  async function create() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = picker === "sub"
        ? await createSubRams(jobNo, subId === ADD ? { id: null, newName: newSub } : { id: Number(subId) || null }, subTitle, crypto.randomUUID())
        : await createRams(jobNo, jobType || null, crypto.randomUUID());
      if (r.ok && r.data) open(r.data.id);
      else { setMsg(r.message ?? ""); setBusy(false); }
    } catch {
      setMsg("It wasn't created. Check the connection and try again.");
      setBusy(false);
    }
  }

  const columns: Column<Row>[] = [
    { key: "no", label: "RAMS", cell: (r) => `${ramsNo(r.jobNo, r.seq)}${r.kind === "cbs" ? ` rev ${r.revision}` : ""}`, sub: (r) => (r.kind === "cbs" ? "CBS" : r.subcontractor || "Subcontractor") },
    { key: "title", label: "Activity", cell: (r) => r.title },
    { key: "status", label: "Status", cell: statusPill, sub: (r) => (r.issuedAt ? `Issued ${niceDate(r.issuedAt.slice(0, 10))}` : "") },
    { key: "signed", label: "Signed on", cell: (r) => (r.kind === "cbs" && r.status !== "draft" ? String(r.signedCount) : "") },
  ];

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="RAMS"
        count={shown.length}
        newAction={{ label: "New", items: [
          { label: "CBS RAMS", hint: "Build it here from a job type", onSelect: () => { setMsg(""); setPicker("cbs"); } },
          { label: "Subcontractor RAMS", hint: "Upload theirs and review it", onSelect: () => { setMsg(""); setPicker("sub"); } },
        ] }}
      />
      <FilterPills label="Show" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.value, label: f.label, count: rows.filter(f.test).length }))} />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search: RAMS number, activity or subcontractor" label="Search RAMS" />
      </FilterRow>
      <DataTable label="RAMS" rows={shown} columns={columns} rowKey={(r) => r.id} onOpen={(r) => open(r.id)}
        empty={rows.length ? "Nothing matches." : "No RAMS on this job yet. Use + New to create one."} />

      <Modal open={picker !== null} onClose={() => !busy && setPicker(null)} title={picker === "sub" ? "Add subcontractor RAMS" : "Create RAMS"} size="max-w-lg">
        <div className="p-5">
          {picker === "cbs" ? (
            <label className="mb-4 block">
              <span className="block text-sm font-medium mb-1">Job type (fills in the steps, hazards, PPE and permits)</span>
              <select value={jobType} onChange={(e) => setJobType(e.target.value)} className={inputClass}>
                <option value="">Blank (no job type)</option>
                {jobTypes.map((t) => <option key={t.key} value={t.key}>{t.name}</option>)}
              </select>
              <span className="mt-1 block text-xs text-muted">Job types are kept in Health and safety &gt; Templates.</span>
            </label>
          ) : (
            <>
              <label className="mb-3 block">
                <span className="block text-sm font-medium mb-1">Subcontractor</span>
                <select value={subId} onChange={(e) => setSubId(e.target.value)} className={inputClass}>
                  <option value="">Choose…</option>
                  {subcontractors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value={ADD}>+ Add a new subcontractor…</option>
                </select>
              </label>
              {subId === ADD && (
                <label className="mb-3 block">
                  <span className="block text-sm font-medium mb-1">New subcontractor&apos;s company name</span>
                  <input value={newSub} onChange={(e) => setNewSub(e.target.value)} spellCheck className={inputClass} />
                  <span className="mt-1 block text-xs text-muted">Added to Subcontractors. Fill in their details there.</span>
                </label>
              )}
              <label className="mb-4 block">
                <span className="block text-sm font-medium mb-1">What it covers</span>
                <input value={subTitle} onChange={(e) => setSubTitle(e.target.value)} spellCheck className={inputClass} placeholder="e.g. Electrical first fix" />
              </label>
            </>
          )}
          {msg && <p role="alert" className="mb-3 text-sm text-danger">{msg}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={create} disabled={busy} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold disabled:opacity-50">
              {busy ? "Creating…" : picker === "sub" ? "Add subcontractor RAMS" : "Create RAMS"}
            </button>
            <button type="button" onClick={() => setPicker(null)} disabled={busy} className="px-4 py-2 rounded-lg border border-line">Cancel</button>
          </div>
        </div>
      </Modal>
    </RegisterLayout>
  );
}
