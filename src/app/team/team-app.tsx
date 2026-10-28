"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import type { TeamData } from "./data";

// Layout and wording follow the old team page. The name is picked on each form and never remembered.
type Screen = "home" | "check" | "accident" | "request" | { done: string };

const ITEMS = [
  ["tyres_ok", "Tyres and wheels"],
  ["lights_ok", "Lights and indicators"],
  ["fluids_ok", "Fluids, no leaks"],
  ["body_ok", "Body, glass and mirrors"],
  ["first_aid_ok", "First aid kit"],
  ["extinguisher_ok", "Fire extinguisher"],
  ["restraints_ok", "Load restraints"],
] as const;

const field = "w-full rounded-[10px] border border-[#ccc] bg-white p-3 text-base";
const labelCls = "block mt-3.5 text-sm text-[#555]";

// A label linked to its field by id, so the field's accessible name is just the label.
function Labelled({ label, children }: { label: string; children: (id: string) => ReactElement }) {
  const id = useId();
  return (
    <>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children(id)}
    </>
  );
}

function nowLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function TeamApp({ data, teamKey }: { data: TeamData; teamKey: string }) {
  const [screen, setScreen] = useState<Screen>("home");
  const home = () => setScreen("home");

  return (
    <>
      <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-dark px-4 py-3.5 text-white border-b-4 border-brand">
        {screen !== "home" && typeof screen === "string" && (
          <button type="button" onClick={home} className="font-semibold text-[#ffb37a] px-1">‹ Back</button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cbs-logo.png" alt="Chelmsford Building Services" className="h-6 w-auto bg-white rounded px-1" />
        <h1 className="flex-1 text-lg font-semibold m-0">Team</h1>
      </header>
      <div className="mx-auto max-w-[560px] p-4">
        {screen === "home" && <Home data={data} go={setScreen} />}
        {screen === "check" && <CheckForm data={data} teamKey={teamKey} done={(m) => setScreen({ done: m })} />}
        {screen === "accident" && <AccidentForm data={data} teamKey={teamKey} done={(m) => setScreen({ done: m })} />}
        {screen === "request" && <RequestForm data={data} teamKey={teamKey} done={(m) => setScreen({ done: m })} />}
        {typeof screen === "object" && (
          <div className="text-center py-10">
            <div className="text-[54px] text-ok" aria-hidden="true">✓</div>
            <h2 className="text-xl font-semibold" role="status">{screen.done}</h2>
            <button type="button" onClick={home} className="mt-6 block w-full rounded-xl bg-brand p-4 text-[17px] font-bold text-white">Done</button>
          </div>
        )}
      </div>
    </>
  );
}

function Big({ title, sub, onClick, disabled }: { title: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="mb-2.5 block w-full rounded-xl bg-brand px-4 py-[18px] text-left text-lg font-bold text-white disabled:opacity-60">
      {title}
      <span className="mt-1 block text-[13px] font-normal text-[#fde7d6]">{sub}</span>
    </button>
  );
}

const Group = ({ children }: { children: ReactNode }) => (
  <div className="mt-[18px] mb-2 ml-0.5 text-xs font-bold tracking-wide text-muted">{children}</div>
);

function Home({ data, go }: { data: TeamData; go: (s: Screen) => void }) {
  const noVans = data.vehicles.length === 0;
  return (
    <div>
      <Group>VEHICLES</Group>
      <Big title="Vehicle check" sub="Pre-start or weekly check" onClick={() => go("check")} disabled={noVans} />
      <Big title="Report a vehicle accident" sub="Any damage or collision, however small" onClick={() => go("accident")} disabled={noVans} />
      {noVans && <p className="text-sm text-muted mb-2">No vehicles are set up yet. Ask the office.</p>}
      <Group>REQUESTS</Group>
      <Big title="Make a request" sub="Tools, PPE, lost fuel card, anything you need" onClick={() => go("request")} />
    </div>
  );
}

// Sends one report. The same one-time key is kept for retries, so a report that did arrive but whose
// reply was lost isn't saved twice.
function useSend(teamKey: string) {
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  async function send(report: Record<string, unknown>, onOk: () => void) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/team/report", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Team-Key": teamKey },
        body: JSON.stringify({ requestKey: key, report }),
      });
      const r = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; message?: string } | null;
      if (r?.ok || r?.duplicate) onOk();
      else setMsg(r?.message || "Could not send. Check your signal and try again.");
    } catch {
      setMsg("Could not send. Check your signal and try again.");
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, setMsg, send };
}

