"use client";

import { useMemo, useState } from "react";
import { Drawer, Modal } from "@/components/ui/overlay";
import { DocViewer, type ViewableFile } from "@/components/ui/doc-viewer";
import { SearchBox } from "@/components/ui/search-box";
import { dueState, niceDate, niceDateTime } from "../_registers/dates";
import { Chip } from "../_registers/ui";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { FilterPills, FilterRow } from "@/components/ui/register";
import type { AccidentRow, CheckRow, FleetData, ServiceRow, VehicleRow } from "./data";
import { AccidentForm, CheckForm, ServiceForm, VehicleForm } from "./forms";
import { ACCIDENT_STATUSES, CHECK_STATUSES, fleetDueItems, FREQUENCIES, labelOf, milesState, worst } from "./rules";

type View = "vehicles" | "checks" | "services" | "accidents";
export type Open =
  | { kind: "vehicle"; id: number | null }
  | { kind: "check"; id: number | null; vehicleId?: number }
  | { kind: "service"; id: number | null; vehicleId?: number }
  | { kind: "accident"; id: number | null; vehicleId?: number };

function upsert<T extends { id: number }>(list: T[], row: T): T[] {
  return list.some((r) => r.id === row.id) ? list.map((r) => (r.id === row.id ? row : r)) : [row, ...list];
}

function matches(q: string, ...fields: (string | number | null | undefined)[]): boolean {
  return !q || fields.some((f) => f != null && String(f).toLowerCase().includes(q));
}

