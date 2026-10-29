"use client";

import { useMemo, useState } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { niceDate } from "../_registers/dates";
import { dueTone } from "../_registers/ui";
import { PageTop, RegisterLayout, type AttentionItem as PanelItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill } from "@/components/ui/register";
import type { Saved } from "./actions";
import type { InsuranceData } from "./data";
import { CertForm, ClaimForm, claimLinks, PolicyForm } from "./forms";
import { ReportDialog } from "./report-dialog";
import { actionState, attentionItems, CLAIM_STATUSES, expiryLabel, expiryState, isClosed, labelOf, money, policyTitle } from "./rules";
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

  const attention: PanelItem[] = due.map((it) => ({
    key: it.key,
    level: it.tone === "overdue" ? "overdue" : "soon",
    tag: it.what,
    name: it.name,
    detail: it.detail,
    onOpen: () => setOpen({ kind: it.open.kind, id: it.open.id } as Open),
  }));
  const linked = (c: (typeof claims)[number]) => claimLinks(data, c);
  const empty = (none: string) => (q ? "Nothing matches the search." : none);

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Insurance and accreditations"
        count={data.policies.filter((p) => !p.renewedById).length + data.claims.length + data.certs.length}
        reports={[{ label: "Create report", hint: "Choose policies, claims and accreditations", onSelect: () => setReporting(true) }]}
        newAction={{
          label: "New",
          items: [
            { label: "Policy", onSelect: () => setOpen({ kind: "policy", id: null }) },
            { label: "Claim", onSelect: () => setOpen({ kind: "claim", id: null }) },
            { label: "Accreditation", onSelect: () => setOpen({ kind: "cert", id: null }) },
          ],
        }}
      />

      <FilterPills<Tab>
        label="Show"
        value={tab}
        onChange={(t) => { setTab(t); setQuery(""); }}
        options={[
          { value: "policies", label: "Policies", count: data.policies.filter((p) => !p.renewedById).length },
          { value: "claims", label: "Claims", count: openClaims },
          { value: "certs", label: "Accreditations", count: data.certs.length },
        ]}
      />

      <FilterRow>
        <SearchBox value={query} onChange={setQuery}
          label={`Search ${tab === "certs" ? "accreditations" : tab}`}
          placeholder={tab === "policies" ? "Search policies, insurers and covers" : tab === "claims" ? "Search claims, parties, vehicles and jobs" : "Search accreditations"} />
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
      </FilterRow>

      {tab === "policies" && (
        <div data-testid="policy-list">
          <DataTable label="Policies" rows={policies} rowKey={(p) => p.id} onOpen={(p) => setOpen({ kind: "policy", id: p.id })} empty={empty("No policies yet.")} columns={[
            { key: "policy", label: "Policy", cell: (p) => policyTitle(p), sub: (p) => [p.insurer, p.policyNo].filter(Boolean).join(" · ") },
            { key: "covers", label: "Covers", cell: (p) => <span className="line-clamp-2">{p.covers.map((c) => `${c.cover}${c.limit != null ? ` ${money(c.limit)}` : ""}`).join(", ")}</span> },
            { key: "period", label: "Period", className: "whitespace-nowrap", cell: (p) => (p.startsOn || p.expiresOn ? `${p.startsOn ? niceDate(p.startsOn) : "?"} – ${p.expiresOn ? niceDate(p.expiresOn) : "?"}` : "") },
            { key: "status", label: "Status", cell: (p) => (p.renewedById
              ? <StatusPill tone="grey">Earlier period</StatusPill>
              : <StatusPill tone={dueTone(expiryState(p.expiresOn, today))}>{expiryLabel(p.expiresOn, today)}</StatusPill>) },
          ]} />
        </div>
      )}
      {tab === "claims" && (
        <div data-testid="claim-list">
          <DataTable label="Claims" rows={claims} rowKey={(c) => c.id} onOpen={(c) => setOpen({ kind: "claim", id: c.id })}
            empty={empty(claimFilter === "open" ? "No open claims." : "No claims yet.")} columns={[
              { key: "claim", label: "Claim", className: "whitespace-nowrap", cell: (c) => `${c.claimNo} ${c.claimType}`, sub: (c) => (c.incidentDate ? `Incident ${niceDate(c.incidentDate)}` : "") },
              { key: "linked", label: "Linked to", cell: linked },
              { key: "status", label: "Status", cell: (c) => <StatusPill tone={isClosed(c.status) ? "green" : "amber"}>{labelOf(CLAIM_STATUSES, c.status)}</StatusPill> },
              { key: "next", label: "Next action", cell: (c) => (isClosed(c.status) ? (c.closedOn ? `Closed ${niceDate(c.closedOn)}` : "")
                : c.nextActionDue ? <StatusPill tone={dueTone(actionState(c.nextActionDue, today)) === "grey" ? "blue" : dueTone(actionState(c.nextActionDue, today))}>{[c.nextAction, `by ${niceDate(c.nextActionDue)}`].filter(Boolean).join(" ")}</StatusPill>
                : c.nextAction) },
            ]} />
        </div>
      )}
      {tab === "certs" && (
        <div data-testid="cert-list">
          <DataTable label="Accreditations" rows={certs} rowKey={(c) => c.id} onOpen={(c) => setOpen({ kind: "cert", id: c.id })} empty={empty("No accreditations yet.")} columns={[
            { key: "name", label: "Accreditation", cell: (c) => c.name, sub: (c) => c.issuer },
            { key: "ref", label: "Number / level", cell: (c) => [c.reference, c.level].filter(Boolean).join(" · ") },
            { key: "cost", label: "Annual cost", cell: (c) => money(c.annualCost) },
            { key: "status", label: "Status", cell: (c) => <StatusPill tone={dueTone(expiryState(c.expiresOn, today))}>{expiryLabel(c.expiresOn, today)}</StatusPill> },
          ]} />
        </div>
      )}

      <InsuranceDrawer open={open} data={data} today={today} onOpen={setOpen} onSaved={saved} />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} />
    </RegisterLayout>
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
