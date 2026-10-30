"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill, type Column } from "@/components/ui/register";
import type { CompaniesData, CompanyRow, DocRow } from "./data";
import { CompanyForm, DocForm } from "./forms";
import { ReportDialog } from "@/components/ui/report-dialog";
import { REPORT_COLUMNS } from "./report-options";
import { docDueItems, docState, KIND_LABEL, type Kind } from "./rules";

type Filter = "all" | Kind;
export type Open =
  | { view: "company"; kind: Kind; id: number | null }
  | { view: "doc"; kind: Kind; companyId: number; id: number | null };

const keyOf = (kind: Kind, id: number) => `${kind}-${id}`;

export function CompaniesClient({ initial, today }: { initial: CompaniesData; today: string }) {
  const [data, setData] = useState(initial);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  const [report, setReport] = useState(false);

  const docsBy = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    for (const d of data.docs) {
      const k = keyOf(d.kind, d.companyId);
      m.set(k, [...(m.get(k) ?? []), d]);
    }
    return m;
  }, [data.docs]);
  const nameOf = useMemo(() => new Map(data.companies.map((c) => [keyOf(c.kind, c.id), c.name])), [data.companies]);

  const due = useMemo(
    () => docDueItems(data.docs.map((d) => ({ ...d, company: nameOf.get(keyOf(d.kind, d.companyId)) ?? "" })), today),
    [data.docs, nameOf, today],
  );

  const q = query.trim().toLowerCase();
  const shown = data.companies.filter((c) => {
    if (filter !== "all" && c.kind !== filter) return false;
    if (!q) return true;
    const docs = docsBy.get(keyOf(c.kind, c.id)) ?? [];
    return [c.name, c.trade, c.contact, c.email, c.phone, c.notes, c.accountNo, ...docs.map((d) => `${d.item} ${d.reference}`)]
      .some((f) => f.toLowerCase().includes(q));
  });
  const count = (k: Kind) => data.companies.filter((c) => c.kind === k).length;

  function companySaved(c: CompanyRow) {
    setData((d) => {
      const others = d.companies.filter((x) => !(x.kind === c.kind && x.id === c.id));
      return { ...d, companies: [...others, c].sort((a, b) => a.name.localeCompare(b.name)) };
    });
    setOpen({ view: "company", kind: c.kind, id: c.id });
  }
  function companyDeleted(kind: Kind, id: number) {
    setData((d) => ({
      ...d,
      companies: d.companies.filter((x) => !(x.kind === kind && x.id === id)),
      docs: d.docs.filter((x) => !(x.kind === kind && x.companyId === id)),
    }));
    setOpen(null);
  }
  function docSaved(doc: DocRow) {
    setData((d) => ({ ...d, docs: [...d.docs.filter((x) => x.id !== doc.id), doc] }));
    setOpen({ view: "doc", kind: doc.kind, companyId: doc.companyId, id: doc.id });
  }
  function docDeleted(doc: DocRow) {
    setData((d) => ({ ...d, docs: d.docs.filter((x) => x.id !== doc.id) }));
    setOpen({ view: "company", kind: doc.kind, id: doc.companyId });
  }

  const attention: AttentionItem[] = due.map((it) => ({
    key: `doc-${it.id}`,
    level: it.tone === "overdue" ? "overdue" : "soon",
    tag: it.tone === "overdue" ? "Expired" : "Expiring",
    name: it.company,
    detail: `${it.item} · ${it.detail}`,
    onOpen: () => setOpen({ view: "doc", kind: it.kind, companyId: it.companyId, id: it.id }),
  }));

  const columns: Column<CompanyRow>[] = [
    { key: "name", label: "Company", cell: (c) => c.name, sub: (c) => c.trade },
    { key: "type", label: "Type", cell: (c) => KIND_LABEL[c.kind] },
    { key: "contact", label: "Contact", cell: (c) => c.contact },
    { key: "phone", label: "Phone", className: "whitespace-nowrap", cell: (c) => c.phone },
    { key: "approved", label: "Approved", cell: (c) => (c.kind === "subcontractor"
      ? <StatusPill tone={c.approved ? "green" : "amber"}>{c.approved ? "Approved" : "Not approved"}</StatusPill>
      : <StatusPill tone="grey">Supplier</StatusPill>) },
    { key: "docs", label: "Documents", cell: (c) => {
      const docs = docsBy.get(keyOf(c.kind, c.id)) ?? [];
      const expired = docs.filter((d) => docState(d.expiresOn, today) === "overdue").length;
      const expiring = docs.filter((d) => ["soon", "up"].includes(docState(d.expiresOn, today))).length;
      if (expired) return <StatusPill tone="red">{expired} expired</StatusPill>;
      if (expiring) return <StatusPill tone="amber">{expiring} expiring</StatusPill>;
      return docs.length ? <StatusPill tone="green">{docs.length} in date</StatusPill> : <StatusPill tone="grey">None</StatusPill>;
    } },
  ];

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Subcontractors and suppliers"
        count={data.companies.length}
        reports={[{ label: "Create report", hint: "Choose companies, columns and documents", onSelect: () => setReport(true) }]}
        newAction={{
          label: "New",
          items: [
            { label: "Subcontractor", onSelect: () => setOpen({ view: "company", kind: "subcontractor", id: null }) },
            { label: "Supplier", onSelect: () => setOpen({ view: "company", kind: "supplier", id: null }) },
          ],
        }}
      />

      <FilterPills<Filter>
        label="Show"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: data.companies.length },
          { value: "subcontractor", label: "Subcontractors", count: count("subcontractor") },
          { value: "supplier", label: "Suppliers", count: count("supplier") },
        ]}
      />
      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder="Search companies, trades, contacts and documents" label="Search subcontractors and suppliers" />
      </FilterRow>
      <div data-testid="company-list">
        <DataTable label="Subcontractors and suppliers" rows={shown} columns={columns} rowKey={(c) => keyOf(c.kind, c.id)}
          onOpen={(c) => setOpen({ view: "company", kind: c.kind, id: c.id })} empty={q ? "Nothing matches the search." : "Nothing here yet."} />
      </div>

      <CompanyDrawer open={open} data={data} today={today} onOpen={setOpen}
        companySaved={companySaved} companyDeleted={companyDeleted} docSaved={docSaved} docDeleted={docDeleted} />
      <CompaniesReport open={report} onClose={() => setReport(false)} />
    </RegisterLayout>
  );
}