export function FleetClient({ initial, today, openVehicleId }: { initial: FleetData; today: string; openVehicleId: number | null }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("vehicles");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Open | null>(() =>
    openVehicleId && initial.vehicles.some((v) => v.id === openVehicleId) ? { kind: "vehicle", id: openVehicleId } : null,
  );

  const regOf = useMemo(() => new Map(data.vehicles.map((v) => [v.id, v.reg])), [data.vehicles]);
  const q = query.trim().toLowerCase();
  const due = useMemo(() => fleetDueItems(data.vehicles, data.checks, data.accidents, today), [data, today]);
  const attention: AttentionItem[] = due.map((it, i) => ({
    key: `${i}-${it.vehicleId}-${it.what}`,
    level: it.tone === "overdue" ? "overdue" : "soon",
    tag: it.what,
    name: it.reg,
    detail: it.detail,
    onOpen: () => setOpen(it.open ?? { kind: "vehicle", id: it.vehicleId }),
  }));
  const [reportOpen, setReportOpen] = useState(false);
  const [report, setReport] = useState<ViewableFile | null>(null);

  // Saves hand back the record and its vehicle as it now is (dates may have moved on).
  const saved = {
    vehicle(v: VehicleRow) {
      setData((d) => ({ ...d, vehicles: upsert(d.vehicles, v).sort((a, b) => a.reg.localeCompare(b.reg)) }));
      setOpen({ kind: "vehicle", id: v.id });
    },
    check(r: CheckRow, v: VehicleRow) {
      setData((d) => ({ ...d, checks: upsert(d.checks, r), vehicles: upsert(d.vehicles, v) }));
      setOpen({ kind: "check", id: r.id });
    },
    service(r: ServiceRow, v: VehicleRow) {
      setData((d) => ({ ...d, services: upsert(d.services, r), vehicles: upsert(d.vehicles, v) }));
      setOpen({ kind: "service", id: r.id });
    },
    accident(r: AccidentRow, v: VehicleRow) {
      setData((d) => ({ ...d, accidents: upsert(d.accidents, r), vehicles: upsert(d.vehicles, v) }));
      setOpen({ kind: "accident", id: r.id });
    },
  };

  function deleted(kind: Open["kind"], id: number, vehicle: VehicleRow | null) {
    setData((d) => {
      const next = { ...d };
      if (kind === "vehicle") {
        next.vehicles = d.vehicles.filter((v) => v.id !== id);
        next.checks = d.checks.filter((r) => r.vehicleId !== id);
        next.services = d.services.filter((r) => r.vehicleId !== id);
        next.accidents = d.accidents.filter((r) => r.vehicleId !== id);
      }
      if (kind === "check") next.checks = d.checks.filter((r) => r.id !== id);
      if (kind === "service") next.services = d.services.filter((r) => r.id !== id);
      if (kind === "accident") next.accidents = d.accidents.filter((r) => r.id !== id);
      if (vehicle) next.vehicles = upsert(next.vehicles, vehicle);
      return next;
    });
    setOpen(vehicle ? { kind: "vehicle", id: vehicle.id } : null);
  }

  const vehicles = data.vehicles.filter((v) => matches(q, v.reg, v.makeModel, v.driver, v.notes, v.year));
  const checks = data.checks.filter((c) =>
    matches(q, regOf.get(c.vehicleId), c.checkedBy, c.defects, c.action, labelOf(CHECK_STATUSES, c.status), niceDate(c.checkedOn)));
  const services = data.services.filter((s) => matches(q, regOf.get(s.vehicleId), s.workshop, s.workDone, s.notes, niceDate(s.servicedOn)));
  const accidents = data.accidents.filter((a) =>
    matches(q, regOf.get(a.vehicleId), a.driver, a.location, a.description, a.damage, a.thirdParty, a.thirdPartyReg, labelOf(ACCIDENT_STATUSES, a.status)));


  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Fleet"
        count={data.vehicles.length}
        reports={[{ label: "Create report", hint: "Choose which vehicles and what to include", onSelect: () => setReportOpen(true) }]}
        // Checks, services and accidents are added from inside the vehicle, as live.
        newAction={{ label: "New vehicle", onSelect: () => setOpen({ kind: "vehicle", id: null }) }}
      />

      <FilterPills
        label="Show"
        value={view}
        onChange={(v) => setView(v)}
        options={[
          { value: "vehicles", label: "Vehicles", count: data.vehicles.length },
          { value: "checks", label: "Vehicle checks", count: data.checks.length },
          { value: "services", label: "Services", count: data.services.length },
          { value: "accidents", label: "Accidents", count: data.accidents.length },
        ]}
      />

      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder={`Search ${view === "checks" ? "vehicle checks" : view}`} label={`Search ${view}`} />
      </FilterRow>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line" data-testid="fleet-list">
          {view === "vehicles" && vehicles.map((v) => (
            <Row key={v.id} onClick={() => setOpen({ kind: "vehicle", id: v.id })}
              title={v.reg} sub={[v.makeModel, v.driver].filter(Boolean).join(" · ")}
              chips={<VehicleChips v={v} today={today} offRoad={isOffRoad(data.checks, v.id)} />} />
          ))}
          {view === "checks" && checks.map((c) => (
            <Row key={c.id} onClick={() => setOpen({ kind: "check", id: c.id })}
              title={`${regOf.get(c.vehicleId) ?? ""} · ${niceDate(c.checkedOn)}`}
              sub={[c.checkedBy, c.odometer != null ? `${c.odometer.toLocaleString("en-GB")} miles` : "", c.defects].filter(Boolean).join(" · ")}
              chips={<>
                <Chip tone={c.status === "passed" || c.status === "defects_fixed" ? "ok" : c.status === "off_road" ? "overdue" : "soon"}>{labelOf(CHECK_STATUSES, c.status)}</Chip>
                {!c.reviewed && <Chip tone="soon">Not reviewed</Chip>}
                {c.source === "team" && <Chip>Team app</Chip>}
              </>} />
          ))}
          {view === "services" && services.map((s) => (
            <Row key={s.id} onClick={() => setOpen({ kind: "service", id: s.id })}
              title={`${regOf.get(s.vehicleId) ?? ""} · ${niceDate(s.servicedOn)}`}
              sub={[s.workshop, s.cost ? `£${Number(s.cost).toLocaleString("en-GB", { minimumFractionDigits: 2 })}` : "", s.workDone].filter(Boolean).join(" · ")}
              chips={s.nextDue ? <Chip>Next due {niceDate(s.nextDue)}</Chip> : null} />
          ))}
          {view === "accidents" && accidents.map((a) => (
            <Row key={a.id} onClick={() => setOpen({ kind: "accident", id: a.id })}
              title={`${regOf.get(a.vehicleId) ?? ""} · ${a.occurredAt ? niceDateTime(a.occurredAt) : "Date not given"}`}
              sub={[a.driver, a.location, a.description].filter(Boolean).join(" · ")}
              chips={<>
                <Chip tone={a.status === "closed" ? "ok" : "overdue"}>{labelOf(ACCIDENT_STATUSES, a.status)}</Chip>
                {a.source === "team" && <Chip>Team app</Chip>}
              </>} />
          ))}
          {{ vehicles, checks, services, accidents }[view].length === 0 && (
            <li className="px-4 py-6 text-sm text-muted">{q ? "Nothing matches the search." : "Nothing here yet."}</li>
          )}
        </ul>
      </div>

      <FleetDrawer open={open} data={data} today={today} onOpen={setOpen} saved={saved} deleted={deleted} />
      <FleetReport open={reportOpen} onClose={() => setReportOpen(false)} onCreate={setReport} />
      <DocViewer file={report} onClose={() => setReport(null)} />
    </RegisterLayout>
  );
}

