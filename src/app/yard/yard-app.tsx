"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { niceDate } from "../(hub)/_registers/dates";
import { qty as fmt } from "../(hub)/equipment/rules";
import { vehicleLocationLabel } from "../(hub)/fleet/rules";
import type { LoadResult, Sheet } from "../(hub)/_site/load-up";
import { sheetState, STATE_LABELS } from "../(hub)/_site/load-up-rules";
import { LoadScreen } from "../(hub)/_site/load-screen";
import type { YardData } from "./data";

// The yard tablet. Wording and layout follow the team app. The name is picked on every action and
// cleared afterwards (a shared device).
type Screen = "home" | "loadups" | { sheet: number } | "back" | "report" | "return" | "count" | { done: string };

const field = "w-full rounded-[10px] border border-[#ccc] bg-white p-3 text-base";
const labelCls = "block mt-3.5 text-sm text-[#555]";
const SIGNAL = "It didn't send. Check the signal and try again.";

function Labelled({ label, children }: { label: string; children: (id: string) => ReactElement }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children(id)}
    </>
  );
}

// One request key per attempt: kept if the reply is lost (a resend is then recognised), changed
// after any answer that says nothing was saved.
function useSend(teamKey: string) {
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(action: Record<string, unknown>): Promise<{ ok: boolean; message: string }> {
    if (busy) return { ok: false, message: "" };
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/yard", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Team-Key": teamKey },
        body: JSON.stringify({ requestKey: key, action }),
      });
      const r = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; message?: string } | null;
      if (r?.ok || r?.duplicate) return { ok: true, message: r.ok ? r.message ?? "Saved." : "Saved." };
      setKey(crypto.randomUUID());
      const m = r?.message || SIGNAL;
      setMsg(m);
      return { ok: false, message: m };
    } catch {
      setMsg(SIGNAL);
      return { ok: false, message: SIGNAL };
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, send };
}

function NamePick({ names, value, onChange }: { names: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Labelled label="Your name">
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
          <option value="">Choose your name…</option>
          {names.map((n) => <option key={n}>{n}</option>)}
        </select>
      )}
    </Labelled>
  );
}

// Places and vans that hold stock (no "add new" here: places are added by the office).
function WhereSelect({ data, label, value, onChange }: { data: YardData; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Labelled label={label}>
      {(id) => (
        <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
          <optgroup label="Places">{data.locations.places.map((p) => <option key={p} value={`p:${p}`}>{p}</option>)}</optgroup>
          <optgroup label="Vans">
            {data.locations.vehicles.filter((v) => v.holdsStock).map((v) => <option key={v.id} value={`v:${v.id}`}>{vehicleLocationLabel(v)}</option>)}
          </optgroup>
        </select>
      )}
    </Labelled>
  );
}

const Btn = ({ children, onClick, disabled, kind = "main" }: { children: ReactNode; onClick: () => void; disabled?: boolean; kind?: "main" | "plain" }) => (
  <button type="button" onClick={onClick} disabled={disabled}
    className={`mt-4 block w-full rounded-xl p-4 text-[17px] font-bold disabled:opacity-60 ${kind === "main" ? "bg-brand text-white" : "border border-[#ccc] bg-white"}`}>
    {children}
  </button>
);
const Msg = ({ text }: { text: string }) => (text ? <p role="alert" className="mt-3 text-danger">{text}</p> : null);

