"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { niceDate, niceDateTime } from "../_registers/dates";
import { RecordFiles } from "../_registers/record-files";
import { Chip, Choice, MiniList, RecordSelect, Section, SmallButton, StatusBox } from "../_registers/ui";
import { deleteInsuranceRecord, saveCert, saveClaim, savePolicy, type Deletable, type Saved } from "./actions";
import type { ClaimRow, CertRow, InsuranceData, PolicyRow } from "./data";
import {
  actionState, CERT_LIST, CLAIM_STATUSES, CLAIM_TYPE_LIST, COVER_LIST, DIRECTIONS, expiryLabel, expiryState, isClosed, labelOf, money,
  POLICY_TYPE_LIST, policyTitle, renewalDates,
} from "./rules";
import type { Common } from "./types";

const errorsOf = (state: { ok: boolean; fieldErrors?: Record<string, string> } | null) =>
  (state && !state.ok ? state.fieldErrors ?? {} : {}) as Record<string, string>;

const period = (p: { startsOn: string | null; expiresOn: string | null }) =>
  p.startsOn || p.expiresOn ? `${p.startsOn ? niceDate(p.startsOn) : "?"} to ${p.expiresOn ? niceDate(p.expiresOn) : "?"}` : "Dates not set";

// Every period of a policy, oldest first.
export function policyChain(data: InsuranceData, p: PolicyRow): PolicyRow[] {
  const byId = new Map(data.policies.map((x) => [x.id, x]));
  let first = p;
  for (let i = 0; first.renewedFromId && byId.has(first.renewedFromId) && i < 200; i++) first = byId.get(first.renewedFromId)!;
  const out = [first];
  for (let cur = first, i = 0; cur.renewedById && byId.has(cur.renewedById) && i < 200; i++) {
    cur = byId.get(cur.renewedById)!;
    out.push(cur);
  }
  return out;
}

export function claimLinks(data: InsuranceData, c: ClaimRow): string {
  const v = data.vehicles.find((x) => x.id === c.vehicleId);
  const a = data.assets.find((x) => x.id === c.assetId);
  return [v?.reg, a ? (a.assetTag ? `${a.assetTag} ${a.name}` : a.name) : "", c.jobNo ? `Job ${c.jobNo}` : "", c.site].filter(Boolean).join(" · ");
}

/* ---------- Policy ---------- */

type Line = { key: number; cover: string; limit: string; excess: string };
const amount = (v: number | null) => (v == null ? "" : String(v));

