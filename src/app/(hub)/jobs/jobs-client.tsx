"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { SearchBox } from "@/components/ui/search-box";
import { STAGES, jobTitle, shownByDefault, stageOf } from "@/lib/jobs/stages";
import type { Folder, JobListRow } from "./data";

const SEL_KEY = "cbs-hub.jobs.folders";
const UNSUCCESSFUL_KEY = "cbs-hub.jobs.unsuccessful";
const BOOKED = "booked";
const NO_FOLDER = "nofolder";

type Section = { key: string; name: string };

function readStore<T>(key: string, fallback: T): T {
  try {
    const v = window.localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeStore(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private window or blocked storage: choices last until the page is closed.
  }
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const money = (n: number) => n.toLocaleString("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });

// Where a job is listed: its folder; Work Orders with no folder under "Booked / on site"; Quotes (and,
// when shown, Unsuccessful jobs) with no folder under "No folder". Completed jobs with no folder aren't listed.
function sectionOf(j: JobListRow): string | null {
  if (j.folderUuid) return j.folderUuid;
  if (j.status === "Work Order") return BOOKED;
  if (j.status === "Quote" || j.stage === "unsuccessful") return NO_FOLDER;
  return null;
}

function bookingChip(j: JobListRow): { text: string; tone: string } | null {
  const now = Date.now();
  if (j.nextBooking && new Date(j.nextBooking).getTime() > now) return { text: `Booked ${day(j.nextBooking)}`, tone: "chg" };
  if (j.bookedUntil) {
    const t = new Date(j.bookedUntil).getTime();
    return t >= now ? { text: `Booked until ${day(j.bookedUntil)}`, tone: "chg" } : { text: `Last on site ${day(j.bookedUntil)}`, tone: "chn" };
  }
  return j.status === "Work Order" ? { text: "Not booked", tone: "cha" } : null;
}
const TONES: Record<string, string> = {
  chg: "bg-[#e6f4ea] text-[#1a7f37]",
  cha: "bg-[#fff1d6] text-[#8a5300]",
  chn: "bg-[#ececea] text-[#3d4043]",
};

export function JobsClient({ folders, jobs }: { folders: Folder[]; jobs: JobListRow[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<Record<string, boolean> | null>(null);
  const [showUnsuccessful, setShowUnsuccessful] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    // Remembered per device (read after first render: the server has no localStorage).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChosen(readStore<Record<string, boolean> | null>(SEL_KEY, null));
    setShowUnsuccessful(readStore<boolean>(UNSUCCESSFUL_KEY, false));
  }, []);

  const sections: Section[] = useMemo(() => {
    const known = new Set(folders.map((f) => f.uuid));
    const extra = new Set<string>();
    for (const j of jobs) if (j.folderUuid && !known.has(j.folderUuid)) extra.add(j.folderUuid);
    return [
      ...folders.map((f) => ({ key: f.uuid, name: f.name })),
      ...[...extra].map((u) => ({ key: u, name: "Folder not synced yet" })),
      { key: BOOKED, name: "Booked / on site" },
      { key: NO_FOLDER, name: "No folder" },
    ];
  }, [folders, jobs]);

  const isShown = (s: Section) => (chosen && s.key in chosen ? chosen[s.key] : shownByDefault(s.name));
  const toggle = (s: Section) => {
    const next = { ...(chosen || {}) };
    for (const x of sections) if (!(x.key in next)) next[x.key] = shownByDefault(x.name);
    next[s.key] = !isShown(s);
    setChosen(next);
    writeStore(SEL_KEY, next);
  };
  const showAll = () => {
    const next = Object.fromEntries(sections.map((s) => [s.key, true]));
    setChosen(next);
    writeStore(SEL_KEY, next);
  };
  const resetDefault = () => {
    setChosen(null);
    writeStore(SEL_KEY, null);
  };
  const toggleUnsuccessful = () => {
    setShowUnsuccessful(!showUnsuccessful);
    writeStore(UNSUCCESSFUL_KEY, !showUnsuccessful);
  };

  // Jobs per section (Unsuccessful hidden unless the toggle is on).
  const bySection = useMemo(() => {
    const map = new Map<string, JobListRow[]>();
    for (const j of jobs) {
      if (j.stage === "unsuccessful" && !showUnsuccessful) continue;
      const s = sectionOf(j);
      if (!s) continue;
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(j);
    }
    return map;
  }, [jobs, showUnsuccessful]);

  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const matches = (j: JobListRow) =>
    !needle || [j.jobNo, jobTitle(j.description), j.client, j.site, j.po].some((f) => f.toLowerCase().includes(needle));
  const shownSections = sections.filter(isShown);
  const visible = shownSections
    .map((s) => ({ s, rows: (bySection.get(s.key) || []).filter(matches) }))
    .filter((x) => !needle || x.rows.length > 0);
  const matchCount = visible.reduce((n, x) => n + x.rows.length, 0);

  const openFromSearch = () => {
    const all = visible.flatMap((x) => x.rows);
    if (all.length === 1) router.push(`/jobs/${all[0].jobNo}`);
    else if (/^\d+$/.test(needle)) router.push(`/jobs/${needle}`);
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2" role="group" aria-label="Folders">
        {sections.map((s) => {
          const on = isShown(s);
          return (
            <button
              key={s.key}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(s)}
              className={`rounded-full border px-3 py-1.5 text-sm ${on ? "border-brand bg-brand/10 font-semibold" : "border-line text-muted line-through"}`}
            >
              {s.name} <span className="ml-1 text-xs">{(bySection.get(s.key) || []).length}</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <button type="button" onClick={showAll} className="underline">Show all</button>
        {chosen && <button type="button" onClick={resetDefault} className="underline">Default</button>}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showUnsuccessful} onChange={toggleUnsuccessful} />
          Show unsuccessful
        </label>
        <span className="text-muted">Enquiry, Reactive, Maintenance and Approved show by default. Your choices are remembered on this device.</span>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          openFromSearch();
        }}
        className="mb-2"
      >
        <SearchBox value={q} onChange={setQ} placeholder="Find a job: number, title, client or site" label="Search jobs" />
      </form>
      {needle && (
        <p className="text-sm text-muted mb-3" aria-live="polite">
          {matchCount
            ? `${matchCount} ${matchCount === 1 ? "match" : "matches"} in the folders shown`
            : `No match in the folders shown.${/^\d+$/.test(needle) ? ` Press Enter to open job ${needle}.` : ""}`}
        </p>
      )}

      {shownSections.length === 0 && <p className="text-sm text-muted">Every folder is hidden. Tap a folder above to show it.</p>}
      {jobs.length === 0 && <p className="text-sm text-muted">No jobs yet. Jobs arrive from ServiceM8.</p>}

      {visible.map(({ s, rows }) => (
        <section key={s.key} className="mb-5" aria-label={s.name}>
          <h2 className="font-semibold mb-2">
            {s.name} <span className="text-muted font-normal">({rows.length})</span>
          </h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted border border-line rounded-lg px-3 py-2 bg-white">No jobs in this folder.</p>
          ) : (
            <ul className="bg-white border border-line rounded-lg divide-y divide-line">
              {rows.map((j) => {
                const st = STAGES[stageOf(j.stage)];
                const booking = bookingChip(j);
                const sub = [j.client, j.site && j.site !== j.client ? j.site : "", j.po ? `Client ref ${j.po}` : ""].filter(Boolean).join(" · ");
                return (
                  <li key={j.id}>
                    <Link href={`/jobs/${j.jobNo}`} className="flex gap-3 px-3 py-2.5 hover:bg-paper">
                      <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium truncate">#{j.jobNo} {jobTitle(j.description)}</span>
                        {sub && <span className="block text-sm text-muted truncate">{sub}</span>}
                        <span className="mt-1 flex flex-wrap gap-1.5 text-xs">
                          <span className={`rounded px-1.5 py-0.5 ${st.chip}`}>{st.label}</span>
                          {booking && <span className={`rounded px-1.5 py-0.5 ${TONES[booking.tone]}`}>{booking.text}</span>}
                          <span className="rounded px-1.5 py-0.5 bg-[#ececea] text-[#3d4043]">{j.jobType === "cdm" ? "CDM" : "Project"}</span>
                          {j.value > 0 && <span className="rounded px-1.5 py-0.5 bg-[#ececea] text-[#3d4043]">{money(j.value)}</span>}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
