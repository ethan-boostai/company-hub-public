"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/overlay";
import { addDays, niceDate } from "../(hub)/_registers/dates";
import { qty as fmt } from "../(hub)/equipment/rules";
import { vehicleLocationLabel } from "../(hub)/fleet/rules";
import type { LoadResult, Sheet } from "../(hub)/_site/load-up";
import { LoadScreen } from "../(hub)/_site/load-screen";
import { assetWarnings } from "../(hub)/_site/rules";
import type { YardAsset, YardData, YardMaterial } from "./data";

// The yard tablet, laid out as the old hub's yard page: four tabs (Load-ups, Deliveries, Plant,
// Stock) and the name picker top right. The name is cleared after every save (a shared device).
type Tab = "loadups" | "deliveries" | "plant" | "stock";
const TABS: Tab[] = ["loadups", "deliveries", "plant", "stock"];
const field = "w-full rounded-[10px] border border-[#ccc] bg-white p-2.5 text-base";
const SIGNAL = "It didn't send. Check the signal and try again.";
type Reply = { ok: boolean; message: string };

// One request key per attempt: kept if the reply is lost (a resend is then recognised), changed
// after any answer that says nothing was saved.
function useSend(teamKey: string) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  async function send(action: Record<string, unknown>): Promise<Reply> {
    if (busy) return { ok: false, message: "" };
    setBusy(true);
    try {
      const res = await fetch("/api/yard", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Team-Key": teamKey },
        body: JSON.stringify({ requestKey: key, action }),
      });
      const r = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; message?: string } | null;
      setKey(crypto.randomUUID());
      if (r?.ok || r?.duplicate) return { ok: true, message: r.ok ? r.message ?? "Saved." : "Saved." };
      return { ok: false, message: r?.message || SIGNAL };
    } catch {
      return { ok: false, message: SIGNAL };
    } finally {
      setBusy(false);
    }
  }
  return { busy, send };
}

function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="mt-3">
      <label htmlFor={id} className="mb-1 block text-sm text-[#555]">{label}</label>
      {children(id)}
    </div>
  );
}
const Btn = ({ children, onClick, disabled, main }: { children: ReactNode; onClick: () => void; disabled?: boolean; main?: boolean }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`rounded-[10px] px-4 py-2.5 font-bold disabled:opacity-50 ${main ? "bg-brand text-white" : "border border-[#ccc] bg-white"}`}>{children}</button>
);
const Pill = ({ children, tone = "" }: { children: ReactNode; tone?: "" | "red" | "amber" | "green" | "blue" }) => (
  <span className={`mr-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone === "red" ? "bg-red-50 text-danger" : tone === "amber" ? "bg-orange-50 text-orange-800" : tone === "green" ? "bg-green-50 text-ok" : tone === "blue" ? "bg-blue-50 text-blue-800" : "bg-[#eee] text-[#333]"}`}>{children}</span>
);
const words = (q: string) => q.toLowerCase().split(/ +/).filter(Boolean);
const hit = (text: string, ws: string[]) => ws.every((w) => text.toLowerCase().includes(w));

