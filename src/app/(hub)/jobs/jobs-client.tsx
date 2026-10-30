"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageTop } from "@/components/ui/page-top";
import { DataTable, FilterRow, type Column } from "@/components/ui/register";
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

  // Search filters the list in place as you type. While searching, every folder is searched (so a
  // job is never hidden by a folder choice); Unsuccessful jobs only when shown, or by exact number.
  const needle = q.trim().toLowerCase().replace(/^#/, "");
  const matches = (j: JobListRow) => {
    if (!needle) return true;
    if (j.jobNo === needle) return true;
    if (j.stage === "unsuccessful" && !showUnsuccessful) return false;
    return j.jobNo.startsWith(needle) || [jobTitle(j.description), j.client, j.site, j.po].some((f) => f.toLowerCase().includes(needle));
  };
  const listFor = (key: string) => {
    if (!needle) return bySection.get(key) || [];
    // Searching: Unsuccessful jobs are kept out of bySection when hidden, but an exact number still finds them.
    return jobs.filter((j) => sectionOf(j) === key && matches(j));
  };
  const shownSections = needle ? sections : sections.filter(isShown);
  const visible = shownSections.map((s) => ({ s, rows: listFor(s.key) })).filter((v) => !needle || v.rows.length > 0);
  const total = visible.reduce((n, v) => n + v.rows.length, 0);
  const unknownNumber = /^\d+$/.test(needle) && !jobs.some((j) => j.jobNo === needle);

  const columns: Column<JobListRow>[] = [
    {
      key: "job",
      label: "Job",
      cell: (j) => `#${j.jobNo} ${jobTitle(j.description)}`,
      sub: (j) => [j.client, j.site && j.site !== j.client ? j.site : "", j.po ? `Client ref ${j.po}` : ""].filter(Boolean).join(" · "),
    },
    {
      key: "stage",
      label: "Stage",
      cell: (j) => {
        const st = STAGES[stageOf(j.stage)];
        return <span className={`inline-block whitespace-nowrap rounded-full px-3 py-0.5 text-sm font-semibold ${st.chip}`}>{st.label}</span>;
      },
    },
    {
      key: "booking",
      label: "Booking",
      cell: (j) => {
        const b = bookingChip(j);
        return b ? <span className={`inline-block whitespace-nowrap rounded-full px-3 py-0.5 text-sm font-semibold ${TONES[b.tone]}`}>{b.text}</span> : null;
      },
    },
    { key: "type", label: "Type", cell: (j) => (j.jobType === "cdm" ? "CDM" : "Project") },
    { key: "value", label: "Value", cell: (j) => (j.value > 0 ? money(j.value) : ""), className: "text-right whitespace-nowrap" },
  ];

  return (
    <div>
      <PageTop title="Jobs" count={total} />

      <div role="group" aria-label="Folders" className="mb-2 flex flex-wrap gap-2">
        {sections.map((s) => {
          const on = isShown(s);
          return (
            <Button key={s.key} size="small" aria-pressed={on} onClick={() => toggle(s)}>
              {on && <span aria-hidden="true">✓</span>}
              <span className={on ? "font-semibold" : "text-muted line-through"}>{s.name}</span>
              <span className="text-brand">{(bySection.get(s.key) || []).length}</span>
            </Button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Button size="small" onClick={showAll}>Show all</Button>
        {chosen && <Button size="small" onClick={resetDefault}>Default</Button>}
        <Button size="small" aria-pressed={showUnsuccessful} onClick={toggleUnsuccessful}>
          {showUnsuccessful && <span aria-hidden="true">✓</span>}Show unsuccessful
        </Button>
        <span className="text-muted">Enquiry, Reactive, Maintenance and Approved show by default. Your choices are remembered on this device.</span>
      </div>

      <FilterRow>
        <SearchBox value={q} onChange={setQ} placeholder="Find a job: number, title, client or site" label="Search jobs" />
      </FilterRow>

      {needle && <p className="mb-3 text-sm text-muted">{total} {total === 1 ? "job matches" : "jobs match"}, searching every folder.</p>}
      {unknownNumber && (
        <p className="mb-3 text-sm">
          Job {needle} isn&apos;t in the hub&apos;s list yet.{" "}
          <Button size="small" onClick={() => router.push(`/jobs/${needle}`)}>Open job {needle}</Button>
        </p>
      )}
      {!needle && shownSections.length === 0 && <p className="text-sm text-muted">Every folder is hidden. Tap a folder above to show it.</p>}
      {jobs.length === 0 && <p className="text-sm text-muted">No jobs yet. Jobs arrive from ServiceM8.</p>}

      {visible.map(({ s, rows }) => (
        <section key={s.key} className="mb-5" aria-label={s.name}>
          <h2 className="mb-2 font-semibold">
            {s.name} <span className="font-normal text-muted">({rows.length})</span>
          </h2>
          <DataTable label={s.name} rows={rows} rowKey={(j) => j.id} onOpen={(j) => router.push(`/jobs/${j.jobNo}`)} columns={columns} empty="No jobs in this folder." />
        </section>
      ))}
    </div>
  );
}