function NameField({ names, value, onChange }: { names: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Labelled label="Your name">{(id) => (<select id={id} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {names.map((n) => <option key={n}>{n}</option>)}
      </select>)}</Labelled>
  );
}

function SendButton({ busy, children }: { busy: boolean; children: string }) {
  return (
    <button type="submit" disabled={busy} className="mt-[22px] block w-full rounded-xl bg-brand p-4 text-[17px] font-bold text-white disabled:opacity-60">
      {busy ? "Sending..." : children}
    </button>
  );
}

const Msg = ({ text }: { text: string }) => (text ? <p role="alert" className="mt-3 font-semibold text-danger">{text}</p> : null);
const Warn = ({ children }: { children: ReactNode }) => (
  <div className="mt-3 rounded-[10px] border border-danger bg-[#fbdedb] px-3 py-2.5 text-sm">{children}</div>
);

function CheckForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send } = useSend(teamKey);
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [odo, setOdo] = useState("");
  const [items, setItems] = useState<Record<string, boolean>>(() => Object.fromEntries(ITEMS.map(([k]) => [k, true])));
  const [defects, setDefects] = useState("");
  const [safe, setSafe] = useState("yes");
  const faults = ITEMS.filter(([k]) => !items[k]).length;

  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!name) return setMsg("Pick your name.");
      if (!vehicle) return setMsg("Pick a vehicle.");
      if (faults && !defects.trim()) return setMsg("Describe the fault before submitting.");
      send({ type: "check", name, vehicleId: Number(vehicle), odometer: odo, items, defects, safe: safe === "yes" },
        () => done(`Check submitted${faults || safe !== "yes" ? " - faults have been flagged to the office." : "."}`));
    }}>
      <NameField names={data.names} value={name} onChange={setName} />
      <Labelled label="Vehicle">{(id) => (<select id={id} className={field} value={vehicle} onChange={(e) => setVehicle(e.target.value)}>
          <option value="" />
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>)}</Labelled>
      <Labelled label="Odometer (miles)">{(id) => (<input id={id} className={field} inputMode="numeric" value={odo} onChange={(e) => setOdo(e.target.value)} spellCheck={false} />)}</Labelled>
      <span className={labelCls}>Checklist</span>
      {ITEMS.map(([k, l]) => (
        <div key={k} className="mt-2 flex items-center justify-between rounded-[10px] border border-[#ddd] bg-white px-3.5 py-3 text-[15px]">
          <span>{l}</span>
          <span className="flex gap-1.5" role="radiogroup" aria-label={l}>
            {[true, false].map((ok) => (
              <button key={String(ok)} type="button" role="radio" aria-checked={items[k] === ok}
                onClick={() => setItems((s) => ({ ...s, [k]: ok }))}
                className={`rounded-lg border px-3 py-[7px] text-sm font-semibold ${items[k] === ok ? (ok ? "bg-ok border-ok text-white" : "bg-danger border-danger text-white") : "bg-white border-[#ccc]"}`}>
                {ok ? "OK" : "Fault"}
              </button>
            ))}
          </span>
        </div>
      ))}
      <Labelled label="Faults or notes">{(id) => (<textarea id={id} className={`${field} min-h-[90px]`} spellCheck placeholder="Describe anything not right" value={defects} onChange={(e) => setDefects(e.target.value)} />)}</Labelled>
      <Labelled label="Is the vehicle safe to drive?">{(id) => (<select id={id} className={field} value={safe} onChange={(e) => setSafe(e.target.value)}>
          <option value="yes">Yes</option>
          <option value="no">No - take it off the road</option>
        </select>)}</Labelled>
      <SendButton busy={busy}>Submit check</SendButton>
      <Msg text={msg} />
    </form>
  );
}

function AccidentForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send } = useSend(teamKey);
  const [f, setF] = useState({ name: "", vehicle: "", when: nowLocal(), where: "", what: "", damage: "", injuries: "", tp: "", tpReg: "", tpIns: "", police: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const input = (label: string, k: keyof typeof f, extra: Record<string, unknown> = {}) => (
    <Labelled label={label}>{(id) => <input id={id} className={field} spellCheck value={f[k]} onChange={set(k)} {...extra} />}</Labelled>
  );
  const area = (label: string, k: keyof typeof f, placeholder = "") => (
    <Labelled label={label}>{(id) => <textarea id={id} className={`${field} min-h-[90px]`} spellCheck placeholder={placeholder} value={f[k]} onChange={set(k)} />}</Labelled>
  );
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!f.name) return setMsg("Pick your name.");
      if (!f.vehicle) return setMsg("Pick a vehicle.");
      if (!f.what.trim()) return setMsg("Say what happened.");
      send({
        type: "accident", name: f.name, vehicleId: Number(f.vehicle), when: f.when, location: f.where, description: f.what, damage: f.damage,
        injuries: f.injuries, thirdParty: f.tp, thirdPartyReg: f.tpReg, thirdPartyInsurer: f.tpIns, policeEventNo: f.police,
      }, () => done("Accident reported. The office has been notified."));
    }}>
      <NameField names={data.names} value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} />
      <Labelled label="Vehicle">{(id) => (<select id={id} className={field} value={f.vehicle} onChange={set("vehicle")}>
          <option value="" />
          {data.vehicles.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>)}</Labelled>
      {input("When", "when", { type: "datetime-local" })}
      {input("Where", "where")}
      {area("What happened", "what")}
      {area("Damage to our vehicle", "damage")}
      {area("Anyone hurt?", "injuries", "If nobody was hurt, write none")}
      {input("Other party name and phone", "tp")}
      {input("Other party reg", "tpReg", { spellCheck: false })}
      {input("Other party insurer", "tpIns")}
      {input("Police event number (if any)", "police", { spellCheck: false })}
      <Warn>If anyone is seriously hurt, call 999 first.</Warn>
      <SendButton busy={busy}>Send report</SendButton>
      <Msg text={msg} />
    </form>
  );
}

function RequestForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send } = useSend(teamKey);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(data.categories[0] ?? "");
  const [own, setOwn] = useState("");
  const other = category === "Other";
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState("this_week");
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!name) return setMsg("Pick your name.");
      if (other && !own.trim()) return setMsg("Say what it is for.");
      if (!details.trim()) return setMsg("Add some details.");
      send({ type: "request", name, category: other ? own : category, other, details, urgency }, () => done("Request sent to the office."));
    }}>
      <NameField names={data.names} value={name} onChange={setName} />
      <Labelled label="What is it for">{(id) => (<select id={id} className={field} value={category} onChange={(e) => setCategory(e.target.value)}>
          {data.categories.map((c) => <option key={c}>{c}</option>)}
        </select>)}</Labelled>
      {other && (
        <Labelled label="Other: say what it is for">{(id) => (<input id={id} className={field} spellCheck maxLength={60} value={own} onChange={(e) => setOwn(e.target.value)} placeholder="e.g. Ladder" />)}</Labelled>
      )}
      <Labelled label="Details">{(id) => (<textarea id={id} className={`${field} min-h-[90px]`} spellCheck placeholder="e.g. lost the fuel card for van 2, need a new one" value={details} onChange={(e) => setDetails(e.target.value)} />)}</Labelled>
      <Labelled label="How urgent">{(id) => (<select id={id} className={field} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
          <option value="today">Today</option>
          <option value="this_week">This week</option>
          <option value="no_rush">No rush</option>
        </select>)}</Labelled>
      <SendButton busy={busy}>Send request</SendButton>
      <Msg text={msg} />
    </form>
  );
}
