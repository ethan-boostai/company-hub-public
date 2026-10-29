"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Drawer } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { dueState, niceDate, niceDateTime } from "../_registers/dates";
import { Chip, ViewSwitch } from "../_registers/ui";
import type { Saved } from "./actions";
import type { EquipmentData } from "./data";
import { AssetForm, assetTitle, assetTone, MaterialForm, placeOf, ServiceForm, ToolReportForm } from "./forms";
import { LocationSelect } from "./parts";
import { equipmentDueItems, isLow, labelOf, locKey, locLabel, parseLocKey, qty, REPORT_STATUSES, STOCKTAKE_STATUSES, TOOL_KINDS, ASSET_STATUSES, type DueItem } from "./rules";
import { ReportDialog } from "./report-dialog";
import { MoveForm, StocktakeForm } from "./stock-forms";
import type { Open } from "./types";

type View = "all" | "equipment" | "materials" | "stocktakes" | "reports";

export function EquipmentClient({ initial, today, me, openReportId }: { initial: EquipmentData; today: string; me: string; openReportId: number | null }) {
  const [data, setData] = useState(initial);
  const [view, setView] = useState<View>("all");
  const [where, setWhere] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState(false);
  const [open, setOpen] = useState<Open | null>(() =>
    openReportId && initial.reports.some((r) => r.id === openReportId) ? { kind: "report", id: openReportId } : null,
  );
  const q = query.trim().toLowerCase();
  const due = useMemo(() => equipmentDueItems(data.assets, data.materials, data.stocktakes, data.reports, today), [data, today]);

  function saved(s: Saved, next: Open | null) {
    setData(s.all);
    setOpen(next);
  }

  const atWhere = (k: string) => !where || k.toLowerCase() === where.toLowerCase();
  const kitList = view === "all" || view === "equipment";
  const matList = view === "all" || view === "materials";
  const categories = useMemo(() => {
    const c = new Set<string>();
    if (kitList) data.assets.forEach((a) => a.category && c.add(a.category));
    if (matList) data.materials.forEach((m) => m.category && c.add(m.category));
    return [...c].sort((a, b) => a.localeCompare(b));
  }, [data, kitList, matList]);
  const cat = categories.includes(category) ? category : "";

  const assets = !kitList ? [] : data.assets.filter((a) =>
    atWhere(locKey(a)) && (!cat || a.category === cat) &&
    (!q || [a.assetTag, a.name, a.category, a.makeModel, a.serialNo, a.notes, placeOf(a, data), labelOf(ASSET_STATUSES, a.status)].some((f) => f.toLowerCase().includes(q))));
  const materials = !matList ? [] : data.materials.filter((m) =>
    (!where || m.stock.some((s) => atWhere(locKey(s)) && s.qty > 0)) && (!cat || m.category === cat) &&
    (!q || [m.name, m.category, m.supplierName, m.supplierCode, m.notes].some((f) => f.toLowerCase().includes(q))));
  const stocktakes = view !== "stocktakes" ? [] : data.stocktakes.filter((s) =>
    atWhere(locKey(s)) && (!q || [s.locationLabel, s.countedBy, s.notes, labelOf(STOCKTAKE_STATUSES, s.status)].some((f) => f.toLowerCase().includes(q))));
  const reports = view !== "reports" ? [] : data.reports.filter((r) =>
    !q || [r.toolName, r.reportedBy, r.details, r.location, labelOf(TOOL_KINDS, r.kind), labelOf(REPORT_STATUSES, r.status)].some((f) => f.toLowerCase().includes(q)));

  const rows: { key: string; title: string; sub: string; chips: ReactNode; open: Open; name: string }[] = [
    ...assets.map((a) => ({
      key: `a${a.id}`, name: a.name, title: assetTitle(a), open: { kind: "asset", id: a.id } as Open,
      sub: [a.category, a.makeModel, where ? "" : placeOf(a, data)].filter(Boolean).join(" · "),
      chips: <>
        <Chip>Equipment</Chip>
        {a.status !== "in_service" && <Chip tone={assetTone(a.status)}>{labelOf(ASSET_STATUSES, a.status)}</Chip>}
        {a.nextServiceOn && <Chip tone={dueState(a.nextServiceOn, today)}>Service {niceDate(a.nextServiceOn)}</Chip>}
        {a.testTagDue && <Chip tone={dueState(a.testTagDue, today)}>PAT {niceDate(a.testTagDue)}</Chip>}
      </>,
    })),
    ...materials.map((m) => {
      const here = where ? m.stock.filter((s) => atWhere(locKey(s))).reduce((t, s) => t + s.qty, 0) : m.total;
      return {
        key: `m${m.id}`, name: m.name, title: m.name, open: { kind: "material", id: m.id } as Open,
        sub: [m.category, where ? "" : m.stock.length > 1 ? `at ${m.stock.length} locations` : m.stock[0] ? placeOf(m.stock[0], data) : "none in stock"].filter(Boolean).join(" · "),
        chips: <>
          <Chip>Material</Chip>
          <Chip tone={!where && isLow(m.total, m.minLevel) ? (m.total <= 0 ? "overdue" : "soon") : "none"}>{qty(here)} {m.unit}{where ? " here" : ""}</Chip>
          {m.status === "discontinued" && <Chip>Discontinued</Chip>}
        </>,
      };
    }),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const count = (v: View) => ({
    all: data.assets.length + data.materials.length, equipment: data.assets.length, materials: data.materials.length,
    stocktakes: data.stocktakes.length, reports: data.reports.length,
  })[v];

  return (
    <div>
      <DuePanel items={due} onOpen={setOpen} />
      <ViewSwitch value={view} onChange={setView} options={(["all", "equipment", "materials", "stocktakes", "reports"] as View[]).map((v) => ({
        value: v, count: count(v),
        label: { all: "All", equipment: "Equipment", materials: "Materials", stocktakes: "Stocktakes", reports: "Tool reports" }[v],
      }))} />

      <div className="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-3">
        {view !== "reports" && (
          <LocationSelect key={`where-${data.places.length}`} data={data} name="where" label="Location" allowPerson={view !== "stocktakes"} allowNone noneLabel="All locations" defaultValue={where} onChange={setWhere} />
        )}
        {(kitList || matList) && (
          <div className="mb-4">
            <label htmlFor="cat-filter" className="block text-sm font-medium mb-1">Category</label>
            <select id="cat-filter" value={cat} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2">
              <option value="">All categories</option>
              {categories.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}
        <div className="mb-4 self-end">
          <SearchBox value={query} onChange={setQuery} placeholder={`Search ${view === "all" ? "equipment and materials" : view === "reports" ? "tool reports" : view}`} label="Search the list" />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button type="button" onClick={() => setOpen({ kind: "asset", id: null })} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Add equipment</button>
        <button type="button" onClick={() => setOpen({ kind: "material", id: null })} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">Add material</button>
        <button type="button" onClick={() => setOpen({ kind: "move", from: where || undefined })} className="px-4 py-2 rounded-lg border border-dark font-semibold">Move stock</button>
        <button type="button" onClick={() => setOpen({ kind: "stocktake", id: null, location: where || undefined })} className="px-4 py-2 rounded-lg border border-dark font-semibold">Start stocktake</button>
        <button type="button" onClick={() => setOpen({ kind: "report", id: null })} className="px-4 py-2 rounded-lg border border-dark font-semibold">Add tool report</button>
        <button type="button" onClick={() => setReporting(true)} className="px-4 py-2 rounded-lg border border-dark font-semibold">Create report</button>
      </div>

      <div className="bg-white border border-line rounded-xl overflow-hidden">
        <ul className="divide-y divide-line" data-testid="equipment-list">
          {(view === "all" || view === "equipment" || view === "materials") && rows.map((r) => (
            <Row key={r.key} title={r.title} sub={r.sub} chips={r.chips} onClick={() => setOpen(r.open)} />
          ))}
          {view === "stocktakes" && stocktakes.map((s) => (
            <Row key={s.id} title={`${s.locationLabel} · ${niceDateTime(s.countedAt)}`} sub={`${s.countedBy} · ${s.lines.length} line${s.lines.length === 1 ? "" : "s"}`}
              onClick={() => setOpen({ kind: "stocktake", id: s.id })}
              chips={<Chip tone={s.status === "pending" ? "soon" : s.status === "approved" ? "ok" : "none"}>{labelOf(STOCKTAKE_STATUSES, s.status)}</Chip>} />
          ))}
          {view === "reports" && reports.map((r) => (
            <Row key={r.id} title={`${r.toolName} · ${labelOf(TOOL_KINDS, r.kind)}`} sub={[niceDateTime(r.occurredAt ?? r.createdAt), r.reportedBy, r.details].filter(Boolean).join(" · ")}
              onClick={() => setOpen({ kind: "report", id: r.id })}
              chips={<>
                <Chip tone={r.status === "closed" ? "ok" : r.status === "new" ? "overdue" : "soon"}>{labelOf(REPORT_STATUSES, r.status)}</Chip>
                {r.source === "team" && <Chip>Team app</Chip>}
                {r.wants !== "none" && <Chip>{r.wants === "replace" ? "Replacement asked for" : "Repair asked for"}</Chip>}
              </>} />
          ))}
          {({ all: rows, equipment: rows, materials: rows, stocktakes, reports }[view].length === 0) && (
            <li className="px-4 py-6 text-sm text-muted">{q || where || cat ? "Nothing matches." : "Nothing here yet."}</li>
          )}
        </ul>
      </div>

      <ReportDialog open={reporting} where={where} whereLabel={where ? locLabel(parseLocKey(where), data.vehicles, data.people) : ""} onClose={() => setReporting(false)} />
      <EquipmentDrawer open={open} data={data} today={today} me={me} onOpen={setOpen} onSaved={saved} />
    </div>
  );
}

function Row({ title, sub, chips, onClick }: { title: string; sub: string; chips: ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" onClick={onClick} className="w-full text-left px-4 py-3 hover:bg-paper flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="min-w-0 flex-1">
          <span className="block font-medium">{title}</span>
          {sub && <span className="block text-sm text-muted truncate">{sub}</span>}
        </span>
        <span className="flex flex-wrap gap-1.5">{chips}</span>
      </button>
    </li>
  );
}

function DuePanel({ items, onOpen }: { items: DueItem[]; onOpen: (o: Open) => void }) {
  const [shown, setShown] = useState(true);
  return (
    <section className="mb-5 bg-white border border-line rounded-xl">
      <button type="button" onClick={() => setShown((s) => !s)} aria-expanded={shown} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <h2 className="font-semibold flex-1">Needs attention</h2>
        <span className="text-sm text-muted">{items.length === 0 ? "Nothing right now" : `${items.length} item${items.length === 1 ? "" : "s"}`}</span>
        <span aria-hidden="true" className="text-muted">{shown ? "▲" : "▼"}</span>
      </button>
      {shown && items.length > 0 && (
        <ul className="divide-y divide-line border-t border-line" data-testid="due-list">
          {items.map((it, i) => (
            <li key={i}>
              <button type="button" onClick={() => onOpen({ kind: it.open.kind, id: it.open.id } as Open)}
                className="w-full text-left px-4 py-2 hover:bg-paper flex flex-wrap items-center gap-x-3">
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

function EquipmentDrawer({ open, data, today, me, onOpen, onSaved }: {
  open: Open | null; data: EquipmentData; today: string; me: string;
  onOpen: (o: Open | null) => void; onSaved: (s: Saved, next: Open | null) => void;
}) {
  if (!open) return <Drawer open={false} onClose={() => onOpen(null)} title="">{null}</Drawer>;
  const common = { data, today, me, onOpen, onSaved };
  let title = "";
  let body: ReactNode = null;
  if (open.kind === "asset") {
    const a = data.assets.find((x) => x.id === open.id) ?? null;
    title = a ? assetTitle(a) : "Add equipment";
    body = <AssetForm key={a ? `${a.id}-${JSON.stringify(a)}` : "new"} asset={a} {...common} />;
  } else if (open.kind === "service") {
    const s = data.services.find((x) => x.id === open.id) ?? null;
    title = s ? `Service · ${niceDate(s.servicedOn)}` : "Add service";
    body = <ServiceForm key={s ? `${s.id}-${JSON.stringify(s)}` : `new-${open.assetId ?? ""}`} service={s} assetId={open.assetId} {...common} />;
  } else if (open.kind === "material") {
    const m = data.materials.find((x) => x.id === open.id) ?? null;
    title = m ? m.name : "Add material";
    body = <MaterialForm key={m ? `${m.id}-${JSON.stringify(m)}` : "new"} material={m} {...common} />;
  } else if (open.kind === "move") {
    title = "Move stock";
    body = <MoveForm from={open.from} {...common} />;
  } else if (open.kind === "stocktake") {
    const s = data.stocktakes.find((x) => x.id === open.id) ?? null;
    title = s ? `Stocktake · ${s.locationLabel}` : "Start stocktake";
    body = <StocktakeForm key={s ? `${s.id}-${s.status}` : "new"} stocktake={s} location={open.location} {...common} />;
  } else {
    const r = data.reports.find((x) => x.id === open.id) ?? null;
    title = r ? `Tool report · ${r.toolName}` : "Add tool report";
    body = <ToolReportForm key={r ? `${r.id}-${r.status}` : `new-${open.assetId ?? ""}`} report={r} assetId={open.assetId} {...common} />;
  }
  return <Drawer open onClose={() => onOpen(null)} title={title} width="max-w-2xl">{body}</Drawer>;
}
