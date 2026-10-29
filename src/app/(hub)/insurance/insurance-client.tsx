"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { niceDate } from "../_registers/dates";
import { Chip, ViewSwitch } from "../_registers/ui";
import type { Saved } from "./actions";
import type { InsuranceData } from "./data";
import { CertForm, ClaimForm, ClaimList, claimLinks, PolicyForm } from "./forms";
import { ReportDialog } from "./report-dialog";
import { attentionItems, CLAIM_STATUSES, expiryLabel, expiryState, isClosed, labelOf, money, policyTitle, type AttentionItem } from "./rules";
import type { Open } from "./types";

export type Tab = "policies" | "claims" | "certs";

export function InsuranceClient({ initial, today, start, startTab }: { initial: InsuranceData; today: string; start: Open | null; startTab: Tab }) {
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<Tab>(startTab);
  const [query, setQuery] = useState("");
  const [pastPeriods, setPastPeriods] = useState(false);
  const [claimFilter, setClaimFilter] = useState<"open" | "all">("open");
  const [open, setOpen] = useState<Open | null>(start);
  const [reporting, setReporting] = useState(false);
  const due = useMemo(() => attentionItems(data.policies, data.claims, data.certs, today), [data, today]);
  const q = query.trim().toLowerCase();
  const has = (...f: string[]) => !q || f.some((x) => x.toLowerCase().includes(q));

  function saved(s: Saved, next: Open | null) {
    setData(s.all);
    setOpen(next);
  }

  const policies = data.policies.filter((p) => (pastPeriods || !p.renewedById) &&
    has(p.policyType, p.name, p.insurer, p.policyNo, p.notes, ...p.covers.map((c) => c.cover)));
  const claims = data.claims.filter((c) => (claimFilter === "all" || !isClosed(c.status)) &&
    has(c.claimNo, c.claimType, c.insurer, c.insurerClaimNo, c.otherParty, c.description, c.jobNo, c.site, c.client, c.notes, claimLinks(data, c), labelOf(CLAIM_STATUSES, c.status)));
  const certs = data.certs.filter((c) => has(c.name, c.issuer, c.reference, c.level, c.notes));
  const openClaims = data.claims.filter((c) => !isClosed(c.status)).length;

  const addButton = {
    policies: { label: "Add policy", open: { kind: "policy", id: null } as Open },
    claims: { label: "Add claim", open: { kind: "claim", id: null } as Open },
    certs: { label: "Add accreditation", open: { kind: "cert", id: null } as Open },
  }[tab];

  return (
    <div>
      <AttentionPanel items={due} onOpen={setOpen} />

      <ViewSwitch<Tab>
        value={tab}
        onChange={(t) => { setTab(t); setQuery(""); }}
        options={[
          { value: "policies", label: "Policies", count: data.policies.filter((p) => !p.renewedById).length },
          { value: "claims", label: "Claims", count: openClaims },
          { value: "certs", label: "Accreditations", count: data.certs.length },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex-1 min-w-56">
          <SearchBox value={query} onChange={setQuery}
            label={`Search ${tab === "certs" ? "accreditations" : tab}`}
            placeholder={tab === "policies" ? "Search policies, insurers and covers" : tab === "claims" ? "Search claims, parties, vehicles and jobs" : "Search accreditations"} />
        </div>
        {tab === "policies" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-brand" checked={pastPeriods} onChange={(e) => setPastPeriods(e.target.checked)} /> Show earlier periods
          </label>
        )}
        {tab === "claims" && (
          <select aria-label="Which claims" value={claimFilter} onChange={(e) => setClaimFilter(e.target.value as "open" | "all")}
            className="rounded-lg border border-line bg-white px-3 py-2">
            <option value="open">Open claims</option>
            <option value="all">All claims</option>
          </select>
        )}
        <button type="button" onClick={() => setOpen(addButton.open)} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">{addButton.label}</button>
        <button type="button" onClick={() => setReporting(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold hover:bg-white">Create report</button>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        {tab === "policies" && (
          <ul className="divide-y divide-line" data-testid="policy-list">
            {policies.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen({ kind: "policy", id: p.id })} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{policyTitle(p)}</span>
                    <span className="block text-sm text-muted truncate">
                      {[p.insurer, p.policyNo, p.covers.map((c) => `${c.cover}${c.limit != null ? ` ${money(c.limit)}` : ""}`).join(", ")].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {p.renewedById ? <Chip>Earlier period{p.expiresOn ? `, ended ${niceDate(p.expiresOn)}` : ""}</Chip>
                      : <Chip tone={expiryState(p.expiresOn, today)}>{expiryLabel(p.expiresOn, today)}</Chip>}
                  </span>
                </button>
              </li>
            ))}
            {policies.length === 0 && <li className="px-4 py-6 text-sm text-muted">{q ? "Nothing matches the search." : "No policies yet."}</li>}
          </ul>
        )}
        {tab === "claims" && (
          <div className="p-3" data-testid="claim-list">
            {claims.length === 0
              ? <p className="px-1 py-3 text-sm text-muted">{q ? "Nothing matches the search." : claimFilter === "open" ? "No open claims." : "No claims yet."}</p>
              : <ClaimList claims={claims} data={data} today={today} onOpen={setOpen} />}
          </div>
        )}
        {tab === "certs" && (
          <ul className="divide-y divide-line" data-testid="cert-list">
            {certs.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => setOpen({ kind: "cert", id: c.id })} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.name}</span>
                    <span className="block text-sm text-muted truncate">{[c.issuer, c.level, c.reference].filter(Boolean).join(" · ")}</span>
                  </span>
                  <Chip tone={expiryState(c.expiresOn, today)}>{expiryLabel(c.expiresOn, today)}</Chip>
                </button>
              </li>
            ))}
            {certs.length === 0 && <li className="px-4 py-6 text-sm text-muted">{q ? "Nothing matches the search." : "No accreditations yet."}</li>}
          </ul>
        )}
      </div>

      <InsuranceDrawer open={open} data={data} today={today} onOpen={setOpen} onSaved={saved} />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} />
    </div>
  );
}