function Search({ value, onChange, placeholder, children }: { value: string; onChange: (v: string) => void; placeholder: string; children?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-60 flex-1 rounded-[10px] border border-[#ccc] bg-white p-2.5 text-base" />
      {children}
    </div>
  );
}

function Columns<T>({ cols, card, testid }: { cols: [string, string, T[]][]; card: (x: T) => ReactNode; testid: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-5" data-testid={testid}>
      {cols.map(([title, tone, list]) => (
        <section key={title} aria-label={title} className={`rounded-xl p-2.5 ${tone === "done" ? "bg-green-50" : "bg-[#e9e8e3]"}`}>
          <h2 className={`mb-2 flex justify-between px-1 font-bold ${tone === "red" ? "text-danger" : ""}`}><span>{title}</span><span>{list.length}</span></h2>
          {list.length ? list.map(card) : <p className="px-1 pb-1 text-sm text-muted">Nothing here.</p>}
        </section>
      ))}
    </div>
  );
}

export function YardApp({ data, teamKey }: { data: YardData; teamKey: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("loadups");
  const [name, setName] = useState("");
  const [sheetId, setSheetId] = useState<number | null>(null);
  const [assetId, setAssetId] = useState<number | null>(null);
  const [returning, setReturning] = useState(false);
  const [counting, setCounting] = useState(false);
  const [note, setNote] = useState<Reply | null>(null);
  const [updated, setUpdated] = useState("");
  const { busy, send } = useSend(teamKey);

  // The tab follows the address (#plant), so a refresh stays on it.
  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.includes(h)) setTab(h);
  }, []);
  // Refreshes every minute, except while something is open or being counted.
  const idle = sheetId === null && assetId === null && !returning && !counting && !busy;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUpdated(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" }));
  }, [data]);
  useEffect(() => {
    if (!idle) return;
    const t = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(t);
  }, [idle, router]);

  // Every save: the name is cleared afterwards and the page refreshes.
  async function act(action: Record<string, unknown>): Promise<Reply> {
    if (!name) return { ok: false, message: "Choose your name at the top first." };
    const r = await send({ ...action, name });
    if (r.ok) {
      setName("");
      setNote(r);
      router.refresh();
    }
    return r;
  }

  const t = data.today;
  const toLoad = data.sheets.filter((s) => s.status === "ready");
  const lateLoad = toLoad.some((s) => s.sheetDate < t);
  const plantFlag = data.assets.filter((a) => a.status === "needs_repair" || a.status === "lost" || (a.booking?.dueBack && a.booking.dueBack < t)).length;
  const pending = data.stocktakes.filter((s) => s.status === "pending").length;
  const tabs: [Tab, string, number, boolean][] = [["loadups", "Load-ups", toLoad.length, lateLoad], ["deliveries", "Deliveries", 0, false], ["plant", "Plant", plantFlag, false], ["stock", "Stock", pending, false]];
  const go = (x: Tab) => {
    if (counting) return setNote({ ok: false, message: "Send or cancel the stock take first." });
    setTab(x);
    setNote(null);
    window.history.replaceState(null, "", `#${x}`);
  };
  const sheet = data.sheets.find((s) => s.id === sheetId) ?? null;
  const asset = data.assets.find((a) => a.id === assetId) ?? null;

  return (
    <>
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b-4 border-brand bg-dark px-4 py-2.5 text-white">
        <h1 className="m-0 flex-1 text-xl font-bold">CBS Yard</h1>
        <label htmlFor="yard-who" className="text-sm text-[#ddd]">Your name</label>
        <select id="yard-who" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg bg-white p-2 text-ink">
          <option value="">Choose…</option>
          {data.names.map((x) => <option key={x}>{x}</option>)}
        </select>
      </header>
      <div className="mx-auto max-w-[1440px] p-4 sm:px-9">
        {sheet ? (
          <div className="rounded-xl bg-white p-4">
            <button type="button" onClick={() => setSheetId(null)} className="mb-3 font-semibold text-brand-dark">‹ Back to load-ups</button>
            <h2 className="mb-3 text-xl font-semibold">Load-up sheet {sheet.id}: job {sheet.jobNo}</h2>
            <LoadScreen sheet={sheet} ready={!!name} blocked="Choose your name at the top first."
              onLoad={async (results: LoadResult[], extra: string) => {
                const r = await act({ type: "load", sheetId: sheet.id, results, extra });
                if (r.ok) setSheetId(null);
                return r;
              }}
              onReport={async (text) => act({ type: "problem", sheetId: sheet.id, text })} />
          </div>
        ) : (
          <>
            <nav aria-label="Yard" className="flex flex-wrap gap-2">
              {tabs.map(([k, label, count, red]) => (
                <button key={k} type="button" onClick={() => go(k)} aria-current={tab === k ? "page" : undefined}
                  className={`rounded-[10px] border px-4 py-2.5 font-bold ${tab === k ? "border-brand bg-brand text-white" : "border-[#ccc] bg-white"}`}>
                  {label}{count > 0 && <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${red ? "bg-danger text-white" : tab === k ? "bg-white/30" : "bg-[#eee]"}`}>{count}</span>}
                </button>
              ))}
            </nav>
            <p className="mb-3 mt-2 text-sm text-muted">Updated {updated}. Refreshes every minute.</p>
            {note && <p role={note.ok ? "status" : "alert"} className={`mb-3 rounded-lg p-2.5 text-sm ${note.ok ? "bg-green-50 text-ok" : "bg-red-50 text-danger"}`}>{note.message}</p>}
            {tab === "loadups" && <LoadUps data={data} open={setSheetId} />}
            {tab === "deliveries" && <Deliveries />}
            {tab === "plant" && <Plant data={data} open={setAssetId} />}
            {tab === "stock" && (
              <Stock data={data} counting={counting} setCounting={setCounting} name={name} busy={busy}
                onReturn={() => setReturning(true)} onSend={(location, counts) => act({ type: "stocktake", location, counts, note: "" })} setNote={setNote} />
            )}
          </>
        )}
      </div>

      <Modal open={!!asset} onClose={() => setAssetId(null)} title={asset ? asset.name : "Plant"} size="max-w-xl">
        {asset && <PlantBox key={asset.id} asset={asset} data={data} name={name} busy={busy} act={act} close={() => setAssetId(null)} />}
      </Modal>
      <Modal open={returning} onClose={() => setReturning(false)} title="Materials back from a job" size="max-w-lg">
        {returning && <ReturnBox data={data} name={name} busy={busy} act={act} close={() => setReturning(false)} />}
      </Modal>
    </>
  );
}

/* ---------- Load-ups ---------- */

function LoadUps({ data, open }: { data: YardData; open: (id: number) => void }) {
  const [q, setQ] = useState("");
  const ws = words(q);
  const t = data.today;
  const t1 = addDays(t, 1);
  const list = data.sheets.filter((s) => !ws.length || hit([s.id, s.jobNo, s.site, s.client, s.jobTitle, s.vehicleLabel, s.crewNames.join(" ")].join(" "), ws))
    .sort((a, b) => a.sheetDate.localeCompare(b.sheetDate) || a.id - b.id);
  const open_ = list.filter((s) => s.status !== "loaded");
  const cols: [string, string, Sheet[]][] = [
    ["Overdue", "red", open_.filter((s) => s.sheetDate < t)],
    ["Today", "", open_.filter((s) => s.sheetDate === t)],
    ["Tomorrow", "", open_.filter((s) => s.sheetDate === t1)],
    ["Later", "", open_.filter((s) => s.sheetDate > t1)],
    ["Loaded today", "done", list.filter((s) => s.status === "loaded")],
  ];
  return (
    <>
      <Search value={q} onChange={setQ} placeholder="Search load-ups (job, site, vehicle, crew)" />
      <Columns testid="loadups" cols={cols} card={(s) => {
        const plant = s.lines.filter((l) => l.kind === "equipment" || l.kind === "custom_equipment").length;
        const mats = s.lines.filter((l) => l.kind === "material" || l.kind === "custom_material").length;
        const done = s.status === "loaded";
        const last = s.problems.split("\n").filter(Boolean).slice(-1)[0];
        return (
          <button key={s.id} type="button" onClick={() => open(s.id)}
            className={`mb-2 block w-full rounded-lg border-l-4 bg-white p-3 text-left shadow-sm ${s.problemsOpen ? "border-danger" : done ? "border-ok" : "border-brand"}`}>
            <b>Load-up #{s.id} • Job {s.jobNo}</b>
            <span className="block text-sm text-muted">{[s.site || s.jobTitle, s.client].filter(Boolean).join(" • ")}</span>
            <span className="block text-sm text-muted">{s.vehicleLabel || "No vehicle set"}</span>
            {s.crewNames.length > 0 && <span className="block text-sm text-muted">Crew: {s.crewNames.join(", ")}</span>}
            <span className="mt-1 block">
              <Pill>{plant} plant</Pill><Pill>{mats} materials</Pill>
              <Pill tone={done ? "green" : "amber"}>{done ? `Loaded by ${s.loadedBy.replace(/ \((yard|team app)\)$/, "")}` : niceDate(s.sheetDate)}</Pill>
            </span>
            {last && <span className="mt-1 block text-sm text-danger">Problem reported: {last.replace(/^\S+ \S+ /, "")}</span>}
          </button>
        );
      }} />
    </>
  );
}

/* ---------- Deliveries ---------- */

function Deliveries() {
  return (
    <>
      <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">Only orders being delivered to the <b>yard</b> show here. Job-site deliveries are handled on site.</div>
      <p className="rounded-xl bg-white p-6 text-center text-muted" data-testid="deliveries-placeholder">Deliveries appear here once purchase orders are in the hub.</p>
    </>
  );
}

/* ---------- Plant ---------- */

const CHIPS = [["all", "All"], ["yard", "In the yard"], ["vans", "In vehicles"], ["jobs", "On jobs"], ["fault", "Faulty"], ["missing", "Missing"], ["due", "Tests/services due"]] as const;
type Chip = (typeof CHIPS)[number][0];
const isYard = (a: YardAsset) => a.locKey.startsWith("p:");
function warnings(a: YardAsset, today: string): string[] {
  const w = assetWarnings(a, today).map((x) => (x === "Needs repair" ? "Faulty" : x));
  if (a.status === "lost") w.unshift("Missing");
  if (a.booking?.dueBack && a.booking.dueBack < today) w.push("Overdue back");
  return w;
}

function Plant({ data, open }: { data: YardData; open: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const t = data.today;
  const ws = words(q);
  const list = data.assets.filter((a) => {
    const w = warnings(a, t);
    if (chip === "yard" && !(isYard(a) && !a.booking && a.status !== "lost")) return false;
    if (chip === "vans" && !(a.inVehicle && !a.booking && a.status !== "lost")) return false;
    if (chip === "jobs" && !a.booking) return false;
    if (chip === "fault" && a.status !== "needs_repair") return false;
    if (chip === "missing" && a.status !== "lost") return false;
    if (chip === "due" && !w.some((x) => /overdue/i.test(x))) return false;
    return !ws.length || hit([a.name, a.category, a.makeModel, a.tag, a.serialNo, a.location, a.booking ? `job ${a.booking.jobNo}` : ""].join(" "), ws);
  });
  const groups = new Map<string, YardAsset[]>();
  for (const a of list) {
    const k = a.status === "lost" ? "Missing" : a.booking ? `On job ${a.booking.jobNo}` : a.location;
    groups.set(k, [...(groups.get(k) ?? []), a]);
  }
  const rank = (k: string) => (k === "Missing" ? 3 : k.startsWith("On job") ? 2 : data.locations.places.some((p) => p.toLowerCase() === k.toLowerCase()) ? 0 : 1);
  const keys = [...groups.keys()].sort((x, y) => rank(x) - rank(y) || x.localeCompare(y));
  return (
    <>
      <Search value={q} onChange={setQ} placeholder="Search plant (name, tag, location)">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
          {CHIPS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setChip(k)} aria-pressed={chip === k}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${chip === k ? "border-dark bg-dark text-white" : "border-[#ccc] bg-white"}`}>{label}</button>
          ))}
        </div>
      </Search>
      <p className="mb-2 text-sm text-muted">{list.length} item{list.length === 1 ? "" : "s"}. Tap an item to report a fault, mark it missing or found.</p>
      {keys.length === 0 && <p className="rounded-xl bg-white p-6 text-center text-muted">Nothing matches.</p>}
      <div data-testid="plant-list">
        {keys.map((k) => (
          <section key={k} aria-label={k} className="mb-3 overflow-hidden rounded-xl border border-line bg-white">
            <h2 className="flex justify-between bg-[#f7f7f5] px-3 py-2 text-sm font-bold"><span>{k}</span><span>{groups.get(k)!.length}</span></h2>
            {groups.get(k)!.map((a) => (
              <button key={a.id} type="button" onClick={() => open(a.id)} className="flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left hover:bg-paper">
                <span className="min-w-0 flex-1"><b>{a.name}</b><span className="block text-xs text-muted">{[a.category, a.tag].filter(Boolean).join(" • ")}</span></span>
                <span>{warnings(a, data.today).map((w) => <Pill key={w} tone="red">{w}</Pill>)}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
    </>
  );
}

// Places and vans that hold stock (no "add new" here: places are added by the office).
function WhereOptions({ data }: { data: YardData }) {
  return (
    <>
      <optgroup label="Places">{data.locations.places.map((p) => <option key={p} value={`p:${p}`}>{p}</option>)}</optgroup>
      <optgroup label="Vans">{data.locations.vehicles.filter((v) => v.holdsStock).map((v) => <option key={v.id} value={`v:${v.id}`}>{vehicleLocationLabel(v)}</option>)}</optgroup>
    </>
  );
}

function PlantBox({ asset: a, data, name, busy, act, close }: {
  asset: YardAsset; data: YardData; name: string; busy: boolean; act: (x: Record<string, unknown>) => Promise<Reply>; close: () => void;
}) {
  const lost = a.status === "lost";
  const [what, setWhat] = useState<"faulty" | "missing" | "found">(lost ? "found" : "faulty");
  const [where, setWhere] = useState(a.locKey && !a.booking ? a.locKey : "p:CBS Warehouse");
  const [text, setText] = useState("");
  const [backTo, setBackTo] = useState("p:CBS Warehouse");
  const [due, setDue] = useState(addDays(data.today, 7));
  const [job, setJob] = useState("");
  const [moveDue, setMoveDue] = useState(addDays(data.today, 7));
  const [msg, setMsg] = useState("");
  const w = warnings(a, data.today);
  const b = a.booking;
  async function run(action: Record<string, unknown>) {
    setMsg("");
    const r = await act(action);
    if (r.ok) close();
    else setMsg(r.message);
  }
  const off = busy || !name;
  return (
    <div className="p-5" data-testid="plant-box">
      <p className="text-sm text-muted">{[a.category, a.makeModel, a.tag ? `Tag ${a.tag}` : "", a.serialNo ? `S/N ${a.serialNo}` : ""].filter(Boolean).join(" • ")}</p>
      <p className="mt-1.5">Where: <b>{lost ? `Missing (last at ${a.location})` : b ? `On job ${b.jobNo}, with ${b.outWith}` : a.location}</b></p>
      {w.length > 0 && <p className="mt-1">{w.map((x) => <Pill key={x} tone="red">{x}</Pill>)}</p>}
      {!name && <p className="mt-2 text-sm text-danger">Choose your name at the top first.</p>}

      {b && (
        <section className="mt-4 rounded-xl border border-line p-3" aria-label="Out on a job">
          <p className="mb-2 text-sm">Out on job {b.jobNo}{b.dueBack ? `, due back ${niceDate(b.dueBack)}` : ""}.</p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field label="Back to">{(id) => <select id={id} value={backTo} onChange={(e) => setBackTo(e.target.value)} className={field}><WhereOptions data={data} /></select>}</Field>
            </div>
            <Btn main disabled={off} onClick={() => run({ type: "plant_back", bookingId: b.id, to: backTo })}>Back in the yard</Btn>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field label="New due back">{(id) => <input id={id} type="date" min={data.today} value={due} onChange={(e) => setDue(e.target.value)} className={field} />}</Field>
            </div>
            <Btn disabled={off || !due} onClick={() => run({ type: "plant_extend", bookingId: b.id, dueBack: due })}>Extend</Btn>
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <Field label="Move to job">{(id) => (
                <select id={id} value={job} onChange={(e) => setJob(e.target.value)} className={field}>
                  <option value="">Choose…</option>
                  {data.jobs.filter((j) => j.id !== b.jobId).map((j) => <option key={j.id} value={j.id}>{j.jobNo}{j.title ? ` · ${j.title}` : ""}</option>)}
                </select>
              )}</Field>
            </div>
            <div className="w-44"><Field label="Due back">{(id) => <input id={id} type="date" min={data.today} value={moveDue} onChange={(e) => setMoveDue(e.target.value)} className={field} />}</Field></div>
            <Btn disabled={off || !job} onClick={() => run({ type: "plant_move", bookingId: b.id, jobId: Number(job), dueBack: moveDue || null })}>Move</Btn>
          </div>
          <p className="mt-3 text-sm text-muted">Or report a problem:</p>
        </section>
      )}

      <Field label="What's happened?">{(id) => (
        <select id={id} value={what} onChange={(e) => setWhat(e.target.value as typeof what)} className={field}>
          {!lost && <option value="faulty">Faulty / damaged</option>}
          {!lost && <option value="missing">Missing / can&apos;t find it</option>}
          <option value="found">Found it{a.status === "needs_repair" ? " / back in use" : ""}</option>
        </select>
      )}</Field>
      {what === "found" && (
        <Field label="Where is it now?">{(id) => <select id={id} value={where} onChange={(e) => setWhere(e.target.value)} className={field}><WhereOptions data={data} /></select>}</Field>
      )}
      <Field label={what === "found" ? "Note (optional)" : "Note (needed)"}>{(id) => (
        <textarea id={id} value={text} onChange={(e) => setText(e.target.value)} rows={3} spellCheck maxLength={2000} className={field}
          placeholder="What is wrong, or where it was last seen" />
      )}</Field>
      {what === "found" && (lost || a.status === "needs_repair") && <p className="mt-2 text-sm text-muted">The office confirms it&apos;s back in service.</p>}
      {what === "found" && b && <p className="mt-2 text-sm text-muted">This closes job {b.jobNo}&apos;s booking.</p>}
      <div className="mt-4 flex gap-2">
        <Btn main disabled={off} onClick={() => {
          if (what !== "found" && !text.trim()) return setMsg("Add a short note so the office knows what's happened.");
          run({ type: "report_plant", assetId: a.id, kind: what, note: text, location: what === "found" ? where : "" });
        }}>{busy ? "Saving…" : "Save"}</Btn>
        <Btn onClick={close}>Cancel</Btn>
      </div>
      {msg && <p role="alert" className="mt-2 text-sm text-danger">{msg}</p>}
    </div>
  );
}

/* ---------- Stock ---------- */

function Stock({ data, counting, setCounting, name, busy, onReturn, onSend, setNote }: {
  data: YardData; counting: boolean; setCounting: (x: boolean) => void; name: string; busy: boolean; onReturn: () => void;
  onSend: (location: string, counts: { materialId: number; counted: number }[]) => Promise<Reply>; setNote: (r: Reply | null) => void;
}) {
  const [q, setQ] = useState("");
  const [loc, setLoc] = useState("");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [sure, setSure] = useState(false);
  const ws = words(q);
  const places = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of data.materials) for (const s of x.stock) m.set(s.key, s.label);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.materials]);
  // One row per material per location (a count is always for one location).
  const rows = data.materials.flatMap((m) => (m.stock.length ? m.stock : []).map((s) => ({ m, s })))
    .filter(({ m, s }) => (!loc || s.key === loc) && (!ws.length || hit([m.name, m.category, s.label].join(" "), ws)));
  if (counting && loc) {
    for (const m of data.materials) {
      if (!m.stock.some((s) => s.key === loc) && (!ws.length || hit([m.name, m.category].join(" "), ws))) rows.push({ m, s: { key: loc, label: places.find((p) => p[0] === loc)?.[1] ?? "", qty: 0 } });
    }
  }
  const groups = new Map<string, { m: YardMaterial; s: YardMaterial["stock"][number] }[]>();
  for (const r of rows) {
    const k = `${r.s.label} • ${r.m.category || "Other"}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const entered = Object.entries(counts).filter(([, v]) => v.trim() !== "");
  const bad = entered.some(([, v]) => !(Number(v) >= 0));
  const pending = data.stocktakes.filter((s) => s.status === "pending");
  const recent = data.stocktakes.filter((s) => s.status !== "pending").slice(0, 3);

  return (
    <>
      {counting ? (
        <div className="mb-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
          <b>Stock take: {places.find((p) => p[0] === loc)?.[1]}.</b> Enter what is actually there. Leave a line blank if you didn&apos;t count it.
          Lines that differ turn orange. When you&apos;re done, send it to the office to approve.
        </div>
      ) : (
        <>
          {pending.map((s) => (
            <div key={s.id} className="mb-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
              Stock take #{s.id} by {s.countedBy} ({s.location}, {s.lines} lines, {s.differ} different) is <b>waiting for the office to approve</b>.
            </div>
          ))}
          {recent.map((s) => <p key={s.id} className="mb-1.5 text-sm text-muted">Stock take #{s.id} {s.status}{s.decidedBy ? ` by ${s.decidedBy}` : ""}{s.decidedAt ? ` on ${niceDate(s.decidedAt.slice(0, 10))}` : ""}.</p>)}
        </>
      )}
      <Search value={q} onChange={setQ} placeholder="Search stock (name, category)">
        {counting ? (
          <>
            <Btn main disabled={busy || !entered.length || bad} onClick={async () => {
              if (!name) return setNote({ ok: false, message: "Choose your name at the top first." });
              const r = await onSend(loc, entered.map(([id, v]) => ({ materialId: Number(id), counted: Number(v) })));
              if (r.ok) { setCounting(false); setCounts({}); }
              else setNote(r);
            }}>{busy ? "Sending…" : "Send to office"}</Btn>
            <Btn onClick={() => {
              if (entered.length && !sure) return setSure(true);
              setCounting(false); setCounts({}); setSure(false);
            }}>{sure ? "Cancel and lose the counts" : "Cancel"}</Btn>
          </>
        ) : (
          <>
            <select aria-label="Location" value={loc} onChange={(e) => setLoc(e.target.value)} className="rounded-[10px] border border-[#ccc] bg-white p-2.5">
              <option value="">All locations</option>
              {places.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <Btn main onClick={() => {
              if (!name) return setNote({ ok: false, message: "Choose your name at the top first." });
              if (!loc) return setNote({ ok: false, message: "Choose the location you're counting first." });
              setNote(null); setCounting(true); setQ("");
            }}>Start stock take</Btn>
            <Btn onClick={() => { if (!name) return setNote({ ok: false, message: "Choose your name at the top first." }); onReturn(); }}>Materials back from a job</Btn>
          </>
        )}
      </Search>
      {groups.size === 0 && <p className="rounded-xl bg-white p-6 text-center text-muted">Nothing matches.</p>}
      <div data-testid="stock-list">
        {[...groups.keys()].sort().map((k) => (
          <section key={k} aria-label={k} className="mb-3 overflow-hidden rounded-xl border border-line bg-white">
            <h2 className="flex justify-between bg-[#f7f7f5] px-3 py-2 text-sm font-bold"><span>{k}</span><span>{groups.get(k)!.length}</span></h2>
            {groups.get(k)!.sort((a, b) => a.m.name.localeCompare(b.m.name)).map(({ m, s }) => {
              const total = m.stock.reduce((t, x) => t + x.qty, 0);
              const low = m.minLevel != null && total <= m.minLevel;
              const v = counts[m.id] ?? "";
              const differs = v.trim() !== "" && Number(v) !== s.qty;
              return (
                <div key={`${m.id}-${s.key}`} className="flex items-center gap-3 border-t border-line px-3 py-2.5">
                  <span className="min-w-0 flex-1"><b>{m.name}</b>{counting && <span className="block text-xs text-muted">System: {fmt(s.qty)} {m.unit}</span>}</span>
                  {counting ? (
                    <>
                      <input value={v} onChange={(e) => setCounts((c) => ({ ...c, [m.id]: e.target.value }))} inputMode="decimal" placeholder="Count"
                        aria-label={`Counted: ${m.name}`} className={`w-24 rounded-[10px] border p-2 text-base ${differs ? "border-orange-400 bg-orange-50" : "border-[#ccc]"}`} />
                      <span className="w-10 text-sm text-muted">{m.unit}</span>
                    </>
                  ) : (
                    <span className="text-right"><b className={low ? "text-danger" : ""}>{fmt(s.qty)}</b> {m.unit}{low && <span className="block"><Pill tone="red">Low (min {fmt(m.minLevel!)})</Pill></span>}</span>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
      {bad && <p className="text-danger">Counts must be numbers, 0 or more.</p>}
    </>
  );
}

function ReturnBox({ data, name, busy, act, close }: { data: YardData; name: string; busy: boolean; act: (x: Record<string, unknown>) => Promise<Reply>; close: () => void }) {
  const [jobId, setJobId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherUnit, setOtherUnit] = useState("");
  const [qty, setQty] = useState("");
  const [to, setTo] = useState("p:CBS Warehouse");
  const [msg, setMsg] = useState("");
  const other = materialId === "other";
  const m = data.materials.find((x) => String(x.id) === materialId);
  const n = Number(qty.replace(/[,\s]/g, ""));
  return (
    <div className="p-5">
      <p className="text-sm text-muted">Goes straight back into stock.</p>
      <Field label="Material">{(id) => (
        <select id={id} value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={field}>
          <option value="">Choose…</option>
          <option value="other">Something not on the list…</option>
          {data.materials.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
        </select>
      )}</Field>
      {other && (
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <Field label="What is it?">{(id) => <input id={id} value={otherName} onChange={(e) => setOtherName(e.target.value)} spellCheck maxLength={200} className={field} placeholder="e.g. 3m scaffold boards" />}</Field>
          <Field label="Unit (optional)">{(id) => <input id={id} value={otherUnit} onChange={(e) => setOtherUnit(e.target.value)} spellCheck maxLength={30} className={field} />}</Field>
        </div>
      )}
      <Field label={m ? `How many (${m.unit})` : "How many"}>{(id) => <input id={id} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={field} />}</Field>
      <Field label="From job (optional)">{(id) => (
        <select id={id} value={jobId} onChange={(e) => setJobId(e.target.value)} className={field}>
          <option value="">Not from a job</option>
          {data.jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNo}{j.title ? ` · ${j.title}` : ""}</option>)}
        </select>
      )}</Field>
      <Field label="Put back at">{(id) => <select id={id} value={to} onChange={(e) => setTo(e.target.value)} className={field}><WhereOptions data={data} /></select>}</Field>
      {!name && <p className="mt-2 text-sm text-danger">Choose your name at the top first.</p>}
      <div className="mt-4 flex gap-2">
        <Btn main disabled={busy || !name} onClick={async () => {
          if (!(m || (other && otherName.trim())) || !(n > 0)) return setMsg("Choose the material and how much came back.");
          const r = await act({ type: "return_material", materialId: m ? m.id : null, otherName, otherUnit, qty: n, jobId: jobId ? Number(jobId) : null, to, note: "" });
          if (r.ok) close();
          else setMsg(r.message);
        }}>{busy ? "Saving…" : "Back in stock"}</Btn>
        <Btn onClick={close}>Cancel</Btn>
      </div>
      {msg && <p role="alert" className="mt-2 text-sm text-danger">{msg}</p>}
    </div>
  );
}
