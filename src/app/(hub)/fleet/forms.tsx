"use client";

import { useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CheckboxField, TextArea, TextField } from "@/components/ui/fields";
import { GuardedForm, SaveButton } from "@/components/ui/guarded-form";
import { dueState, niceDate, niceDateTime, relative, ukLocalInput } from "../_registers/dates";
import { RecordFiles } from "../_registers/record-files";
import { Chip, Choice, RecordSelect, StatusBox } from "../_registers/ui";
import { deleteFleetRecord, saveAccident, saveCheck, saveService, saveVehicle } from "./actions";
import type { AccidentRow, CheckRow, FleetData, ServiceRow, VehicleRow } from "./data";
import type { Open } from "./fleet-client";
import { ACCIDENT_STATUSES, CHECK_ITEMS, CHECK_STATUSES, FREQUENCIES, labelOf, milesState } from "./rules";

type Common = { data: FleetData; onOpen: (o: Open | null) => void };
const errorsOf = (state: { ok: boolean; fieldErrors?: Record<string, string> } | null) =>
  (state && !state.ok ? state.fieldErrors ?? {} : {}) as Record<string, string>;

function vehicleOptions(data: FleetData) {
  return data.vehicles.map((v) => ({ value: String(v.id), label: `${v.reg}${v.makeModel ? ` - ${v.makeModel}` : ""}` }));
}

// Names for "checked by" / "driver": everyone active, plus the saved name if they've since left.
function nameOptions(data: FleetData, current: string) {
  const names = data.people.map((p) => p.name);
  if (current && !names.includes(current)) names.push(current);
  return names.map((n) => ({ value: n, label: n }));
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-6 border-t border-line pt-4">
      <div className="flex items-center gap-3 mb-2">
        <h3 className="font-semibold flex-1">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper">
      {children}
    </button>
  );
}

function BackTo({ vehicle, onOpen }: { vehicle: VehicleRow | undefined; onOpen: Common["onOpen"] }) {
  if (!vehicle) return null;
  return (
    <p className="mb-4 text-sm">
      <button type="button" className="text-brand-dark font-semibold underline" onClick={() => onOpen({ kind: "vehicle", id: vehicle.id })}>
        Open vehicle {vehicle.reg}
      </button>
    </p>
  );
}

// "Delete …" with the in-app "are you sure" step.
function DeleteRecord({
  label, message, kind, id, onDeleted,
}: {
  label: string;
  message: string;
  kind: Parameters<typeof deleteFleetRecord>[0];
  id: number;
  onDeleted: (vehicle: VehicleRow | null) => void;
}) {
  const [asking, setAsking] = useState(false);
  return (
    <div className="mt-8 border-t border-line pt-5">
      <button type="button" onClick={() => setAsking(true)} className="px-4 py-2 rounded-lg border border-danger text-danger font-semibold">
        {label}
      </button>
      <ConfirmDialog
        open={asking}
        title={`${label}?`}
        message={message}
        confirmLabel="Delete"
        onClose={() => setAsking(false)}
        onConfirm={async () => {
          const r = await deleteFleetRecord(kind, id, crypto.randomUUID());
          if (r.ok) onDeleted(r.data ?? null);
          return r;
        }}
      />
    </div>
  );
}

/* ---------- Vehicle ---------- */