function isOffRoad(checks: CheckRow[], vehicleId: number): boolean {
  const latest = checks.filter((c) => c.vehicleId === vehicleId).sort((a, b) => b.checkedOn.localeCompare(a.checkedOn) || b.id - a.id)[0];
  return latest?.status === "off_road";
}

function Row({ title, sub, chips, onClick }: { title: string; sub: string; chips: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-44 flex-1">
          <span className="block font-bold">{title}</span>
          {sub && <span className="block text-sm text-muted truncate">{sub}</span>}
        </span>
        <span className="flex flex-wrap gap-1.5">{chips}</span>
      </button>
    </li>
  );
}

function VehicleChips({ v, today, offRoad }: { v: VehicleRow; today: string; offRoad: boolean }) {
  const service = worst(dueState(v.serviceDue, today), milesState(v.serviceDueMiles, v.latestMiles));
  return (
    <>
      {offRoad && <Chip tone="overdue">Off road</Chip>}
      <Chip tone={dueState(v.vehicleTaxDue, today)}>Vehicle Tax {v.vehicleTaxDue ? niceDate(v.vehicleTaxDue) : "not set"}</Chip>
      <Chip tone={dueState(v.motExpiry, today)}>MOT {v.motExpiry ? niceDate(v.motExpiry) : "not set"}</Chip>
      <Chip tone={service}>Service {v.serviceDue ? niceDate(v.serviceDue) : "not set"}</Chip>
      {v.inspectionFrequency !== "not_required" && (
        <Chip tone={dueState(v.nextInspectionOn, today)}>
          {labelOf(FREQUENCIES, v.inspectionFrequency)} inspection {v.nextInspectionOn ? niceDate(v.nextInspectionOn) : "not set"}
        </Chip>
      )}
      {!v.holdsStock && <Chip>Fleet only</Chip>}
    </>
  );
}

