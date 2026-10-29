"use client";

import { useId, useState, type ReactElement, type ReactNode } from "react";
import type { TeamData } from "./data";

// Layout and wording follow the old team page. The name is picked on each form and never remembered.
type Screen = "home" | "check" | "accident" | "request" | "tool" | { done: string };

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
        {screen === "tool" && <ToolForm data={data} teamKey={teamKey} done={(m) => setScreen({ done: m })} />}
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
      <Group>TOOLS</Group>
      <Big title="Report a lost, stolen or damaged tool" sub="Report it and ask for a replacement" onClick={() => go("tool")} />
    </div>
  );
}

const MAX_PHOTOS = 4;
const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
const SIGNAL = "Could not send. Check your signal and try again.";

// Phone photos are often bigger than 4 MB: shrink them to at most 2000 px as a JPEG before sending.
// If the phone can't read the photo (some HEIC files), it is sent as it is and the server decides.
async function shrink(file: File): Promise<File> {
  if (file.size <= MAX_PHOTO_BYTES && /^image\/(jpeg|png)$/.test(file.type)) return file;
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85));
    return blob ? new File([blob], file.name.replace(/\.[^.]*$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file;
  }
}

// Sends one report, then its photos. The same one-time key is kept for retries, so a report that did
// arrive but whose reply was lost isn't saved twice (the server hands back its photo ticket instead).
// Photos that fail can be sent again, or skipped: the report itself is already with the office.
function useSend(teamKey: string) {
  const [key] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [progress, setProgress] = useState("");
  const [ticket, setTicket] = useState<string | null>(null);
  const [left, setLeft] = useState<{ slot: number; file: File }[]>([]);

  async function sendPhotos(t: string, list: { slot: number; file: File }[]): Promise<{ slot: number; file: File }[]> {
    const failed: { slot: number; file: File }[] = [];
    for (let i = 0; i < list.length; i++) {
      setProgress(`Sending photo ${i + 1} of ${list.length}...`);
      try {
        const body = new FormData();
        body.set("ticket", t);
        body.set("slot", String(list[i].slot));
        body.set("file", await shrink(list[i].file));
        const res = await fetch("/api/team/photo", { method: "POST", headers: { "X-Team-Key": teamKey }, body });
        const r = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; message?: string } | null;
        if (!(r?.ok || r?.duplicate)) failed.push(list[i]);
      } catch {
        failed.push(list[i]);
      }
    }
    setProgress("");
    return failed;
  }

  async function send(report: Record<string, unknown>, photos: File[], onOk: () => void) {
    if (busy) return;
    setBusy(true);
    setMsg("");
    try {
      let t = ticket;
      let list = left;
      if (!t) {
        const res = await fetch("/api/team/report", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Team-Key": teamKey },
          body: JSON.stringify({ requestKey: key, report }),
        });
        const r = (await res.json().catch(() => null)) as { ok?: boolean; duplicate?: boolean; message?: string; photoTicket?: string | null } | null;
        if (!(r?.ok || r?.duplicate)) return setMsg(r?.message || SIGNAL);
        if (!photos.length || !r.photoTicket) return onOk();
        t = r.photoTicket;
        list = photos.map((file, i) => ({ slot: i + 1, file }));
        setTicket(t);
      }
      const failed = await sendPhotos(t, list);
      if (!failed.length) return onOk();
      setLeft(failed);
      setMsg(`Your report was sent, but ${failed.length === 1 ? "1 photo" : `${failed.length} photos`} didn't. Check your signal and tap Send photos again, or Skip photos.`);
    } catch {
      setMsg(SIGNAL);
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  // After the report is in, only the photos are left to send.
  const reportSent = ticket !== null && left.length > 0;
  return { busy, msg, setMsg, send, progress, reportSent };
}

// A stable key for each picked photo, so removing one doesn't reload the others' previews.
const ids = new WeakMap<File, number>();
let nextId = 0;
const photoId = (f: File) => ids.get(f) ?? (ids.set(f, ++nextId), nextId);

function Thumb({ file, label }: { file: File; label: string }) {
  // A preview link for this photo. Not revoked: a form holds 4 photos at most, freed when the page closes.
  const [url] = useState(() => URL.createObjectURL(file));
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={label} className="h-20 w-full rounded-lg object-cover border border-[#ccc]" />;
}

