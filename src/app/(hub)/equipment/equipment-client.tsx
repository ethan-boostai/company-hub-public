"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Drawer, Modal } from "@/components/ui/overlay";
import { SearchBox } from "@/components/ui/search-box";
import { dueState, niceDate, niceDateTime } from "../_registers/dates";
import { dueTone } from "../_registers/ui";
import { PageTop, RegisterLayout, type AttentionItem } from "@/components/ui/page-top";
import { DataTable, FilterPills, FilterRow, StatusPill } from "@/components/ui/register";
import { markYardReturnDone, type Saved } from "./actions";
import type { EquipmentData } from "./data";
import { AssetForm, assetTitle, assetTone, MaterialForm, placeOf, ServiceForm, ToolReportForm } from "./forms";
import { LocationSelect } from "./parts";
import { equipmentDueItems, isLow, labelOf, locKey, locLabel, parseLocKey, qty, REPORT_STATUSES, STOCKTAKE_STATUSES, REPORT_KINDS, ASSET_STATUSES } from "./rules";
import { ReportDialog } from "@/components/ui/report-dialog";
import { EQUIPMENT_COLUMNS, MATERIAL_COLUMNS } from "./report-options";
import { MoveForm, StocktakeForm } from "./stock-forms";
import type { Open } from "./types";

type View = "all" | "equipment" | "materials" | "stocktakes" | "reports";