function AttentionPanel({ items, onOpen }: { items: AttentionItem[]; onOpen: (o: Open) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <section className="mb-5 bg-white border border-line rounded-xl" data-testid="attention">
      <button type="button" onClick={() => setShown((s) => !s)} aria-expanded={shown} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <h2 className="font-semibold flex-1">Needs attention</h2>
        <span className="text-sm text-muted">{items.length === 0 ? "Nothing expiring in the next 60 days and no open claims" : `${items.length} item${items.length === 1 ? "" : "s"}`}</span>
        <span aria-hidden="true" className="text-muted">{shown ? "▲" : "▼"}</span>
      </button>
      {shown && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {items.map((it) => (
            <li key={it.key}>
              <button type="button" onClick={() => onOpen({ kind: it.open.kind, id: it.open.id } as Open)} className="w-full text-left px-4 py-2 hover:bg-paper flex flex-wrap items-center gap-x-3">
                <Chip tone={it.tone}>{it.what}</Chip>
                <span className="font-medium">{it.name}</span>
                <span className="text-sm text-muted">{it.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function InsuranceDrawer({ open, data, today, onOpen, onSaved }: { open: Open | null; data: InsuranceData; today: string; onOpen: (o: Open | null) => void; onSaved: (s: Saved, next: Open | null) => void }) {
  if (!open) return null;
  const common = { data, today, onOpen, onSaved };
  const close = () => onOpen(null);
  if (open.kind === "policy") {
    const p = open.id ? data.policies.find((x) => x.id === open.id) ?? null : null;
    if (open.id && !p) return null;
    const prev = open.renewFrom ? data.policies.find((x) => x.id === open.renewFrom) : undefined;
    const title = p ? policyTitle(p) : prev ? `Add renewal · ${policyTitle(prev)}` : "Add policy";
    return (
      <Drawer open onClose={close} title={title} width="max-w-2xl">
        <PolicyForm key={p ? `${p.id}-${JSON.stringify(p)}` : `new-${open.renewFrom ?? ""}`} policy={p} renewFrom={open.renewFrom} {...common} />
      </Drawer>
    );
  }
  if (open.kind === "claim") {
    const c = open.id ? data.claims.find((x) => x.id === open.id) ?? null : null;
    if (open.id && !c) return null;
    return (
      <Drawer open onClose={close} title={c ? `${c.claimNo} · ${c.claimType}` : "Add claim"} width="max-w-2xl">
        <ClaimForm key={c ? JSON.stringify(c) : "new"} claim={c} prefill={open} {...common} />
      </Drawer>
    );
  }
  const c = open.id ? data.certs.find((x) => x.id === open.id) ?? null : null;
  if (open.id && !c) return null;
  return (
    <Drawer open onClose={close} title={c ? c.name : "Add accreditation"} width="max-w-2xl">
      <CertForm key={c ? JSON.stringify(c) : "new"} cert={c} {...common} />
    </Drawer>
  );
}