// Up to 4 photos, from the camera or the phone's gallery. Removing one before sending needs no check.
function PhotoField({ photos, onChange, locked }: { photos: File[]; onChange: (p: File[]) => void; locked: boolean }) {
  const id = useId();
  const full = photos.length >= MAX_PHOTOS;
  return (
    <div>
      <span className={labelCls}>Photos (up to {MAX_PHOTOS})</span>
      {photos.length > 0 && (
        <ul className="mt-2 grid grid-cols-4 gap-2" aria-label="Photos to send">
          {photos.map((p, i) => (
            <li key={photoId(p)} className="relative">
              <Thumb file={p} label={`Photo ${i + 1}`} />
              {!locked && (
                <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => onChange(photos.filter((_, k) => k !== i))}
                  className="absolute -right-1.5 -top-1.5 h-7 w-7 rounded-full bg-dark text-white text-sm font-bold">×</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!locked && !full && (
        <>
          <label htmlFor={id} className="mt-2 inline-block cursor-pointer rounded-[10px] border border-dark bg-white px-4 py-2.5 font-semibold">Add photos</label>
          <input id={id} type="file" accept="image/*" multiple className="sr-only"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              e.target.value = "";
              onChange([...photos, ...picked].slice(0, MAX_PHOTOS));
            }} />
        </>
      )}
    </div>
  );
}

function NameField({ names, value, onChange }: { names: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <Labelled label="Your name">{(id) => (<select id={id} className={field} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" />
        {names.map((n) => <option key={n}>{n}</option>)}
      </select>)}</Labelled>
  );
}

function SendButton({ busy, progress, reportSent, children, onSkip }: {
  busy: boolean; progress: string; reportSent: boolean; children: string; onSkip: () => void;
}) {
  return (
    <>
      <button type="submit" disabled={busy} className="mt-[22px] block w-full rounded-xl bg-brand p-4 text-[17px] font-bold text-white disabled:opacity-60">
        {busy ? progress || "Sending..." : reportSent ? "Send photos again" : children}
      </button>
      {reportSent && !busy && (
        <button type="button" onClick={onSkip} className="mt-2.5 block w-full rounded-xl border border-dark bg-white p-3.5 text-base font-semibold">Skip photos</button>
      )}
    </>
  );
}

const Msg = ({ text }: { text: string }) => (text ? <p role="alert" className="mt-3 font-semibold text-danger">{text}</p> : null);
const Warn = ({ children }: { children: ReactNode }) => (
  <div className="mt-3 rounded-[10px] border border-danger bg-[#fbdedb] px-3 py-2.5 text-sm">{children}</div>
);

function CheckForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send, progress, reportSent } = useSend(teamKey);
  const [photos, setPhotos] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [odo, setOdo] = useState("");
  const [items, setItems] = useState<Record<string, boolean>>(() => Object.fromEntries(ITEMS.map(([k]) => [k, true])));
  const [defects, setDefects] = useState("");
  const [safe, setSafe] = useState("yes");
  const faults = ITEMS.filter(([k]) => !items[k]).length;
  const finish = () => done(`Check submitted${faults || safe !== "yes" ? " - faults have been flagged to the office." : "."}`);

  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!reportSent) {
        if (!name) return setMsg("Pick your name.");
        if (!vehicle) return setMsg("Pick a vehicle.");
        if (faults && !defects.trim()) return setMsg("Describe the fault before submitting.");
      }
      send({ type: "check", name, vehicleId: Number(vehicle), odometer: odo, items, defects, safe: safe === "yes" }, photos, finish);
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
      <PhotoField photos={photos} onChange={setPhotos} locked={busy || reportSent} />
      <SendButton busy={busy} progress={progress} reportSent={reportSent} onSkip={finish}>Submit check</SendButton>
      <Msg text={msg} />
    </form>
  );
}

function AccidentForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send, progress, reportSent } = useSend(teamKey);
  const [photos, setPhotos] = useState<File[]>([]);
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
      if (!reportSent) {
        if (!f.name) return setMsg("Pick your name.");
        if (!f.vehicle) return setMsg("Pick a vehicle.");
        if (!f.what.trim()) return setMsg("Say what happened.");
      }
      send({
        type: "accident", name: f.name, vehicleId: Number(f.vehicle), when: f.when, location: f.where, description: f.what, damage: f.damage,
        injuries: f.injuries, thirdParty: f.tp, thirdPartyReg: f.tpReg, thirdPartyInsurer: f.tpIns, policeEventNo: f.police,
      }, photos, () => done("Accident reported. The office has been notified."));
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
      <PhotoField photos={photos} onChange={setPhotos} locked={busy || reportSent} />
      <SendButton busy={busy} progress={progress} reportSent={reportSent} onSkip={() => done("Accident reported. The office has been notified.")}>Send report</SendButton>
      <Msg text={msg} />
    </form>
  );
}

function RequestForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send, progress, reportSent } = useSend(teamKey);
  const [photos, setPhotos] = useState<File[]>([]);
  const [name, setName] = useState("");
  const [category, setCategory] = useState(data.categories[0] ?? "");
  const [own, setOwn] = useState("");
  const other = category === "Other";
  const [details, setDetails] = useState("");
  const [urgency, setUrgency] = useState("this_week");
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!reportSent) {
        if (!name) return setMsg("Pick your name.");
        if (other && !own.trim()) return setMsg("Say what it is for.");
        if (!details.trim()) return setMsg("Add some details.");
      }
      send({ type: "request", name, category: other ? own : category, other, details, urgency }, photos, () => done("Request sent to the office."));
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
      <PhotoField photos={photos} onChange={setPhotos} locked={busy || reportSent} />
      <SendButton busy={busy} progress={progress} reportSent={reportSent} onSkip={() => done("Request sent to the office.")}>Send request</SendButton>
      <Msg text={msg} />
    </form>
  );
}