export function YardApp({ data, teamKey }: { data: YardData; teamKey: string }) {
  const [screen, setScreen] = useState<Screen>("home");
  const router = useRouter();
  const home = () => setScreen("home");
  const done = (m: string) => {
    setScreen({ done: m });
    router.refresh();
  };
  const toLoad = data.sheets.filter((s) => s.status === "ready");

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-dark px-4 py-3.5 text-white border-b-4 border-brand">
        {screen !== "home" && !(typeof screen === "object" && "done" in screen) && (
          <button type="button" onClick={home} className="font-semibold text-[#ffb37a] px-1">‹ Back</button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cbs-logo.png" alt="Chelmsford Building Services" className="h-6 w-auto bg-white rounded px-1" />
        <h1 className="flex-1 text-lg font-semibold m-0">Yard</h1>
      </header>
      <div className="mx-auto max-w-[760px] p-4">
        {screen === "home" && (
          <>
            <Big title={`Load-ups${toLoad.length ? ` (${toLoad.length} to load)` : ""}`} sub="Tick off what goes in the van" onClick={() => setScreen("loadups")} />
            <Big title={`Plant back in${data.out.length ? ` (${data.out.length} out)` : ""}`} sub="Equipment back from a job" onClick={() => setScreen("back")} />
            <Big title="Report plant" sub="Faulty, missing or found" onClick={() => setScreen("report")} />
            <Big title="Materials returned" sub="Back from a job" onClick={() => setScreen("return")} />
            <Big title="Stocktake" sub="Count what's at a location" onClick={() => setScreen("count")} />
          </>
        )}
        {screen === "loadups" && <LoadUps data={data} open={(id) => setScreen({ sheet: id })} />}
        {typeof screen === "object" && "sheet" in screen && (
          <LoadOne key={screen.sheet} data={data} teamKey={teamKey} sheet={data.sheets.find((s) => s.id === screen.sheet) ?? null} done={done} />
        )}
        {screen === "back" && <PlantBack data={data} teamKey={teamKey} done={done} />}
        {screen === "report" && <ReportPlant data={data} teamKey={teamKey} done={done} />}
        {screen === "return" && <ReturnMaterial data={data} teamKey={teamKey} done={done} />}
        {screen === "count" && <Count data={data} teamKey={teamKey} done={done} />}
        {typeof screen === "object" && "done" in screen && (
          <div className="text-center py-10">
            <div className="text-[54px] text-ok" aria-hidden="true">✓</div>
            <h2 className="text-xl font-semibold" role="status">{screen.done}</h2>
            <Btn onClick={home}>Done</Btn>
          </div>
        )}
      </div>
    </>
  );
}

function Big({ title, sub, onClick }: { title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="mb-2.5 block w-full rounded-xl bg-brand px-4 py-[18px] text-left text-lg font-bold text-white">
      {title}
      <span className="mt-1 block text-[13px] font-normal text-[#fde7d6]">{sub}</span>
    </button>
  );
}

function LoadUps({ data, open }: { data: YardData; open: (id: number) => void }) {
  const list = [...data.sheets].sort((a, b) => (a.status === b.status ? a.sheetDate.localeCompare(b.sheetDate) : a.status === "ready" ? -1 : 1));
  return (
    <div>
      <h2 className="mb-3 text-xl font-semibold">Load-ups</h2>
      {list.length === 0 && <p className="text-muted">Nothing to load. Sheets show here once the office sends them to the crew.</p>}
      <ul className="space-y-2.5">
        {list.map((s) => {
          const st = sheetState(s, data.today);
          return (
            <li key={s.id}>
              <button type="button" onClick={() => open(s.id)} className="block w-full rounded-xl border border-line bg-white p-4 text-left">
                <span className="flex items-center gap-2">
                  <strong className="flex-1">Job {s.jobNo}{s.site ? ` · ${s.site}` : ""}</strong>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st === "overdue" ? "bg-red-50 text-danger" : st === "loaded" ? "bg-green-50 text-ok" : "bg-orange-50 text-orange-800"}`}>
                    {st === "ready" ? "To load" : STATE_LABELS[st]}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted">{niceDate(s.sheetDate)} · {s.vehicleLabel || "No van"} · {s.lines.length} lines</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LoadOne({ data, teamKey, sheet, done }: { data: YardData; teamKey: string; sheet: Sheet | null; done: (m: string) => void }) {
  const [name, setName] = useState("");
  const { send } = useSend(teamKey);
  if (!sheet) return <p>That sheet is no longer here. Go back and try again.</p>;
  return (
    <div className="rounded-xl bg-white p-4">
      <h2 className="mb-3 text-xl font-semibold">Load up: job {sheet.jobNo}</h2>
      <LoadScreen sheet={sheet} ready={!!name} blocked="Choose your name first."
        nameSlot={sheet.status === "ready" ? <div className="mb-4"><NamePick names={data.names} value={name} onChange={setName} /></div> : null}
        onLoad={async (results: LoadResult[], extra: string) => {
          const r = await send({ type: "load", name, sheetId: sheet.id, results, extra });
          if (r.ok) done(r.message);
          return r;
        }}
        onReport={async (text) => {
          const r = await send({ type: "problem", name, sheetId: sheet.id, text });
          if (r.ok) done(r.message);
          return r;
        }} />
    </div>
  );
}

function PlantBack({ data, teamKey, done }: { data: YardData; teamKey: string; done: (m: string) => void }) {
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [to, setTo] = useState("p:CBS Warehouse");
  const { busy, msg, send } = useSend(teamKey);
  const shown = data.out.filter((o) => !q.trim() || [o.label, o.jobNo, o.outWith, o.category].some((x) => x.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Plant back in</h2>
      <NamePick names={data.names} value={name} onChange={setName} />
      <WhereSelect data={data} label="Back to" value={to} onChange={setTo} />
      <Labelled label="Search">{(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} className={field} placeholder="Name, tag, job or van" />}</Labelled>
      <Msg text={msg} />
      <ul className="mt-3 space-y-2" data-testid="plant-out">
        {shown.length === 0 && <li className="text-muted">{data.out.length ? "Nothing matches." : "No plant is out on a job."}</li>}
        {shown.map((o) => (
          <li key={o.id} className="flex items-center gap-3 rounded-xl border border-line bg-white p-3">
            <span className="flex-1 min-w-0">
              <strong>{o.label}</strong>
              <span className="block text-sm text-muted">Job {o.jobNo} · {o.outWith}{o.dueBack ? ` · due back ${niceDate(o.dueBack)}` : ""}</span>
            </span>
            <button type="button" disabled={busy || !name} onClick={async () => { const r = await send({ type: "return_plant", name, bookingId: o.id, to }); if (r.ok) done(`${o.label}: ${r.message}`); }}
              className="rounded-lg bg-brand px-4 py-2 font-bold text-white disabled:opacity-50" aria-label={`Back in: ${o.label}`}>Back in</button>
          </li>
        ))}
      </ul>
      {!name && data.out.length > 0 && <p className="mt-2 text-sm text-muted">Choose your name first.</p>}
    </div>
  );
}

function ReportPlant({ data, teamKey, done }: { data: YardData; teamKey: string; done: (m: string) => void }) {
  const [name, setName] = useState("");
  const [assetId, setAssetId] = useState("");
  const [kind, setKind] = useState<"faulty" | "missing" | "found">("faulty");
  const [note, setNote] = useState("");
  const { busy, msg, send } = useSend(teamKey);
  const list = data.assets.filter((a) => (kind === "found" ? a.status === "lost" || a.status === "needs_repair" : a.status !== "lost"));
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Report plant</h2>
      <p className="text-sm text-muted">The office checks it and updates the register.</p>
      <NamePick names={data.names} value={name} onChange={setName} />
      <fieldset className="mt-3.5">
        <legend className="text-sm text-[#555]">What&apos;s happened?</legend>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {([["faulty", "Faulty"], ["missing", "Missing"], ["found", "Found"]] as const).map(([v, l]) => (
            <label key={v} className={`rounded-xl border p-3 text-center font-semibold cursor-pointer ${kind === v ? "border-brand bg-orange-50" : "border-[#ccc] bg-white"}`}>
              <input type="radio" name="kind" value={v} checked={kind === v} onChange={() => { setKind(v); setAssetId(""); }} className="sr-only" />{l}
            </label>
          ))}
        </div>
      </fieldset>
      <Labelled label="Which item?">
        {(id) => (
          <select id={id} value={assetId} onChange={(e) => setAssetId(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {list.map((a) => <option key={a.id} value={a.id}>{a.label} ({a.location})</option>)}
          </select>
        )}
      </Labelled>
      <Labelled label={kind === "faulty" ? "What's wrong with it?" : kind === "missing" ? "Where was it last seen?" : "Note (optional)"}>
        {(id) => <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} rows={3} spellCheck maxLength={2000} className={field} />}
      </Labelled>
      <Msg text={msg} />
      <Btn disabled={busy || !name || !assetId} onClick={async () => {
        const r = await send({ type: "report_plant", name, assetId: Number(assetId), kind, note });
        if (r.ok) done(r.message);
      }}>{busy ? "Sending…" : "Send to the office"}</Btn>
    </div>
  );
}

function ReturnMaterial({ data, teamKey, done }: { data: YardData; teamKey: string; done: (m: string) => void }) {
  const [name, setName] = useState("");
  const [jobId, setJobId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [otherName, setOtherName] = useState("");
  const [otherUnit, setOtherUnit] = useState("");
  const [qty, setQty] = useState("");
  const [to, setTo] = useState("p:CBS Warehouse");
  const [note, setNote] = useState("");
  const { busy, msg, send } = useSend(teamKey);
  const other = materialId === "other";
  const m = data.materials.find((x) => String(x.id) === materialId);
  const n = Number(qty.replace(/[,\s]/g, ""));
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Materials returned</h2>
      <NamePick names={data.names} value={name} onChange={setName} />
      <Labelled label="From job (optional)">
        {(id) => (
          <select id={id} value={jobId} onChange={(e) => setJobId(e.target.value)} className={field}>
            <option value="">Not from a job</option>
            {data.jobs.map((j) => <option key={j.id} value={j.id}>{j.jobNo}{j.title ? ` · ${j.title}` : ""}</option>)}
          </select>
        )}
      </Labelled>
      <Labelled label="Material">
        {(id) => (
          <select id={id} value={materialId} onChange={(e) => setMaterialId(e.target.value)} className={field}>
            <option value="">Choose…</option>
            {data.materials.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
            <option value="other">Not on the list</option>
          </select>
        )}
      </Labelled>
      {other && (
        <div className="grid grid-cols-[1fr_8rem] gap-2">
          <Labelled label="What is it?">{(id) => <input id={id} value={otherName} onChange={(e) => setOtherName(e.target.value)} spellCheck maxLength={200} className={field} />}</Labelled>
          <Labelled label="Unit">{(id) => <input id={id} value={otherUnit} onChange={(e) => setOtherUnit(e.target.value)} spellCheck maxLength={30} className={field} placeholder="e.g. bag" />}</Labelled>
        </div>
      )}
      <Labelled label={m ? `How many (${m.unit})` : "How many"}>{(id) => <input id={id} value={qty} onChange={(e) => setQty(e.target.value)} inputMode="decimal" className={field} />}</Labelled>
      <WhereSelect data={data} label="Put back at" value={to} onChange={setTo} />
      <Labelled label="Note (optional)">{(id) => <input id={id} value={note} onChange={(e) => setNote(e.target.value)} spellCheck maxLength={2000} className={field} />}</Labelled>
      <Msg text={msg} />
      <Btn disabled={busy || !name || !(m || (other && otherName.trim())) || !(n > 0)} onClick={async () => {
        const r = await send({ type: "return_material", name, materialId: m ? m.id : null, otherName, otherUnit, qty: n, jobId: jobId ? Number(jobId) : null, to, note });
        if (r.ok) done(r.message);
      }}>{busy ? "Sending…" : "Put back on stock"}</Btn>
    </div>
  );
}

function Count({ data, teamKey, done }: { data: YardData; teamKey: string; done: (m: string) => void }) {
  const [name, setName] = useState("");
  const [where, setWhere] = useState("p:CBS Warehouse");
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const { busy, msg, send } = useSend(teamKey);
  // Materials with stock here first, then the rest (in case something is here that the register doesn't know).
  const here = (id: number) => data.materials.find((x) => x.id === id)?.stock.find((s) => s.key.toLowerCase() === where.toLowerCase())?.qty;
  const list = data.materials.filter((x) => !q.trim() || x.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => Number(here(b.id) != null) - Number(here(a.id) != null) || a.name.localeCompare(b.name));
  const entered = Object.entries(counts).filter(([, v]) => v.trim() !== "");
  const bad = entered.some(([, v]) => !(Number(v) >= 0) || Number.isNaN(Number(v)));
  return (
    <div>
      <h2 className="mb-1 text-xl font-semibold">Stocktake</h2>
      <p className="text-sm text-muted">Count what&apos;s there. The office checks the differences before stock changes.</p>
      <NamePick names={data.names} value={name} onChange={setName} />
      <WhereSelect data={data} label="Where are you counting?" value={where} onChange={(v) => { setWhere(v); setCounts({}); }} />
      <Labelled label="Search">{(id) => <input id={id} value={q} onChange={(e) => setQ(e.target.value)} className={field} placeholder="Material" />}</Labelled>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white" data-testid="count-list">
        {list.map((x) => (
          <li key={x.id} className="flex items-center gap-3 p-3">
            <span className="flex-1 min-w-0">
              <strong>{x.name}</strong>
              <span className="block text-xs text-muted">{here(x.id) != null ? `Register says ${fmt(here(x.id)!)} ${x.unit}` : "None on the register here"}</span>
            </span>
            <input value={counts[x.id] ?? ""} onChange={(e) => setCounts((c) => ({ ...c, [x.id]: e.target.value }))} inputMode="decimal"
              aria-label={`Counted: ${x.name}`} className="w-24 rounded-[10px] border border-[#ccc] p-2 text-base" />
            <span className="w-10 text-sm text-muted">{x.unit}</span>
          </li>
        ))}
      </ul>
      <Labelled label="Note (optional)">{(id) => <input id={id} value={note} onChange={(e) => setNote(e.target.value)} spellCheck maxLength={2000} className={field} />}</Labelled>
      {bad && <p className="mt-2 text-danger">Counts must be numbers, 0 or more.</p>}
      <Msg text={msg} />
      <Btn disabled={busy || !name || !entered.length || bad} onClick={async () => {
        const r = await send({ type: "stocktake", name, location: where, note, counts: entered.map(([id, v]) => ({ materialId: Number(id), counted: Number(v) })) });
        if (r.ok) done(r.message);
      }}>{busy ? "Sending…" : `Send ${entered.length} count${entered.length === 1 ? "" : "s"} to the office`}</Btn>
    </div>
  );
}