export function PolicyForm({ policy: p, renewFrom, data, today, onOpen, onSaved }: Common & { policy: PolicyRow | null; renewFrom?: number }) {
  const prev = renewFrom ? data.policies.find((x) => x.id === renewFrom) ?? null : null;
  const base = p ?? prev;
  const dates = prev ? renewalDates(prev, today) : null;
  const [lines, setLines] = useState<Line[]>(() => {
    const from = (base?.covers ?? []).map((c, i) => ({ key: i, cover: c.cover, limit: amount(c.limit), excess: amount(c.excess) }));
    return from.length ? from : [{ key: 0, cover: "", limit: "", excess: "" }];
  });
  const [nextKey, setNextKey] = useState(100);
  const chain = p ? policyChain(data, p) : [];
  const claims = p ? data.claims.filter((c) => c.policyId === p.id) : [];
  const current = p && !p.renewedById;

  return (
    <div>
      {prev && <p className="mb-4 text-sm">Renewal of {policyTitle(prev)}, {period(prev)}. The earlier period stays as history.</p>}
      {p && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatusBox label="Period" value={period(p)} />
          {current
            ? <StatusBox label="Expiry" value={p.expiresOn ? niceDate(p.expiresOn) : ""} note={expiryLabel(p.expiresOn, today)} tone={expiryState(p.expiresOn, today)} />
            : <StatusBox label="Renewed" value="Earlier period" note="Kept as history. No reminders." />}
        </div>
      )}
      <GuardedForm action={savePolicy} onSaved={(r) => r.data && onSaved(r.data, { kind: "policy", id: r.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {p && <input type="hidden" name="id" value={p.id} />}
              {prev && <input type="hidden" name="renewed_from_id" value={prev.id} />}
              <SelectWithAdd list={POLICY_TYPE_LIST} name="policy_type" label="Type of policy" options={data.policyTypes} defaultValue={base?.policyType ?? ""} />
              {err.policy_type && <p className="-mt-3 mb-4 text-sm text-danger">{err.policy_type}</p>}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Name (optional)" name="name" defaultValue={base?.name} error={err.name} hint="To tell two policies of the same type apart, e.g. Fleet" />
                <TextField label="Insurer" name="insurer" defaultValue={base?.insurer} error={err.insurer} />
                <TextField label="Policy number" name="policy_no" defaultValue={base?.policyNo} error={err.policy_no} spellCheck={false} />
                <div />
                <TextField label="Starts" name="starts_on" type="date" defaultValue={dates?.startsOn ?? p?.startsOn ?? ""} error={err.starts_on} />
                <TextField label="Expires" name="expires_on" type="date" defaultValue={dates?.expiresOn ?? p?.expiresOn ?? ""} error={err.expires_on} />
              </div>

              <fieldset className="mb-4">
                <legend className="block text-sm font-medium mb-1">Covers</legend>
                <div className="space-y-3">
                  {lines.map((l, i) => (
                    <div key={l.key} className="rounded-lg border border-line p-3" data-testid="cover-line">
                      <SelectWithAdd list={COVER_LIST} name="cover_cover" label={`Cover ${i + 1}`} options={data.covers} defaultValue={l.cover} />
                      <div className="grid grid-cols-2 gap-x-3 -mb-4">
                        <TextField label="Limit (£)" name="cover_limit" inputMode="decimal" defaultValue={l.limit} spellCheck={false} />
                        <TextField label="Excess (£)" name="cover_excess" inputMode="decimal" defaultValue={l.excess} spellCheck={false} />
                      </div>
                      {lines.length > 1 && (
                        <button type="button" className="mt-2 text-sm text-danger underline" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          Remove this cover
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {err.covers && <p className="mt-1 text-sm text-danger">{err.covers}</p>}
                <button type="button" className="mt-2 px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper"
                  onClick={() => { setLines((ls) => [...ls, { key: nextKey, cover: "", limit: "", excess: "" }]); setNextKey((k) => k + 1); }}>
                  Add cover
                </button>
              </fieldset>

              <TextArea label="Notes" name="notes" defaultValue={base?.notes} error={err.notes} rows={3} />
              <SaveButton>{p ? "Save" : prev ? "Add renewal" : "Add policy"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>

      {p && (
        <>
          {current && (
            <Section title="Renewal" action={<SmallButton onClick={() => onOpen({ kind: "policy", id: null, renewFrom: p.id })}>Add renewal</SmallButton>}>
              <p className="text-sm text-muted">Renewed? Add the new period. This one stays as history and its reminder stops.</p>
            </Section>
          )}
          {chain.length > 1 && (
            <Section title="All periods">
              <MiniList empty="" items={[...chain].reverse().map((x) => ({
                key: x.id, title: period(x), sub: [x.insurer, x.policyNo].filter(Boolean).join(" · "),
                onClick: x.id === p.id ? undefined : () => onOpen({ kind: "policy", id: x.id }),
                chips: x.id === p.id ? <Chip>Showing</Chip> : x.renewedById ? <Chip>Earlier period</Chip> : <Chip tone={expiryState(x.expiresOn, today)}>Current</Chip>,
              }))} />
            </Section>
          )}
          <Section title="Claims on this policy" action={<SmallButton onClick={() => onOpen({ kind: "claim", id: null, policyId: p.id })}>Add claim</SmallButton>}>
            <ClaimList claims={claims} data={data} today={today} onOpen={onOpen} />
          </Section>
          <RecordFiles entityTable="insurance_policies" entityId={p.id} title="Schedule and documents" />
          <DeleteRecord table="insurance_policies" id={p.id} label="Delete this policy period" onSaved={onSaved}
            message={`This deletes ${policyTitle(p)} for ${period(p)} and its covers.${claims.length ? ` Its ${claims.length} claim(s) stay, without the policy link.` : ""} Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

export function ClaimList({ claims, data, today, onOpen }: { claims: ClaimRow[]; data: InsuranceData; today: string; onOpen: Common["onOpen"] }) {
  return (
    <MiniList empty="No claims." items={claims.map((c) => ({
      key: c.id, title: `${c.claimNo} ${c.claimType}`, onClick: () => onOpen({ kind: "claim", id: c.id }),
      sub: [c.incidentDate ? niceDate(c.incidentDate) : "", claimLinks(data, c)].filter(Boolean).join(" · "),
      chips: <>
        <Chip tone={isClosed(c.status) ? "ok" : "up"}>{labelOf(CLAIM_STATUSES, c.status)}</Chip>
        {!isClosed(c.status) && c.nextActionDue && <Chip tone={actionState(c.nextActionDue, today)}>Next {niceDate(c.nextActionDue)}</Chip>}
      </>,
    }))} />
  );
}

/* ---------- Claim ---------- */

export function ClaimForm({
  claim: c, prefill, data, today, onSaved,
}: Common & { claim: ClaimRow | null; prefill: { vehicleId?: number; accidentId?: number; assetId?: number; policyId?: number } }) {
  const accident = data.accidents.find((a) => a.id === (c?.accidentId ?? prefill.accidentId));
  const vehicleId = c?.vehicleId ?? prefill.vehicleId ?? accident?.vehicleId;
  const assetId = c?.assetId ?? prefill.assetId;
  const policyId = c?.policyId ?? prefill.policyId;
  const [status, setStatus] = useState<string>(c?.status ?? "open");
  const policyOptions = data.policies
    .filter((p) => !p.renewedById || p.id === policyId)
    .map((p) => ({ value: String(p.id), label: `${policyTitle(p)}${p.insurer ? ` (${p.insurer})` : ""}${p.renewedById ? `, ${period(p)}` : ""}` }));

  return (
    <div>
      {c && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatusBox label="Claim" value={c.claimNo} note={`${labelOf(DIRECTIONS, c.direction)} · added ${niceDateTime(c.createdAt)}`} />
          <StatusBox label="Status" value={labelOf(CLAIM_STATUSES, c.status)} tone={isClosed(c.status) ? "ok" : actionState(c.nextActionDue, today) === "none" ? "up" : actionState(c.nextActionDue, today)}
            note={isClosed(c.status) ? (c.closedOn ? `Closed ${niceDate(c.closedOn)}` : "") : c.nextActionDue ? `Next action ${niceDate(c.nextActionDue)}` : "No next action set"} />
        </div>
      )}
      {!c && <p className="mb-4 text-sm text-muted">The claim number (CLM-…) is given when you add it.</p>}
      <GuardedForm action={saveClaim} onSaved={(r) => r.data && onSaved(r.data, { kind: "claim", id: r.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {c && <input type="hidden" name="id" value={c.id} />}
              <SelectWithAdd list={CLAIM_TYPE_LIST} name="claim_type" label="Type of claim" options={data.claimTypes} defaultValue={c?.claimType ?? (prefill.assetId ? "Equipment" : vehicleId ? "Vehicle" : "")} />
              {err.claim_type && <p className="-mt-3 mb-4 text-sm text-danger">{err.claim_type}</p>}
              <Choice label="Claim made" name="direction" options={DIRECTIONS} defaultValue={c?.direction ?? "by_us"} />
              <Choice label="Status" name="status" options={CLAIM_STATUSES} defaultValue={c?.status ?? "open"} onChange={setStatus} />
              <div className="grid sm:grid-cols-3 gap-x-4">
                <TextField label="Incident date" name="incident_date" type="date" defaultValue={c?.incidentDate ?? ""} error={err.incident_date} />
                <TextField label="Date lodged" name="lodged_on" type="date" defaultValue={c?.lodgedOn ?? ""} error={err.lodged_on} />
                {isClosed(status as ClaimRow["status"]) && (
                  <TextField label="Date closed" name="closed_on" type="date" defaultValue={c?.closedOn ?? ""} error={err.closed_on} hint="Today if left blank" />
                )}
              </div>
              <TextArea label="What happened" name="description" defaultValue={c?.description} error={err.description} rows={3} />

              <h3 className="font-semibold mt-2 mb-2">Insurer</h3>
              <RecordSelect label="Our policy" name="policy_id" options={policyOptions} defaultValue={policyId ? String(policyId) : ""} placeholder="None" />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Insurer or other body" name="insurer" defaultValue={c?.insurer} error={err.insurer} />
                <TextField label="Their claim reference" name="insurer_claim_no" defaultValue={c?.insurerClaimNo} error={err.insurer_claim_no} spellCheck={false} />
                <TextField label="Other party" name="other_party" defaultValue={c?.otherParty} error={err.other_party} />
                <TextField label="Other party contact" name="other_contact" defaultValue={c?.otherContact} error={err.other_contact} />
              </div>
              <div className="grid grid-cols-3 gap-x-3">
                <TextField label="Claimed (£)" name="amount_claimed" inputMode="decimal" defaultValue={amount(c?.amountClaimed ?? null)} error={err.amount_claimed} spellCheck={false} />
                <TextField label="Excess (£)" name="excess" inputMode="decimal" defaultValue={amount(c?.excess ?? null)} error={err.excess} spellCheck={false} />
                <TextField label="Settled (£)" name="amount_settled" inputMode="decimal" defaultValue={amount(c?.amountSettled ?? null)} error={err.amount_settled} spellCheck={false} />
              </div>

              <h3 className="font-semibold mt-2 mb-2">Linked to</h3>
              <div className="grid sm:grid-cols-2 gap-x-4">
                <RecordSelect label="Vehicle" name="vehicle_id" placeholder="None" defaultValue={vehicleId ? String(vehicleId) : ""} error={err.vehicle_id}
                  options={data.vehicles.map((v) => ({ value: String(v.id), label: [v.reg, v.makeModel].filter(Boolean).join(" ") }))} />
                <RecordSelect label="Vehicle accident" name="accident_id" placeholder="None" defaultValue={accident ? String(accident.id) : ""}
                  options={data.accidents.map((a) => ({ value: String(a.id), label: `${a.reg} · ${a.occurredAt ? niceDateTime(a.occurredAt) : "date not given"}` }))} />
                <RecordSelect label="Equipment" name="asset_id" placeholder="None" defaultValue={assetId ? String(assetId) : ""}
                  options={data.assets.map((a) => ({ value: String(a.id), label: a.assetTag ? `${a.assetTag} ${a.name}` : a.name }))} />
                <TextField label="ServiceM8 job number" name="job_no" defaultValue={c?.jobNo} error={err.job_no} spellCheck={false} inputMode="numeric" />
                <TextField label="Site" name="site" defaultValue={c?.site} error={err.site} />
                <TextField label="Client" name="client" defaultValue={c?.client} error={err.client} />
                <TextField label="Safety incident reference" name="incident_ref" defaultValue={c?.incidentRef} error={err.incident_ref} spellCheck={false} />
              </div>

              <h3 className="font-semibold mt-2 mb-2">Next action</h3>
              <div className="grid sm:grid-cols-3 gap-x-4">
                <div className="sm:col-span-2"><TextField label="Next action" name="next_action" defaultValue={c?.nextAction} error={err.next_action} /></div>
                <TextField label="Due by" name="next_action_due" type="date" defaultValue={c?.nextActionDue ?? ""} error={err.next_action_due} />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={c?.notes} error={err.notes} rows={3} />
              <SaveButton>{c ? "Save" : "Add claim"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {c && (
        <>
          <RecordFiles entityTable="claims" entityId={c.id} title="Claim documents and photos" />
          <DeleteRecord table="claims" id={c.id} label={`Delete ${c.claimNo}`} onSaved={onSaved}
            message={`This deletes claim ${c.claimNo} (${c.claimType}). Its number isn't reused. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

/* ---------- Accreditation ---------- */

export function CertForm({ cert: c, data, today, onSaved }: Common & { cert: CertRow | null }) {
  return (
    <div>
      {c && (
        <div className="grid grid-cols-2 gap-2 mb-4">
          <StatusBox label="Expiry" value={c.expiresOn ? niceDate(c.expiresOn) : ""} note={expiryLabel(c.expiresOn, today)} tone={expiryState(c.expiresOn, today)} />
          <StatusBox label="Annual cost" value={money(c.annualCost)} />
        </div>
      )}
      <GuardedForm action={saveCert} onSaved={(r) => r.data && onSaved(r.data, { kind: "cert", id: r.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {c && <input type="hidden" name="id" value={c.id} />}
              <SelectWithAdd list={CERT_LIST} name="name" label="Accreditation" options={data.certNames} defaultValue={c?.name ?? ""} />
              {err.name && <p className="-mt-3 mb-4 text-sm text-danger">{err.name}</p>}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Organisation" name="issuer" defaultValue={c?.issuer} error={err.issuer} />
                <TextField label="Certificate or member number" name="reference" defaultValue={c?.reference} error={err.reference} spellCheck={false} />
                <TextField label="Grade or level" name="level" defaultValue={c?.level} error={err.level} />
                <TextField label="Annual cost (£)" name="annual_cost" inputMode="decimal" defaultValue={amount(c?.annualCost ?? null)} error={err.annual_cost} spellCheck={false} />
                <TextField label="Issued or joined" name="issued_on" type="date" defaultValue={c?.issuedOn ?? ""} error={err.issued_on} />
                <TextField label="Renews or expires" name="expires_on" type="date" defaultValue={c?.expiresOn ?? ""} error={err.expires_on} hint="Leave blank if it doesn't expire" />
              </div>
              <TextArea label="Account contact and login notes" name="contact_notes" defaultValue={c?.contactNotes} error={err.contact_notes} rows={2}
                placeholder="Who looks after it, the login email. Don't save passwords here." />
              <TextArea label="Notes" name="notes" defaultValue={c?.notes} error={err.notes} rows={3} />
              <SaveButton>{c ? "Save" : "Add accreditation"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {c && (
        <>
          <RecordFiles entityTable="company_certs" entityId={c.id} title="Certificates and documents" />
          <DeleteRecord table="company_certs" id={c.id} label={`Delete ${c.name}`} onSaved={onSaved}
            message={`This deletes the ${c.name} record${c.expiresOn ? ` (expires ${niceDate(c.expiresOn)})` : ""}. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

/* ---------- Delete ---------- */

function DeleteRecord({ table, id, label, message, onSaved }: { table: Deletable; id: number; label: string; message: string; onSaved: Common["onSaved"] }) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="mt-8 border-t border-line pt-5">
      <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">{label}</button>
      <ConfirmDialog
        open={asking}
        title={`${label}?`}
        message={message}
        confirmLabel="Delete"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          const r = await deleteInsuranceRecord(table, id, crypto.randomUUID());
          if (r.ok && r.data) onSaved(r.data as Saved, null);
          return r;
        }}
      />
    </div>
  );
}