function CompanyDrawer({
  open, data, today, onOpen, companySaved, companyDeleted, docSaved, docDeleted,
}: {
  open: Open | null;
  data: CompaniesData;
  today: string;
  onOpen: (o: Open | null) => void;
  companySaved: (c: CompanyRow) => void;
  companyDeleted: (kind: Kind, id: number) => void;
  docSaved: (d: DocRow) => void;
  docDeleted: (d: DocRow) => void;
}) {
  if (!open) return null;
  const company = data.companies.find((c) => c.kind === open.kind && c.id === (open.view === "company" ? open.id : open.companyId)) ?? null;
  if (open.view === "company") {
    const docs = company ? data.docs.filter((d) => d.kind === company.kind && d.companyId === company.id) : [];
    return (
      <Drawer open onClose={() => onOpen(null)} title={company ? company.name : `Add ${open.kind}`} width="max-w-2xl">
        <CompanyForm key={company ? JSON.stringify(company) : `new-${open.kind}`} kind={open.kind} company={company} docs={docs} trades={data.trades}
          today={today} onOpen={onOpen} onSaved={companySaved} onDeleted={() => company && companyDeleted(company.kind, company.id)} />
      </Drawer>
    );
  }
  const doc = data.docs.find((d) => d.id === open.id) ?? null;
  return (
    <Drawer open onClose={() => onOpen(null)} title={doc ? `${doc.item} · ${company?.name ?? ""}` : `Add document · ${company?.name ?? ""}`} width="max-w-2xl">
      <DocForm key={doc ? JSON.stringify(doc) : "new"} kind={open.kind} companyId={open.companyId} company={company} doc={doc}
        items={data.docItems} today={today} onOpen={onOpen} onSaved={docSaved} onDeleted={() => doc && docDeleted(doc)} />
    </Drawer>
  );
}

// "Create report": the office chooses what goes in, then the PDF opens in-window.
function CompaniesReport({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <ReportDialog
      open={open}
      onClose={onClose}
      id="subcontractors"
      fileName="Subcontractors and suppliers.pdf"
      groups={[
        {
          key: "include",
          label: "Include",
          type: "ticks",
          initial: ["subcontractor", "supplier"],
          options: [
            { value: "subcontractor", label: "Subcontractors" },
            { value: "supplier", label: "Suppliers" },
            { value: "approved", label: "Only subcontractors approved to work" },
          ],
        },
        {
          key: "cols",
          label: "Columns",
          type: "ticks",
          twoColumns: true,
          initial: REPORT_COLUMNS.filter((c) => c.default).map((c) => c.key),
          options: REPORT_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
        },
        {
          key: "docs",
          label: "Documents",
          type: "pick",
          initial: "all",
          options: [
            { value: "all", label: "List every document" },
            { value: "due", label: "Only expired or expiring documents" },
            { value: "none", label: "Leave documents out" },
          ],
        },
      ]}
      check={(h) => (!h.on("include", "subcontractor") && !h.on("include", "supplier") ? "Tick subcontractors, suppliers or both." : null)}
      url={(h) => {
        const p = new URLSearchParams();
        p.set("include", ["subcontractor", "supplier"].filter((v) => h.on("include", v)).join(","));
        p.set("cols", h.ticked("cols").join(","));
        p.set("docs", h.pick("docs") || "all");
        if (h.on("include", "approved")) p.set("approved", "1");
        return `/subcontractors/report?${p}`;
      }}
    />
  );
}