function ToolForm({ data, teamKey, done }: { data: TeamData; teamKey: string; done: (m: string) => void }) {
  const { busy, msg, setMsg, send, progress, reportSent } = useSend(teamKey);
  const [photos, setPhotos] = useState<File[]>([]);
  const [f, setF] = useState({ name: "", kind: "Lost", tool: "", toolName: "", when: nowLocal(), where: "", police: "", details: "", wants: "no", repair: "", urgency: "this_week", notes: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const other = f.tool === "other" || data.tools.length === 0;
  const finish = () => done(f.wants === "yes" ? "Report sent and a replacement has been requested."
    : f.wants === "repair" ? "Report sent and a repair has been requested." : "Report sent to the office.");
  return (
    <form noValidate onSubmit={(e) => {
      e.preventDefault();
      if (!reportSent) {
        if (!f.name) return setMsg("Pick your name.");
        if (data.tools.length && !f.tool) return setMsg("Pick the tool, or choose Not on the list.");
        if (other && !f.toolName.trim()) return setMsg("Type the tool name.");
      }
      send({
        type: "tool", name: f.name, kind: f.kind.toLowerCase(), assetId: other ? null : Number(f.tool), toolName: other ? f.toolName : "",
        when: f.when, location: f.where, policeRef: f.kind === "Stolen" ? f.police : "", details: f.details,
        wants: f.wants === "yes" ? "replace" : f.wants === "repair" ? "repair" : "none", urgency: f.urgency,
        repairNotes: f.wants === "repair" ? f.repair : "", replaceNotes: f.wants !== "no" ? f.notes : "",
      }, photos, finish);
    }}>
      <NameField names={data.names} value={f.name} onChange={(v) => setF((s) => ({ ...s, name: v }))} />
      <Labelled label="What happened">{(id) => (<select id={id} className={field} value={f.kind} onChange={set("kind")}>
          {["Lost", "Stolen", "Damaged"].map((k) => <option key={k}>{k}</option>)}
        </select>)}</Labelled>
      {data.tools.length > 0 && (
        <Labelled label="Which tool">{(id) => (<select id={id} className={field} value={f.tool} onChange={set("tool")}>
            <option value="" />
            {data.tools.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            <option value="other">Not on the list</option>
          </select>)}</Labelled>
      )}
      {other && <Labelled label="Tool name">{(id) => <input id={id} className={field} spellCheck value={f.toolName} onChange={set("toolName")} placeholder="e.g. Makita grinder" />}</Labelled>}
      <Labelled label="When">{(id) => <input id={id} type="datetime-local" className={field} value={f.when} onChange={set("when")} />}</Labelled>
      <Labelled label="Where">{(id) => <input id={id} className={field} spellCheck value={f.where} onChange={set("where")} placeholder="Site address, van or location" />}</Labelled>
      {f.kind === "Stolen" && (
        <Labelled label="Police event number (if reported)">{(id) => <input id={id} className={field} spellCheck={false} value={f.police} onChange={set("police")} />}</Labelled>
      )}
      <Labelled label="What happened / details">{(id) => (
        <textarea id={id} className={`${field} min-h-[90px]`} spellCheck placeholder="How it was lost, stolen or damaged" value={f.details} onChange={set("details")} />
      )}</Labelled>
      <PhotoField photos={photos} onChange={setPhotos} locked={busy || reportSent} />
      <Group>REPLACEMENT</Group>
      <Labelled label="Do you need it replaced or repaired?">{(id) => (<select id={id} className={field} value={f.wants} onChange={set("wants")}>
          <option value="no">No</option>
          <option value="yes">Yes - request a replacement</option>
          <option value="repair">Repair it - it can be fixed</option>
        </select>)}</Labelled>
      {f.wants === "repair" && (
        <>
          <Labelled label="What needs repairing">{(id) => (
            <textarea id={id} className={`${field} min-h-[70px]`} spellCheck placeholder="What is wrong with it and what needs fixing" value={f.repair} onChange={set("repair")} />
          )}</Labelled>
          <p className="mt-1 text-[13px] text-muted">Add a photo of the damage using Photos above.</p>
        </>
      )}
      {f.wants !== "no" && (
        <>
          {f.kind === "Stolen" ? (
            <p className="mt-3 text-sm text-muted">A stolen tool is always asked for today.</p>
          ) : (
            <Labelled label="How urgent">{(id) => (<select id={id} className={field} value={f.urgency} onChange={set("urgency")}>
                <option value="today">Today</option>
                <option value="this_week">This week</option>
                <option value="no_rush">No rush</option>
              </select>)}</Labelled>
          )}
          <Labelled label="Anything else about it (optional)">{(id) => (
            <textarea id={id} className={`${field} min-h-[70px]`} spellCheck placeholder="e.g. same model, or a bigger size" value={f.notes} onChange={set("notes")} />
          )}</Labelled>
        </>
      )}
      <SendButton busy={busy} progress={progress} reportSent={reportSent} onSkip={finish}>Send report</SendButton>
      <Msg text={msg} />
    </form>
  );
}