function FleetDrawer({
  open, data, today, onOpen, saved, deleted,
}: {
  open: Open | null;
  data: FleetData;
  today: string;
  onOpen: (o: Open | null) => void;
  saved: {
    vehicle: (v: VehicleRow) => void;
    check: (r: CheckRow, v: VehicleRow) => void;
    service: (r: ServiceRow, v: VehicleRow) => void;
    accident: (r: AccidentRow, v: VehicleRow) => void;
  };
  deleted: (kind: Open["kind"], id: number, vehicle: VehicleRow | null) => void;
}) {
  if (!open) return <Drawer open={false} onClose={() => onOpen(null)} title="">{null}</Drawer>;
  const reg = (id: number | undefined) => data.vehicles.find((v) => v.id === id)?.reg ?? "";
  let title = "";
  let body: React.ReactNode = null;
  if (open.kind === "vehicle") {
    const v = data.vehicles.find((x) => x.id === open.id) ?? null;
    title = v ? `${v.reg}${v.makeModel ? ` · ${v.makeModel}` : ""}` : "Add vehicle";
    body = <VehicleForm key={v ? `${v.id}-${JSON.stringify(v)}` : "new"} vehicle={v} data={data} today={today} onOpen={onOpen} onSaved={saved.vehicle} onDeleted={(id) => deleted("vehicle", id, null)} />;
  } else if (open.kind === "check") {
    const c = data.checks.find((x) => x.id === open.id) ?? null;
    title = c ? `Vehicle check · ${reg(c.vehicleId)} · ${niceDate(c.checkedOn)}` : "Add check";
    body = <CheckForm key={c ? `${c.id}-${JSON.stringify(c)}` : `new-${open.vehicleId ?? ""}`} check={c} vehicleId={open.vehicleId} data={data} today={today}
      onOpen={onOpen} onSaved={saved.check} onDeleted={(id, v) => deleted("check", id, v)} />;
  } else if (open.kind === "service") {
    const s = data.services.find((x) => x.id === open.id) ?? null;
    title = s ? `Service · ${reg(s.vehicleId)} · ${niceDate(s.servicedOn)}` : "Add service";
    body = <ServiceForm key={s ? `${s.id}-${JSON.stringify(s)}` : `new-${open.vehicleId ?? ""}`} service={s} vehicleId={open.vehicleId} data={data} today={today}
      onOpen={onOpen} onSaved={saved.service} onDeleted={(id, v) => deleted("service", id, v)} />;
  } else {
    const a = data.accidents.find((x) => x.id === open.id) ?? null;
    title = a ? `Accident · ${reg(a.vehicleId)}` : "Add accident";
    body = <AccidentForm key={a ? `${a.id}-${JSON.stringify(a)}` : `new-${open.vehicleId ?? ""}`} accident={a} vehicleId={open.vehicleId} data={data}
      onOpen={onOpen} onSaved={saved.accident} onDeleted={(id, v) => deleted("accident", id, v)} />;
  }
  return (
    <Drawer open onClose={() => onOpen(null)} title={title} width="max-w-2xl">
      {body}
    </Drawer>
  );
}

const REPORT_COLUMNS = [
  { key: "make", label: "Make and model" },
  { key: "year", label: "Year" },
  { key: "driver", label: "Driver" },
  { key: "tax", label: "Vehicle Tax" },
  { key: "mot", label: "MOT" },
  { key: "service", label: "Service" },
  { key: "inspection", label: "Next inspection" },
  { key: "miles", label: "Miles" },
] as const;

// Fleet report: the office chooses which vehicles and which columns. Opens in-window.
function FleetReport({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (f: ViewableFile) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Create report" size="max-w-md">
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const cols = REPORT_COLUMNS.map((c) => c.key).filter((k) => f.get(`col_${k}`) === "on");
          const which = String(f.get("which") || "all");
          onClose();
          onCreate({ id: 0, name: "Fleet list.pdf", mime: "application/pdf", url: `/api/fleet/report?which=${which}&cols=${cols.join(",")}` });
        }}
      >
        <fieldset className="mb-4">
          <legend className="block text-sm font-medium mb-1">Vehicles</legend>
          <select name="which" defaultValue="all" className="w-full rounded-lg border border-line bg-white px-3 py-2">
            <option value="all">All vehicles</option>
            <option value="attention">Only vehicles that need attention</option>
          </select>
        </fieldset>
        <fieldset className="mb-5">
          <legend className="block text-sm font-medium mb-1">Include</legend>
          {REPORT_COLUMNS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 py-1 text-sm">
              <input type="checkbox" name={`col_${c.key}`} defaultChecked={c.key !== "year" && c.key !== "miles"} className="h-4 w-4 accent-brand" />
              {c.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Create report</button>
      </form>
    </Modal>
  );
}
