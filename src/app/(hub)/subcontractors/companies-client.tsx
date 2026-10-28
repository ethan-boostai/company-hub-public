"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { Chip, ViewSwitch } from "../_registers/ui";
import type { CompaniesData, CompanyRow, DocRow } from "./data";
import { CompanyForm, DocForm } from "./forms";
import { ReportDialog } from "./report-dialog";
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

  return (
    <div>
      <DuePanel items={due} onOpen={setOpen} />

      <ViewSwitch<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: data.companies.length },
          { value: "subcontractor", label: "Subcontractors", count: count("subcontractor") },
          { value: "supplier", label: "Suppliers", count: count("supplier") },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-56">
          <SearchBox value={query} onChange={setQuery} placeholder="Search companies, trades, contacts and documents" label="Search subcontractors and suppliers" />
        </div>
        <button type="button" onClick={() => setOpen({ view: "company", kind: "subcontractor", id: null })} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">
          Add subcontractor
        </button>
        <button type="button" onClick={() => setOpen({ view: "company", kind: "supplier", id: null })} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">
          Add supplier
        </button>
        <button type="button" onClick={() => setReport(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-white">
          Create report
        </button>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line" data-testid="company-list">
          {shown.map((c) => {
            const docs = docsBy.get(keyOf(c.kind, c.id)) ?? [];
            const expired = docs.filter((d) => docState(d.expiresOn, today) === "overdue").length;
            const expiring = docs.filter((d) => ["soon", "up"].includes(docState(d.expiresOn, today))).length;
            return (
              <li key={keyOf(c.kind, c.id)}>
                <button type="button" onClick={() => setOpen({ view: "company", kind: c.kind, id: c.id })}
                  className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-sm text-muted truncate">{[c.trade, c.contact, c.phone].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    <Chip>{KIND_LABEL[c.kind]}</Chip>
                    {c.kind === "subcontractor" && <Chip tone={c.approved ? "ok" : "soon"}>{c.approved ? "Approved" : "Not approved"}</Chip>}
                    <Chip>{docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"}` : "No documents"}</Chip>
                    {expired > 0 && <Chip tone="overdue">{expired} expired</Chip>}
                    {expiring > 0 && <Chip tone="soon">{expiring} expiring</Chip>}
                  </span>
                </button>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-4 py-6 text-sm text-muted">{q ? "Nothing matches the search." : "Nothing here yet."}</li>}
        </ul>
      </div>

      <CompanyDrawer open={open} data={data} today={today} onOpen={setOpen}
        companySaved={companySaved} companyDeleted={companyDeleted} docSaved={docSaved} docDeleted={docDeleted} />
      <ReportDialog open={report} onClose={() => setReport(false)} />
    </div>
  );
}

function DuePanel({ items, onOpen }: { items: ReturnType<typeof docDueItems>; onOpen: (o: Open) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <section className="mb-5 bg-white border border-line rounded-xl">
      <button type="button" onClick={() => setShown((s) => !s)} aria-expanded={shown} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <h2 className="font-semibold flex-1">Documents expired or expiring</h2>
        <span className="text-sm text-muted">{items.length === 0 ? "Nothing expiring in the next 60 days" : `${items.length} document${items.length === 1 ? "" : "s"}`}</span>
        <span aria-hidden="true" className="text-muted">{shown ? "▲" : "▼"}</span>
      </button>
      {shown && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((it) => (
            <li key={it.id}>
              <button type="button" onClick={() => onOpen({ view: "doc", kind: it.kind, companyId: it.companyId, id: it.id })}
                className="w-full text-left px-4 py-2 hover:bg-paper flex flex-wrap items-center gap-x-3">
                <Chip tone={it.tone}>{it.tone === "overdue" ? "Expired" : "Expiring"}</Chip>
                <span className="font-medium">{it.company}</span>
                <span>{it.item}</span>
                <span className="text-sm text-muted">{it.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
