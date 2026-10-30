"use client";

import { useState } from "react";
import { TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { SelectWithAdd } from "@/components/ui/select-with-add";
import { dueState, niceDate, niceDateTime, relative, ukLocalInput } from "../_registers/dates";
import { RecordFiles } from "../_registers/record-files";
import { LinkedClaims } from "../insurance/linked-claims";
import { Chip, Choice, RecordSelect, StatusBox } from "../_registers/ui";
import { confirmToolReport, returnToService, saveAsset, saveAssetService, saveMaterial, saveToolReport } from "./actions";
import type { AssetRow, AssetServiceRow, EquipmentData, MaterialRow, ToolReportRow } from "./data";
import { DeleteRecord, errorsOf, History, LocationSelect, MiniList, Section, SmallButton } from "./parts";
import {
  ASSET_CATEGORY_LIST, ASSET_STATUSES, isLow, labelOf, locKey, locLabel, MATERIAL_CATEGORY_LIST, MATERIAL_STATUSES, qty,
  REPORT_KINDS, REPORT_STATUSES, TOOL_KINDS, TOOL_WANTS, UNIT_LIST,
} from "./rules";
import { AdjustStock } from "./stock-forms";
import type { Common } from "./types";

export const assetTone = (s: AssetRow["status"]) => (s === "in_service" ? "ok" : s === "retired" ? "none" : s === "out_for_service" ? "soon" : "overdue");
export const assetTitle = (a: AssetRow) => (a.assetTag ? `${a.assetTag} · ${a.name}` : a.name);
export const placeOf = (a: { place: string | null; vehicleId: number | null; personId?: number | null }, data: EquipmentData) =>
  locLabel(a, data.vehicles, data.people);

/* ---------- Equipment ---------- */

export function AssetForm({ asset: a, data, today, onOpen, onSaved }: Common & { asset: AssetRow | null }) {
  const services = a ? data.services.filter((s) => s.assetId === a.id) : [];
  const reports = a ? data.reports.filter((r) => r.assetId === a.id) : [];
  const [back, setBack] = useState(false);
  return (
    <div>
      {a && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          <StatusBox label="Status" value={labelOf(ASSET_STATUSES, a.status)} tone={assetTone(a.status)} />
          <StatusBox label="Where" value={placeOf(a, data)} />
          <StatusBox label="Next service" value={niceDate(a.nextServiceOn)} tone={dueState(a.nextServiceOn, today)}
            note={a.nextServiceOn ? relative(a.nextServiceOn, today) : undefined} />
          <StatusBox label="PAT test due" value={niceDate(a.testTagDue)} tone={dueState(a.testTagDue, today)}
            note={a.testTagDue ? relative(a.testTagDue, today) : undefined} />
        </div>
      )}
      {a?.onJob && (
        <p className="mb-5 rounded-lg border border-line bg-paper p-3 text-sm" data-testid="asset-on-job">
          Out on <a href={`/jobs/${a.onJob.jobNo}/plant`} className="font-semibold text-brand underline">job {a.onJob.jobNo}</a>
          {a.onJob.outWith ? `, with ${a.onJob.outWith}` : ""}{a.onJob.dueBack ? `, due back ${niceDate(a.onJob.dueBack)}` : ""}.
          {" "}Return it from the job&apos;s Plant page.
        </p>
      )}
      {a && (a.status === "lost" || a.status === "needs_repair" || a.status === "out_for_service") && (
        <div className="mb-5 rounded-lg border border-line bg-paper p-3">
          {!back ? (
            <SmallButton onClick={() => setBack(true)}>{a.status === "lost" ? "Mark as found" : "Mark back in service"}</SmallButton>
          ) : (
            <GuardedForm action={returnToService} onSaved={(r) => r.data && onSaved(r.data, { kind: "asset", id: a.id })}>
              <input type="hidden" name="id" value={a.id} />
              <LocationSelect data={data} name="location" label="Where is it now?" allowPerson defaultValue={locKey(a)} />
              <TextField label="Note (optional)" name="notes" placeholder="e.g. found in the back of the van" />
              <SaveButton>{a.status === "lost" ? "Mark as found" : "Mark back in service"}</SaveButton>
            </GuardedForm>
          )}
        </div>
      )}

      <GuardedForm action={saveAsset} onSaved={(r) => r.data && onSaved(r.data, { kind: "asset", id: r.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {a && <input type="hidden" name="id" value={a.id} />}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Name" name="name" defaultValue={a?.name} error={err.name} required />
                <TextField label="Asset tag" name="asset_tag" defaultValue={a?.assetTag} error={err.asset_tag} spellCheck={false} placeholder="e.g. CBS1024" />
                <SelectWithAdd list={ASSET_CATEGORY_LIST} name="category" label="Category" options={data.assetCategories} defaultValue={a?.category ?? ""} />
                <TextField label="Make and model" name="make_model" defaultValue={a?.makeModel} error={err.make_model} />
                <TextField label="Serial number" name="serial_no" defaultValue={a?.serialNo} spellCheck={false} />
                <TextField label="Purchased" name="purchased_on" type="date" defaultValue={a?.purchasedOn ?? ""} error={err.purchased_on} />
              </div>
              <LocationSelect data={data} name="location" label="Where it is kept" allowPerson allowNone defaultValue={a ? locKey(a) : ""} error={err.location} />
              <Choice label="Status" name="status" options={ASSET_STATUSES} defaultValue={a?.status ?? "in_service"} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Service every (months)" name="service_interval_months" inputMode="numeric" defaultValue={a?.serviceIntervalMonths ?? ""}
                  error={err.service_interval_months} spellCheck={false} hint="Leave blank if it isn't serviced" />
                <TextField label="Last service" name="last_service_on" type="date" defaultValue={a?.lastServiceOn ?? ""} error={err.last_service_on} />
                <TextField label="Next service due" name="next_service_on" type="date" defaultValue={a?.nextServiceOn ?? ""} error={err.next_service_on}
                  hint="Logging a service updates this" />
                <TextField label="PAT test due" name="test_tag_due" type="date" defaultValue={a?.testTagDue ?? ""} error={err.test_tag_due} />
                <TextField label="Vibration (m/s²)" name="hav_magnitude" inputMode="decimal" defaultValue={a?.havMagnitude ?? ""} error={err.hav_magnitude} spellCheck={false} />
                <TextField label="Vibration trigger (minutes a day)" name="hav_trigger_mins" inputMode="numeric" defaultValue={a?.havTriggerMins ?? ""} error={err.hav_trigger_mins} spellCheck={false} />
                <TextField label="Vibration reference" name="hav_ref" defaultValue={a?.havRef} />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={a?.notes} error={err.notes} />
              <SaveButton>{a ? "Save" : "Add equipment"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>

      {a && (
        <>
          <Section title="Service history" action={<SmallButton onClick={() => onOpen({ kind: "service", id: null, assetId: a.id })}>Add service</SmallButton>}>
            <MiniList empty="No services logged yet." items={services.map((s) => ({
              key: s.id, onClick: () => onOpen({ kind: "service", id: s.id }), title: niceDate(s.servicedOn),
              sub: [s.servicedBy, s.workDone].filter(Boolean).join(" · "), chips: s.nextDue ? <Chip>Next due {niceDate(s.nextDue)}</Chip> : null,
            }))} />
          </Section>
          <Section title="Tool reports" action={<SmallButton onClick={() => onOpen({ kind: "report", id: null, assetId: a.id })}>Add tool report</SmallButton>}>
            <MiniList empty="No reports." items={reports.map((r) => ({
              key: r.id, onClick: () => onOpen({ kind: "report", id: r.id }),
              title: `${labelOf(REPORT_KINDS, r.kind)} · ${niceDateTime(r.occurredAt ?? r.createdAt)}`, sub: [r.reportedBy, r.details].filter(Boolean).join(" · "),
              chips: <Chip tone={r.status === "closed" ? "ok" : "overdue"}>{labelOf(REPORT_STATUSES, r.status)}</Chip>,
            }))} />
          </Section>
          <History kind="asset" id={a.id} />
          <LinkedClaims kind="asset" id={a.id} />
          <RecordFiles entityTable="assets" entityId={a.id} title="Documents and photos" />
          <DeleteRecord kind="assets" id={a.id} label={`Delete ${a.name}`} onDeleted={(s) => onSaved(s, null)}
            message={`This deletes ${assetTitle(a)}, its ${services.length} service(s) and its history. Tool reports stay. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

/* ---------- Equipment service ---------- */

export function ServiceForm({ service: s, assetId, data, onOpen, onSaved }: Common & { service: AssetServiceRow | null; assetId?: number }) {
  const asset = data.assets.find((a) => a.id === (s?.assetId ?? assetId));
  return (
    <div>
      {asset && (
        <p className="mb-4 text-sm">
          <button type="button" className="text-brand-dark font-semibold underline" onClick={() => onOpen({ kind: "asset", id: asset.id })}>Open {assetTitle(asset)}</button>
        </p>
      )}
      <GuardedForm action={saveAssetService} onSaved={(r) => r.data && onSaved(r.data, { kind: "service", id: r.data.id })}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {s && <input type="hidden" name="id" value={s.id} />}
              <RecordSelect label="Equipment" name="asset_id" error={err.asset_id} defaultValue={asset ? String(asset.id) : ""}
                options={data.assets.map((a) => ({ value: String(a.id), label: assetTitle(a) }))} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Date of service" name="serviced_on" type="date" defaultValue={s?.servicedOn ?? ""} error={err.serviced_on} />
                <TextField label="Serviced by" name="serviced_by" defaultValue={s?.servicedBy} />
                <TextField label="Cost (£)" name="cost" inputMode="decimal" defaultValue={s?.cost ?? ""} error={err.cost} spellCheck={false} />
                <TextField label="Next service due" name="next_due" type="date" defaultValue={s?.nextDue ?? ""} error={err.next_due}
                  hint="Blank: worked out from the service interval" />
              </div>
              <TextArea label="Work done" name="work_done" defaultValue={s?.workDone} error={err.work_done} />
              <TextArea label="Notes" name="notes" defaultValue={s?.notes} rows={2} />
              <SaveButton>{s ? "Save" : "Add service"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {s && (
        <>
          <RecordFiles entityTable="asset_services" entityId={s.id} title="Receipt and files" />
          <DeleteRecord kind="asset_services" id={s.id} label="Delete this service" onDeleted={(x) => onSaved(x, asset ? { kind: "asset", id: asset.id } : null)}
            message="This deletes the service record. The equipment's service dates stay as they are. It cannot be undone." />
        </>
      )}
    </div>
  );
}

/* ---------- Materials ---------- */

export function MaterialForm({ material: m, data, today, me, onOpen, onSaved }: Common & { material: MaterialRow | null }) {
  return (
    <div>
      {m && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
            <StatusBox label="In stock" value={`${qty(m.total)} ${m.unit}`} tone={isLow(m.total, m.minLevel) ? (m.total <= 0 ? "overdue" : "soon") : "none"}
              note={m.minLevel != null ? `Minimum ${qty(m.minLevel)}` : undefined} />
            <StatusBox label="Last counted" value={niceDate(m.lastCountedOn)} note={m.lastCountedBy || undefined} />
            <StatusBox label="Status" value={labelOf(MATERIAL_STATUSES, m.status)} />
          </div>
          <Section title="Stock by location" action={<SmallButton onClick={() => onOpen({ kind: "move" })}>Move stock</SmallButton>}>
            <MiniList empty="None in stock anywhere." items={m.stock.map((s) => ({
              key: locKey(s), title: placeOf(s, data), chips: <Chip>{qty(s.qty)} {m.unit}</Chip>,
            }))} />
            <AdjustStock material={m} data={data} today={today} me={me} onOpen={onOpen} onSaved={onSaved} />
          </Section>
        </>
      )}

      <div className={m ? "mt-6 border-t border-line pt-4" : ""}>
        {m && <h3 className="font-semibold mb-2">Details</h3>}
        <GuardedForm action={saveMaterial} onSaved={(r) => r.data && onSaved(r.data, { kind: "material", id: r.data.id })}>
          {(state) => {
            const err = errorsOf(state);
            return (
              <>
                {m && <input type="hidden" name="id" value={m.id} />}
                <div className="grid sm:grid-cols-2 gap-x-4">
                  <TextField label="Name" name="name" defaultValue={m?.name} error={err.name} required />
                  <SelectWithAdd list={MATERIAL_CATEGORY_LIST} name="category" label="Category" options={data.materialCategories} defaultValue={m?.category ?? ""} />
                  <SelectWithAdd list={UNIT_LIST} name="unit" label="Unit" options={data.units} defaultValue={m?.unit ?? "each"} />
                  <RecordSelect label="Supplier" name="supplier_id" placeholder="None" defaultValue={m?.supplierId ? String(m.supplierId) : ""}
                    options={data.suppliers.map((x) => ({ value: String(x.id), label: x.name }))} />
                  <TextField label="Supplier code" name="supplier_code" defaultValue={m?.supplierCode} spellCheck={false} />
                  <div>
                    <RecordSelect label="CoSHH substance" name="sds_substance_id" placeholder="None" defaultValue={m?.sdsSubstanceId ? String(m.sdsSubstanceId) : ""}
                      options={data.substances.map((x) => ({ value: String(x.id), label: x.label }))} />
                    {m?.sdsSubstanceId ? (
                      <a href={`/safety/coshh?open=${m.sdsSubstanceId}`} className="-mt-3 mb-4 block text-sm text-brand underline">Open CoSHH assessment</a>
                    ) : (
                      <p className="-mt-3 mb-4 text-xs text-muted">Substances are added on Hazards and CoSHH.</p>
                    )}
                  </div>
                  <TextField label="Cost each (£)" name="cost" inputMode="decimal" defaultValue={m?.cost ?? ""} error={err.cost} spellCheck={false} />
                  <TextField label="Minimum level" name="min_level" inputMode="decimal" defaultValue={m?.minLevel ?? ""} error={err.min_level} spellCheck={false}
                    hint="Shows as low stock at or below this (all locations together)" />
                  <TextField label="Reorder quantity" name="reorder_qty" inputMode="decimal" defaultValue={m?.reorderQty ?? ""} error={err.reorder_qty} spellCheck={false} />
                </div>
                {!m && (
                  <div className="grid sm:grid-cols-2 gap-x-4">
                    <TextField label="Opening stock (optional)" name="opening_qty" inputMode="decimal" error={err.opening_qty} spellCheck={false} />
                    <LocationSelect data={data} name="opening_location" label="Opening stock is at" error={err.opening_location} />
                  </div>
                )}
                {m && <Choice label="Status" name="status" options={MATERIAL_STATUSES} defaultValue={m.status} />}
                <TextArea label="Notes" name="notes" defaultValue={m?.notes} error={err.notes} rows={3} />
                <SaveButton>{m ? "Save" : "Add material"}</SaveButton>
              </>
            );
          }}
        </GuardedForm>
      </div>

      {m && (
        <>
          <History kind="material" id={m.id} unit={m.unit} />
          <RecordFiles entityTable="materials" entityId={m.id} title="Data sheets and files" />
          <DeleteRecord kind="materials" id={m.id} label={`Delete ${m.name}`} onDeleted={(s) => onSaved(s, null)}
            message={`This deletes ${m.name}, its stock at every location and its stock history. To keep the history, set it to Discontinued instead. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

/* ---------- Tool reports ---------- */

export function ToolReportForm({ report: r, assetId, data, me, onOpen, onSaved }: Common & { report: ToolReportRow | null; assetId?: number }) {
  if (r) return <ToolReportView report={r} data={data} onOpen={onOpen} onSaved={onSaved} />;
  return <NewToolReport assetId={assetId} data={data} me={me} onSaved={onSaved} />;
}

function NewToolReport({ assetId, data, me, onSaved }: Pick<Common, "data" | "me" | "onSaved"> & { assetId?: number }) {
  const [kind, setKind] = useState("lost");
  const [tool, setTool] = useState(assetId ? String(assetId) : "");
  const [wants, setWants] = useState("none");
  const meId = data.people.find((p) => p.name === me)?.id;
  const tools = data.assets.filter((a) => (a.status !== "lost" && a.status !== "retired") || a.id === assetId);
  return (
    <GuardedForm action={saveToolReport} onSaved={(x) => x.data && onSaved(x.data, { kind: "report", id: x.data.id })}>
      {(state) => {
        const err = errorsOf(state);
        return (
          <>
            <RecordSelect label="Reported by" name="reported_by_id" error={err.reported_by_id} defaultValue={meId ? String(meId) : ""}
              options={data.people.map((p) => ({ value: String(p.id), label: p.name }))} />
            <Choice label="What happened" name="kind" options={TOOL_KINDS} defaultValue="lost" onChange={setKind} />
            <div className="mb-4">
              <label htmlFor="tool-pick" className="block text-sm font-medium mb-1">Which tool</label>
              <select id="tool-pick" name="asset_id" value={tool} onChange={(e) => setTool(e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2">
                <option value="">Not on the list</option>
                {tools.map((a) => <option key={a.id} value={a.id}>{assetTitle(a)}{a.serialNo ? ` (S/N ${a.serialNo})` : ""}</option>)}
              </select>
            </div>
            {!tool && <TextField label="Tool name" name="tool_name" error={err.tool_name} placeholder="e.g. Makita grinder" />}
            <div className="grid sm:grid-cols-2 gap-x-4">
              <TextField label="When" name="occurred_at" type="datetime-local" defaultValue={ukLocalInput(new Date().toISOString())} error={err.occurred_at} />
              <TextField label="Where" name="location" placeholder="Site address, van or location" />
            </div>
            {kind === "stolen" && <TextField label="Police reference (if reported)" name="police_ref" spellCheck={false} />}
            <TextArea label="What happened / details" name="details" rows={3} />
            <Choice label="Replace or repair it?" name="wants" options={TOOL_WANTS} defaultValue="none" onChange={setWants} />
            {wants === "repair" && <TextArea label="What needs repairing" name="repair_notes" rows={2} />}
            {wants !== "none" && (
              <>
                {kind !== "stolen" ? (
                  <Choice label="How urgent" name="urgency" defaultValue="this_week"
                    options={[{ value: "today", label: "Today" }, { value: "this_week", label: "This week" }, { value: "no_rush", label: "No rush" }]} />
                ) : (
                  <p className="mb-4 text-sm text-muted">A stolen tool is always requested for today.</p>
                )}
                <TextArea label="Anything else about it (optional)" name="replace_notes" rows={2} placeholder="e.g. same model, or a bigger size" />
              </>
            )}
            <p className="mb-4 text-sm text-muted">
              {tool ? `Saving marks the tool as ${kind === "damaged" ? "Needs repair" : "Lost"}. ` : ""}
              {wants !== "none" ? "A Team request is raised for the office." : ""}
            </p>
            <SaveButton>Add tool report</SaveButton>
          </>
        );
      }}
    </GuardedForm>
  );
}

function ToolReportView({ report: r, data, onOpen, onSaved }: Pick<Common, "data" | "onOpen" | "onSaved"> & { report: ToolReportRow }) {
  const asset = data.assets.find((a) => a.id === r.assetId);
  const rows: [string, string][] = [
    ["What happened", labelOf(REPORT_KINDS, r.kind)],
    ["Tool", r.toolName],
    ["When", niceDateTime(r.occurredAt)],
    ["Where", r.location],
    ["Police reference", r.policeRef],
    ["Details", r.details],
    ["Replace or repair", labelOf(TOOL_WANTS, r.wants)],
    ["What needs repairing", r.repairNotes],
    ["Other notes", r.replaceNotes],
    ["Reported by", `${r.reportedBy}${r.source === "team" ? " (team app)" : r.source === "yard" ? " (yard)" : ""}, ${niceDateTime(r.createdAt)}`],
  ];
  return (
    <div>
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        {rows.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-muted">{k}</dt><dd className="whitespace-pre-line">{v}</dd></div>
        ))}
      </dl>
      <p className="mb-4 flex flex-wrap gap-3 text-sm">
        {asset && <button type="button" className="text-brand-dark font-semibold underline" onClick={() => onOpen({ kind: "asset", id: asset.id })}>Open {assetTitle(asset)} ({labelOf(ASSET_STATUSES, asset.status)})</button>}
        {r.requestId && <a className="text-brand-dark font-semibold underline" href={`/requests?request=${r.requestId}`}>Open the Team request</a>}
      </p>
      {r.pendingStatus && asset && <ConfirmStatus report={r} asset={asset} onSaved={onSaved} />}
      {r.statusConfirmedBy && <p className="mb-4 text-sm text-muted">Equipment updated: confirmed by {r.statusConfirmedBy}, {niceDateTime(r.statusConfirmedAt)}.</p>}
      {r.closedAt && <p className="mb-4 text-sm text-muted">Closed {niceDateTime(r.closedAt)} by {r.closedBy}.</p>}
      <GuardedForm action={saveToolReport} onSaved={(x) => x.data && onSaved(x.data, { kind: "report", id: r.id })}>
        <input type="hidden" name="id" value={r.id} />
        <Choice label="Status" name="status" options={REPORT_STATUSES} defaultValue={r.status} />
        <TextArea label="Office notes" name="office_notes" defaultValue={r.officeNotes} rows={3} />
        <SaveButton>Save</SaveButton>
      </GuardedForm>
      <RecordFiles entityTable="tool_reports" entityId={r.id} title="Photos and files" />
      <DeleteRecord kind="tool_reports" id={r.id} label="Delete this tool report" onDeleted={(s) => onSaved(s, null)}
        message="This deletes the report. The tool's status and any Team request stay as they are. Files stay in SharePoint. It cannot be undone." />
    </div>
  );
}


// A yard report proposes a status; nothing changes on the equipment until the office confirms it.
function ConfirmStatus({ report: r, asset, onSaved }: { report: ToolReportRow; asset: AssetRow; onSaved: Common["onSaved"] }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const to = labelOf(ASSET_STATUSES, r.pendingStatus!);
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const x = await confirmToolReport(r.id, crypto.randomUUID());
      if (x.ok && x.data) onSaved(x.data, { kind: "report", id: r.id });
      else if (!x.ok) setMsg(x.message);
    } catch {
      setMsg("It wasn't saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm" data-testid="confirm-status">
      <p className="mb-2">
        The yard reported {assetTitle(asset)} as <strong>{labelOf(REPORT_KINDS, r.kind).toLowerCase()}</strong>. It is still {labelOf(ASSET_STATUSES, asset.status)} until
        you confirm{r.pendingPlace ? `; confirming also puts it at ${r.pendingPlace}` : ""}.
      </p>
      <button type="button" disabled={busy} onClick={confirm} className="px-3 py-1.5 rounded-lg bg-dark text-white font-semibold disabled:opacity-50">
        {busy ? "Saving…" : `Confirm: mark ${to}`}
      </button>
      {msg && <p role="alert" className="mt-2 text-danger">{msg}</p>}
    </div>
  );
}