export function EquipmentClient({ initial, today, me, openReportId, openAssetId = null, openMaterialId = null }: {
  initial: EquipmentData; today: string; me: string; openReportId: number | null; openAssetId?: number | null; openMaterialId?: number | null;
}) {
  const [data, setData] = useState(initial);
  const router = useRouter();
  const [yardReturn, setYardReturn] = useState<number | null>(null);
  const [view, setView] = useState<View>("all");
  const [where, setWhere] = useState("");
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [reporting, setReporting] = useState(false);
  const [open, setOpen] = useState<Open | null>(() =>
    openReportId && initial.reports.some((r) => r.id === openReportId) ? { kind: "report", id: openReportId }
      : openAssetId && initial.assets.some((a) => a.id === openAssetId) ? { kind: "asset", id: openAssetId }
        : openMaterialId && initial.materials.some((m) => m.id === openMaterialId) ? { kind: "material", id: openMaterialId } : null,
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
    !q || [r.toolName, r.reportedBy, r.details, r.location, labelOf(REPORT_KINDS, r.kind), labelOf(REPORT_STATUSES, r.status)].some((f) => f.toLowerCase().includes(q)));

  // Equipment and materials in one table, by name.
  type ItemRow = { key: string; name: string; title: string; sub: string; type: string; where: string; status: ReactNode; due: ReactNode; open: Open };
  const rows: ItemRow[] = [
    ...assets.map((a): ItemRow => {
      const next = [["Service", a.nextServiceOn], ["PAT", a.testTagDue]].filter(([, d]) => d).sort((x, y) => String(x[1]).localeCompare(String(y[1])))[0];
      return {
        key: `a${a.id}`, name: a.name, title: assetTitle(a), open: { kind: "asset", id: a.id },
        sub: [a.category, a.makeModel].filter(Boolean).join(" · "), type: "Equipment", where: `${placeOf(a, data)}${a.onJob ? ` · On job ${a.onJob.jobNo}` : ""}`,
        status: <StatusPill tone={dueTone(assetTone(a.status))}>{labelOf(ASSET_STATUSES, a.status)}</StatusPill>,
        due: next ? <StatusPill tone={dueTone(dueState(next[1], today))}>{next[0]} {niceDate(next[1])}</StatusPill> : null,
      };
    }),
    ...materials.map((m): ItemRow => {
      const here = where ? m.stock.filter((s) => atWhere(locKey(s))).reduce((t, s) => t + s.qty, 0) : m.total;
      const low = !where && m.status === "active" && isLow(m.total, m.minLevel);
      return {
        key: `m${m.id}`, name: m.name, title: m.name, open: { kind: "material", id: m.id },
        sub: m.category, type: "Material",
        where: where ? `${qty(here)} ${m.unit} here` : m.stock.length > 1 ? `${qty(m.total)} ${m.unit} at ${m.stock.length} locations` : m.stock[0] ? `${qty(m.total)} ${m.unit} at ${placeOf(m.stock[0], data)}` : "None in stock",
        status: m.status === "discontinued" ? <StatusPill tone="grey">Discontinued</StatusPill>
          : low ? <StatusPill tone={m.total <= 0 ? "red" : "amber"}>Low stock</StatusPill>
          : <StatusPill tone="green">In stock</StatusPill>,
        due: null,
      };
    }),
  ].sort((a, b) => a.name.localeCompare(b.name));

  const count = (v: View) => ({
    all: data.assets.length + data.materials.length, equipment: data.assets.length, materials: data.materials.length,
    stocktakes: data.stocktakes.length, reports: data.reports.length,
  })[v];

  const attention: AttentionItem[] = [...data.yardReturns.map((r): AttentionItem => ({
    key: `yr-${r.id}`, level: "soon", tag: "Returned, not on the register", name: r.name,
    detail: `${qty(r.qty)} ${r.unit} at ${r.location}${r.jobNo ? `, from job ${r.jobNo}` : ""}`, onOpen: () => setYardReturn(r.id),
  })), ...data.loadUpProblems.map((p): AttentionItem => ({
    key: `lu-${p.sheetId}`, level: "overdue", tag: "Load-up problem", name: `Job ${p.jobNo}, load-up sheet ${p.sheetId}`,
    detail: `Reported ${niceDate(p.date)}`, onOpen: () => router.push(`/jobs/${p.jobNo}/load-up?sheet=${p.sheetId}`),
  })), ...due.map((it, i): AttentionItem => ({
    key: `${i}-${it.open.kind}-${it.open.id}-${it.what}`,
    level: it.tone === "overdue" ? "overdue" : "soon",
    tag: it.what,
    name: it.name,
    detail: it.detail,
    onOpen: () => setOpen({ kind: it.open.kind, id: it.open.id } as Open),
  }))];
  const empty = q || where || cat ? "Nothing matches." : "Nothing here yet.";

  return (
    <RegisterLayout attention={attention}>
      <PageTop
        title="Equipment and materials"
        count={data.assets.length + data.materials.length}
        reports={[{ label: "Create report", hint: "Choose what to include, here or everywhere", onSelect: () => setReporting(true) }]}
        more={[
          { label: "Move stock", onSelect: () => setOpen({ kind: "move", from: where || undefined }) },
          { label: "Start stocktake", onSelect: () => setOpen({ kind: "stocktake", id: null, location: where || undefined }) },
        ]}
        newAction={{
          label: "New",
          items: [
            { label: "Equipment", onSelect: () => setOpen({ kind: "asset", id: null }) },
            { label: "Material", onSelect: () => setOpen({ kind: "material", id: null }) },
            { label: "Tool report", hint: "Lost, stolen or damaged", onSelect: () => setOpen({ kind: "report", id: null }) },
          ],
        }}
      />

      <FilterPills<View> label="Show" value={view} onChange={setView} options={(["all", "equipment", "materials", "stocktakes", "reports"] as View[]).map((v) => ({
        value: v, count: count(v),
        label: { all: "All", equipment: "Equipment", materials: "Materials", stocktakes: "Stocktakes", reports: "Tool reports" }[v],
      }))} />

      <FilterRow>
        <SearchBox value={query} onChange={setQuery} placeholder={`Search ${view === "all" ? "equipment and materials" : view === "reports" ? "tool reports" : view}`} label="Search the list" />
        {view !== "reports" && (
          <LocationSelect key={`where-${data.places.length}`} data={data} name="where" label="Location" compact allowPerson={view !== "stocktakes"} allowNone noneLabel="All locations" defaultValue={where} onChange={setWhere} />
        )}
        {(kitList || matList) && (
          <select aria-label="Category" value={cat} onChange={(e) => setCategory(e.target.value)} className="min-w-44 rounded-lg border border-line bg-white px-3 py-2">
            <option value="">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </FilterRow>

      <div data-testid="equipment-list">
        {(view === "all" || view === "equipment" || view === "materials") && (
          <DataTable label="Equipment and materials" rows={rows} rowKey={(r) => r.key} onOpen={(r) => setOpen(r.open)} empty={empty} columns={[
            { key: "item", label: "Item", cell: (r) => r.title, sub: (r) => r.sub },
            { key: "type", label: "Type", cell: (r) => r.type },
            { key: "where", label: where ? "Here" : "Where / stock", cell: (r) => r.where },
            { key: "status", label: "Status", cell: (r) => r.status },
            { key: "due", label: "Next due", cell: (r) => r.due },
          ]} />
        )}
        {view === "stocktakes" && (
          <DataTable label="Stocktakes" rows={stocktakes} rowKey={(s) => s.id} onOpen={(s) => setOpen({ kind: "stocktake", id: s.id })} empty={empty} columns={[
            { key: "where", label: "Location", cell: (s) => s.locationLabel, sub: (s) => niceDateTime(s.countedAt) },
            { key: "by", label: "Counted by", cell: (s) => s.countedBy },
            { key: "lines", label: "Lines", cell: (s) => String(s.lines.length) },
            { key: "status", label: "Status", cell: (s) => (
              <StatusPill tone={s.status === "pending" ? "amber" : s.status === "approved" ? "green" : "grey"}>{labelOf(STOCKTAKE_STATUSES, s.status)}</StatusPill>
            ) },
          ]} />
        )}
        {view === "reports" && (
          <DataTable label="Tool reports" rows={reports} rowKey={(r) => r.id} onOpen={(r) => setOpen({ kind: "report", id: r.id })} empty={empty} columns={[
            { key: "tool", label: "Tool", cell: (r) => r.toolName, sub: (r) => niceDateTime(r.occurredAt ?? r.createdAt) },
            { key: "kind", label: "What happened", cell: (r) => labelOf(REPORT_KINDS, r.kind) },
            { key: "by", label: "Reported by", cell: (r) => r.reportedBy },
            { key: "wants", label: "Asked for", cell: (r) => (r.wants === "replace" ? "Replacement" : r.wants === "repair" ? "Repair" : "Nothing") },
            { key: "status", label: "Status", cell: (r) => (
              <StatusPill tone={r.status === "closed" ? "green" : r.status === "new" ? "red" : "amber"}>{labelOf(REPORT_STATUSES, r.status)}</StatusPill>
            ) },
            { key: "from", label: "From", cell: (r) => (r.source === "team" ? "Team app" : "Office") },
          ]} />
        )}
      </div>

      <EquipmentReport open={reporting} where={where} whereLabel={where ? locLabel(parseLocKey(where), data.vehicles, data.people) : ""} onClose={() => setReporting(false)} />
      <EquipmentDrawer open={open} data={data} today={today} me={me} onOpen={setOpen} onSaved={saved} />
      <YardReturnModal item={data.yardReturns.find((r) => r.id === yardReturn) ?? null} onClose={() => setYardReturn(null)}
        onDone={(x) => { setData(x.all); setYardReturn(null); }} />
    </RegisterLayout>
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

// A material returned at the yard that isn't on the register: the office adds it (+ New ▾ Material)
// if it should be, then marks this done.
function YardReturnModal({ item, onClose, onDone }: { item: EquipmentData["yardReturns"][number] | null; onClose: () => void; onDone: (s: Saved) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function done() {
    if (!item || busy) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await markYardReturnDone(item.id, crypto.randomUUID());
      if (r.ok && r.data) onDone(r.data);
      else if (!r.ok) setMsg(r.message);
    } catch {
      setMsg("It wasn't saved. Check the connection and try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={!!item} onClose={onClose} title="Returned, not on the register" size="max-w-lg">
      {item && (
        <div className="p-5 text-sm">
          <dl className="mb-4 grid grid-cols-[8rem_1fr] gap-y-1.5">
            <dt className="font-semibold">What</dt><dd>{item.name}</dd>
            <dt className="font-semibold">How many</dt><dd>{qty(item.qty)} {item.unit}</dd>
            <dt className="font-semibold">Put at</dt><dd>{item.location}</dd>
            <dt className="font-semibold">From job</dt><dd>{item.jobNo || "Not given"}</dd>
            <dt className="font-semibold">Returned by</dt><dd>{item.returnedBy}, {niceDateTime(item.at)}</dd>
            {item.notes && <><dt className="font-semibold">Notes</dt><dd>{item.notes}</dd></>}
          </dl>
          <p className="mb-4 text-muted">If it should be on the register, add it with + New ▾ Material (with this as opening stock), then mark this done.</p>
          <button type="button" disabled={busy} onClick={done} className="px-4 py-2 rounded-lg bg-dark text-white font-semibold disabled:opacity-50">{busy ? "Saving…" : "Mark done"}</button>
          {msg && <p role="alert" className="mt-2 text-danger">{msg}</p>}
        </div>
      )}
    </Modal>
  );
}

// "Create report": the office chooses what goes in, then the PDF opens in-window.
function EquipmentReport({ open, where, whereLabel, onClose }: { open: boolean; where: string; whereLabel: string; onClose: () => void }) {
  const has = (s: Record<string, string | string[]>, v: string) => (s.include as string[]).includes(v);
  return (
    <ReportDialog
      open={open}
      onClose={onClose}
      id="equipment"
      fileName="Equipment and materials.pdf"
      groups={[
        {
          key: "include",
          label: "Include",
          type: "ticks",
          initial: ["equipment", "materials", "here"],
          options: [
            { value: "equipment", label: "Equipment" },
            { value: "materials", label: "Materials" },
            ...(where ? [{ value: "here", label: `Only ${whereLabel}` }] : []),
            { value: "attention", label: "Only equipment needing attention (repair, lost, service or PAT due)" },
            { value: "low", label: "Only materials at or below their minimum" },
            { value: "retired", label: "Include retired equipment and discontinued materials" },
          ],
        },
        {
          key: "kit",
          label: "Equipment columns",
          type: "ticks",
          twoColumns: true,
          show: (s) => has(s, "equipment"),
          initial: EQUIPMENT_COLUMNS.filter((c) => c.default).map((c) => c.key),
          options: EQUIPMENT_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
        },
        {
          key: "mat",
          label: "Material columns",
          type: "ticks",
          twoColumns: true,
          show: (s) => has(s, "materials"),
          initial: MATERIAL_COLUMNS.filter((c) => c.default).map((c) => c.key),
          options: MATERIAL_COLUMNS.map((c) => ({ value: c.key, label: c.label })),
        },
      ]}
      check={(h) => (!h.on("include", "equipment") && !h.on("include", "materials") ? "Tick equipment, materials or both." : null)}
      url={(h, s) => {
        const p = new URLSearchParams();
        p.set("include", ["equipment", "materials"].filter((v) => h.on("include", v)).join(","));
        p.set("kit", (s.kit as string[]).join(","));
        p.set("mat", (s.mat as string[]).join(","));
        if (where && h.on("include", "here")) p.set("where", where);
        if (h.on("include", "low")) p.set("low", "1");
        if (h.on("include", "attention")) p.set("attention", "1");
        if (h.on("include", "retired")) p.set("retired", "1");
        return `/equipment/report?${p}`;
      }}
    />
  );
}