export function VehicleForm({
  vehicle: v, data, today, onOpen, onSaved, onDeleted,
}: Common & { vehicle: VehicleRow | null; today: string; onSaved: (v: VehicleRow) => void; onDeleted: (id: number) => void }) {
  const checks = v ? data.checks.filter((c) => c.vehicleId === v.id) : [];
  const services = v ? data.services.filter((s) => s.vehicleId === v.id) : [];
  const accidents = v ? data.accidents.filter((a) => a.vehicleId === v.id) : [];
  const people = data.people.map((p) => ({ value: String(p.id), label: p.name }));
  if (v?.assignedToId && !people.some((p) => p.value === String(v.assignedToId))) people.push({ value: String(v.assignedToId), label: v.driver });

  return (
    <div>
      {v && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-5">
          <StatusBox label="Vehicle Tax" value={niceDate(v.vehicleTaxDue)} tone={dueState(v.vehicleTaxDue, today)}
            note={v.vehicleTaxDue ? relative(v.vehicleTaxDue, today) : undefined} />
          <StatusBox label="MOT" value={niceDate(v.motExpiry)} tone={dueState(v.motExpiry, today)}
            note={v.motExpiry ? relative(v.motExpiry, today) : undefined} />
          <StatusBox label="Service" value={niceDate(v.serviceDue)} tone={dueState(v.serviceDue, today)}
            note={v.serviceDue ? relative(v.serviceDue, today) : undefined} />
          <StatusBox label="Service by miles"
            value={v.serviceDueMiles != null ? `${v.serviceDueMiles.toLocaleString("en-GB")} miles` : ""}
            tone={milesState(v.serviceDueMiles, v.latestMiles)}
            note={v.serviceDueMiles != null && v.latestMiles != null ? `${(v.serviceDueMiles - v.latestMiles).toLocaleString("en-GB")} miles left` : undefined} />
          <StatusBox label="Next inspection"
            value={v.inspectionFrequency === "not_required" ? "Not required" : niceDate(v.nextInspectionOn)}
            tone={v.inspectionFrequency === "not_required" ? "none" : dueState(v.nextInspectionOn, today)}
            note={v.inspectionFrequency === "not_required" ? undefined : labelOf(FREQUENCIES, v.inspectionFrequency)} />
          <StatusBox label="Latest mileage" value={v.latestMiles != null ? `${v.latestMiles.toLocaleString("en-GB")} miles` : ""} note="From checks and services" />
        </div>
      )}

      <GuardedForm action={saveVehicle} onSaved={(r) => r.data && onSaved(r.data)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {v && <input type="hidden" name="id" value={v.id} />}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Registration" name="reg" defaultValue={v?.reg} error={err.reg} autoComplete="off" spellCheck={false}
                  hint="Saved in capitals with no spaces" required />
                <TextField label="Make and model" name="make_model" defaultValue={v?.makeModel} error={err.make_model} />
                <TextField label="Year" name="year" inputMode="numeric" defaultValue={v?.year ?? ""} error={err.year} spellCheck={false} />
                <RecordSelect label="Assigned to (driver)" name="assigned_to_id" options={people} defaultValue={v?.assignedToId ? String(v.assignedToId) : ""} placeholder="Nobody" />
                <TextField label="Vehicle Tax due" name="vehicle_tax_due" type="date" defaultValue={v?.vehicleTaxDue ?? ""} error={err.vehicle_tax_due} />
                <TextField label="MOT expires" name="mot_expiry" type="date" defaultValue={v?.motExpiry ?? ""} error={err.mot_expiry} />
                <TextField label="Next service due" name="service_due" type="date" defaultValue={v?.serviceDue ?? ""} error={err.service_due}
                  hint="Logging a service with a next due date updates this" />
                <TextField label="Next inspection due" name="next_inspection_on" type="date" defaultValue={v?.nextInspectionOn ?? ""} error={err.next_inspection_on}
                  hint="Moves on by itself when a check is logged" />
              </div>
              <Choice label="Vehicle inspection frequency" name="inspection_frequency" options={FREQUENCIES} defaultValue={v?.inspectionFrequency ?? "monthly"} />
              <CheckboxField label="Holds equipment and materials (shows as a stock location)" name="holds_stock" defaultChecked={v ? v.holdsStock : true} />
              <TextArea label="Notes" name="notes" defaultValue={v?.notes} error={err.notes} />
              <SaveButton>{v ? "Save" : "Add vehicle"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>

      {v && (
        <>
          <Section title="Vehicle checks" action={<SmallButton onClick={() => onOpen({ kind: "check", id: null, vehicleId: v.id })}>Add check</SmallButton>}>
            <MiniList empty="No checks yet." items={checks.slice(0, 12).map((c) => ({
              key: c.id, onClick: () => onOpen({ kind: "check", id: c.id }),
              title: niceDate(c.checkedOn), sub: [c.checkedBy, c.defects].filter(Boolean).join(" · "),
              chips: <>
                <Chip tone={c.status === "off_road" ? "overdue" : c.status === "defects" ? "soon" : "ok"}>{labelOf(CHECK_STATUSES, c.status)}</Chip>
                {!c.reviewed && <Chip tone="soon">Not reviewed</Chip>}
              </>,
            }))} more={checks.length - 12} />
          </Section>
          <Section title="Service history" action={<SmallButton onClick={() => onOpen({ kind: "service", id: null, vehicleId: v.id })}>Add service</SmallButton>}>
            <MiniList empty="No services logged yet." items={services.map((s) => ({
              key: s.id, onClick: () => onOpen({ kind: "service", id: s.id }),
              title: niceDate(s.servicedOn), sub: [s.workshop, s.workDone].filter(Boolean).join(" · "),
              chips: s.odometer != null ? <Chip>{s.odometer.toLocaleString("en-GB")} miles</Chip> : null,
            }))} />
          </Section>
          <Section title="Accidents" action={<SmallButton onClick={() => onOpen({ kind: "accident", id: null, vehicleId: v.id })}>Add accident</SmallButton>}>
            <MiniList empty="No accidents." items={accidents.map((a) => ({
              key: a.id, onClick: () => onOpen({ kind: "accident", id: a.id }),
              title: a.occurredAt ? niceDateTime(a.occurredAt) : "Date not given", sub: [a.driver, a.description].filter(Boolean).join(" · "),
              chips: <Chip tone={a.status === "closed" ? "ok" : "overdue"}>{labelOf(ACCIDENT_STATUSES, a.status)}</Chip>,
            }))} />
          </Section>
          <RecordFiles entityTable="vehicles" entityId={v.id} title="Documents" />
          <DeleteRecord kind="vehicles" id={v.id} label={`Delete ${v.reg}`} onDeleted={() => onDeleted(v.id)}
            message={`This deletes ${v.reg} and its ${checks.length} check(s), ${services.length} service(s) and ${accidents.length} accident record(s). Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

function MiniList({ items, empty, more = 0 }: { items: { key: number; title: string; sub: string; chips: ReactNode; onClick: () => void }[]; empty: string; more?: number }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <>
      <ul className="divide-y divide-line border border-line rounded-lg">
        {items.map((i) => (
          <li key={i.key}>
            <button type="button" onClick={i.onClick} className="w-full text-left px-3 py-2 hover:bg-paper flex flex-wrap items-center gap-x-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{i.title}</span>
                {i.sub && <span className="block text-xs text-muted truncate">{i.sub}</span>}
              </span>
              <span className="flex gap-1">{i.chips}</span>
            </button>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-1 text-xs text-muted">{more} older check(s) are in the Vehicle checks list.</p>}
    </>
  );
}

/* ---------- Vehicle check ---------- */

export function CheckForm({
  check: c, vehicleId, data, today, onOpen, onSaved, onDeleted,
}: Common & { check: CheckRow | null; vehicleId?: number; today: string; onSaved: (r: CheckRow, v: VehicleRow) => void; onDeleted: (id: number, v: VehicleRow | null) => void }) {
  const vid = c?.vehicleId ?? vehicleId;
  const vehicle = data.vehicles.find((v) => v.id === vid);
  return (
    <div>
      <BackTo vehicle={vehicle} onOpen={onOpen} />
      {c?.source === "team" && <p className="mb-4 text-sm text-muted">Sent from the team app.</p>}
      <GuardedForm action={saveCheck} onSaved={(r) => r.data && onSaved(r.data.row, r.data.vehicle)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {c && <input type="hidden" name="id" value={c.id} />}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <RecordSelect label="Vehicle" name="vehicle_id" options={vehicleOptions(data)} defaultValue={vid ? String(vid) : ""} error={err.vehicle_id} />
                <TextField label="Date of check" name="checked_on" type="date" defaultValue={c?.checkedOn ?? today} error={err.checked_on} />
                <RecordSelect label="Checked by" name="checked_by" options={nameOptions(data, c?.checkedBy ?? "")} defaultValue={c?.checkedBy ?? ""} />
                <TextField label="Odometer (miles)" name="odometer" inputMode="numeric" defaultValue={c?.odometer ?? ""} error={err.odometer} spellCheck={false} />
              </div>
              <fieldset className="mb-4">
                <legend className="block text-sm font-medium mb-1">Checklist</legend>
                <ul className="divide-y divide-line border border-line rounded-lg">
                  {CHECK_ITEMS.map((i) => (
                    <li key={i.key} className="flex items-center gap-3 px-3 py-2">
                      <span className="flex-1 text-sm">{i.label}</span>
                      <OkFault name={i.key} ok={c ? c.items[i.key] !== false : true} />
                    </li>
                  ))}
                </ul>
              </fieldset>
              <TextArea label="Faults or notes" name="defects" defaultValue={c?.defects} error={err.defects} rows={3} />
              <TextArea label="Action taken" name="action" defaultValue={c?.action} error={err.action} rows={3} />
              <Choice label="Status" name="status" options={CHECK_STATUSES} defaultValue={c?.status ?? "passed"} />
              <CheckboxField label="Reviewed by the office" name="reviewed" defaultChecked={c ? c.reviewed : true} />
              <SaveButton>{c ? "Save" : "Add check"}</SaveButton>
              {!c && vehicle && vehicle.inspectionFrequency !== "not_required" && (
                <p className="mt-2 text-xs text-muted">Saving moves {vehicle.reg}&apos;s next inspection date on if this check counts for it.</p>
              )}
            </>
          );
        }}
      </GuardedForm>
      {c && (
        <>
          <RecordFiles entityTable="vehicle_checks" entityId={c.id} title="Photos and files" />
          <DeleteRecord kind="vehicle_checks" id={c.id} label="Delete this check" onDeleted={(v) => onDeleted(c.id, v)}
            message={`This deletes the ${niceDate(c.checkedOn)} check on ${vehicle?.reg ?? "this vehicle"}. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

function OkFault({ name, ok: initial }: { name: string; ok: boolean }) {
  const [ok, setOk] = useState(initial);
  const btn = (on: boolean, good: boolean) =>
    `rounded-md border px-3 py-1 text-sm font-semibold ${on ? (good ? "bg-ok border-ok text-white" : "bg-danger border-danger text-white") : "bg-white border-line"}`;
  return (
    <span className="flex gap-1.5" role="radiogroup" aria-label={name}>
      <input type="hidden" name={name} value={ok ? "ok" : "fault"} />
      <button type="button" role="radio" aria-checked={ok} className={btn(ok, true)} onClick={(e) => { setOk(true); e.currentTarget.form?.dispatchEvent(new Event("change", { bubbles: true })); }}>OK</button>
      <button type="button" role="radio" aria-checked={!ok} className={btn(!ok, false)} onClick={(e) => { setOk(false); e.currentTarget.form?.dispatchEvent(new Event("change", { bubbles: true })); }}>Fault</button>
    </span>
  );
}

/* ---------- Service ---------- */

export function ServiceForm({
  service: s, vehicleId, data, today, onOpen, onSaved, onDeleted,
}: Common & { service: ServiceRow | null; vehicleId?: number; today: string; onSaved: (r: ServiceRow, v: VehicleRow) => void; onDeleted: (id: number, v: VehicleRow | null) => void }) {
  const vid = s?.vehicleId ?? vehicleId;
  const vehicle = data.vehicles.find((v) => v.id === vid);
  return (
    <div>
      <BackTo vehicle={vehicle} onOpen={onOpen} />
      <GuardedForm action={saveService} onSaved={(r) => r.data && onSaved(r.data.row, r.data.vehicle)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {s && <input type="hidden" name="id" value={s.id} />}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <RecordSelect label="Vehicle" name="vehicle_id" options={vehicleOptions(data)} defaultValue={vid ? String(vid) : ""} error={err.vehicle_id} />
                <TextField label="Date of service" name="serviced_on" type="date" defaultValue={s?.servicedOn ?? today} error={err.serviced_on} />
                <TextField label="Workshop" name="workshop" defaultValue={s?.workshop} error={err.workshop} />
                <TextField label="Odometer (miles)" name="odometer" inputMode="numeric" defaultValue={s?.odometer ?? ""} error={err.odometer} spellCheck={false} />
                <TextField label="Cost (£)" name="cost" inputMode="decimal" defaultValue={s?.cost ?? ""} error={err.cost} spellCheck={false} />
              </div>
              <TextArea label="Work done" name="work_done" defaultValue={s?.workDone} error={err.work_done} rows={3} />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Next service due (date)" name="next_due" type="date" defaultValue={s?.nextDue ?? ""} error={err.next_due}
                  hint="Updates the vehicle's next service date" />
                <TextField label="Next service due (miles)" name="next_due_miles" inputMode="numeric" defaultValue={s?.nextDueMiles ?? ""} error={err.next_due_miles} spellCheck={false} />
              </div>
              <TextArea label="Notes" name="notes" defaultValue={s?.notes} error={err.notes} rows={3} />
              <SaveButton>{s ? "Save" : "Add service"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {s && (
        <>
          <RecordFiles entityTable="vehicle_services" entityId={s.id} title="Receipt and files" />
          <DeleteRecord kind="vehicle_services" id={s.id} label="Delete this service" onDeleted={(v) => onDeleted(s.id, v)}
            message={`This deletes the ${niceDate(s.servicedOn)} service on ${vehicle?.reg ?? "this vehicle"}. The vehicle's next service date is not changed. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}

/* ---------- Accident ---------- */

export function AccidentForm({
  accident: a, vehicleId, data, onOpen, onSaved, onDeleted,
}: Common & { accident: AccidentRow | null; vehicleId?: number; onSaved: (r: AccidentRow, v: VehicleRow) => void; onDeleted: (id: number, v: VehicleRow | null) => void }) {
  const vid = a?.vehicleId ?? vehicleId;
  const vehicle = data.vehicles.find((v) => v.id === vid);
  const [now] = useState(() => ukLocalInput(new Date().toISOString()));
  return (
    <div>
      <BackTo vehicle={vehicle} onOpen={onOpen} />
      {a?.source === "team" && <p className="mb-4 text-sm text-muted">Sent from the team app.</p>}
      <GuardedForm action={saveAccident} onSaved={(r) => r.data && onSaved(r.data.row, r.data.vehicle)}>
        {(state) => {
          const err = errorsOf(state);
          return (
            <>
              {a && <input type="hidden" name="id" value={a.id} />}
              <div className="grid sm:grid-cols-2 gap-x-4">
                <RecordSelect label="Vehicle" name="vehicle_id" options={vehicleOptions(data)} defaultValue={vid ? String(vid) : ""} error={err.vehicle_id} />
                <TextField label="When" name="occurred_at" type="datetime-local" defaultValue={a ? ukLocalInput(a.occurredAt) : now} error={err.occurred_at} />
                <RecordSelect label="Driver" name="driver" options={nameOptions(data, a?.driver ?? "")} defaultValue={a?.driver ?? vehicle?.driver ?? ""} />
                <TextField label="Where" name="location" defaultValue={a?.location} error={err.location} />
              </div>
              <TextArea label="What happened" name="description" defaultValue={a?.description} error={err.description} rows={3} />
              <TextArea label="Damage to our vehicle" name="damage" defaultValue={a?.damage} error={err.damage} rows={2} />
              <TextArea label="Anyone hurt?" name="injuries" defaultValue={a?.injuries} error={err.injuries} rows={2} placeholder="If nobody was hurt, write none" />
              <div className="grid sm:grid-cols-2 gap-x-4">
                <TextField label="Other party name and phone" name="third_party" defaultValue={a?.thirdParty} error={err.third_party} />
                <TextField label="Other party reg" name="third_party_reg" defaultValue={a?.thirdPartyReg} error={err.third_party_reg} spellCheck={false} />
                <TextField label="Other party insurer" name="third_party_insurer" defaultValue={a?.thirdPartyInsurer} error={err.third_party_insurer} />
                <TextField label="Police event number (if any)" name="police_event_no" defaultValue={a?.policeEventNo} error={err.police_event_no} spellCheck={false} />
              </div>
              <Choice label="Status" name="status" options={ACCIDENT_STATUSES} defaultValue={a?.status ?? "reported"} />
              <TextArea label="Notes" name="notes" defaultValue={a?.notes} error={err.notes} rows={3} />
              <SaveButton>{a ? "Save" : "Add accident"}</SaveButton>
            </>
          );
        }}
      </GuardedForm>
      {a && (
        <>
          <RecordFiles entityTable="vehicle_accidents" entityId={a.id} title="Photos and files" />
          <DeleteRecord kind="vehicle_accidents" id={a.id} label="Delete this accident" onDeleted={(v) => onDeleted(a.id, v)}
            message={`This deletes the accident record for ${vehicle?.reg ?? "this vehicle"}. Files stay in SharePoint. It cannot be undone.`} />
        </>
      )}
    </div>
  );
}
