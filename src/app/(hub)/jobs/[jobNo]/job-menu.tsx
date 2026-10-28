"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { Drawer, Modal } from "@/components/ui/overlay";
import { JOB_MENU, type JobMenuItem } from "@/lib/jobs/menu";

function Lock() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" aria-hidden="true">
      <path fill="currentColor" d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5A1.5 1.5 0 0 1 11.5 15h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  );
}

type ListProps = { jobNo: string; atEstimate: boolean; onLocked: (i: JobMenuItem) => void; onNavigate?: () => void };

function MenuList(props: ListProps) {
  return (
    <Suspense fallback={<Items {...props} path="" />}>
      <LiveItems {...props} />
    </Suspense>
  );
}
function LiveItems(props: ListProps) {
  return <Items {...props} path={usePathname()} />;
}

function Items({ jobNo, atEstimate, onLocked, onNavigate, path }: ListProps & { path: string }) {
  const base = `/jobs/${jobNo}`;
  return (
    <nav aria-label={`Job ${jobNo} menu`} className="text-sm">
      <Link href={base} onClick={onNavigate} aria-current={path === base ? "page" : undefined}
        className={`block rounded-md px-3 py-2 ${path === base ? "bg-brand text-white font-semibold" : "hover:bg-paper"}`}>
        Job
      </Link>
      {JOB_MENU.map((g) => (
        <div key={g.group} className="mt-3">
          <p className="px-3 pb-1 text-xs font-bold uppercase tracking-wider text-muted">{g.group}</p>
          {g.items.map((i) => {
            const href = `${base}/${i.slug}`;
            const locked = atEstimate && !i.openAtEstimate;
            if (locked) {
              return (
                <button key={i.slug} type="button" title="Unlocks after approval" onClick={() => onLocked(i)}
                  className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-muted hover:bg-paper">
                  <span className="flex-1 blur-[0.4px]">{i.label}</span>
                  <Lock />
                </button>
              );
            }
            return (
              <Link key={i.slug} href={href} onClick={onNavigate} aria-current={path === href ? "page" : undefined}
                className={`block rounded-md px-3 py-2 ${path === href ? "bg-brand text-white font-semibold" : "hover:bg-paper"}`}>
                {i.label}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

// The left menu inside a job: grouped Plan / Safety / Site / Money and close. At Estimate, pages that
// need an approved job are locked with a padlock and explain why. On phones: a button and a drawer.
export function JobMenu({ jobNo, atEstimate }: { jobNo: string; atEstimate: boolean }) {
  const [locked, setLocked] = useState<JobMenuItem | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <aside className="hidden md:block w-52 shrink-0 border-r border-line bg-white p-2 min-h-[calc(100dvh-64px)]">
        <MenuList jobNo={jobNo} atEstimate={atEstimate} onLocked={setLocked} />
      </aside>
      <div className="md:hidden px-4 pt-3">
        <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm">
          Job menu
        </button>
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title={`Job ${jobNo}`} width="max-w-[16rem]">
        <MenuList jobNo={jobNo} atEstimate={atEstimate} onLocked={(i) => { setOpen(false); setLocked(i); }} onNavigate={() => setOpen(false)} />
      </Drawer>
      <Modal open={!!locked} onClose={() => setLocked(null)} title={locked ? `${locked.label} unlocks after approval` : ""}>
        {locked && (
          <div className="p-5">
            <p className="text-lg font-semibold mb-2">{locked.label} unlocks after approval</p>
            <p className="text-sm text-muted">
              Job {jobNo} is still at Estimate. {locked.label} opens once the job is Approved (Work Order in ServiceM8).
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Link href={`/jobs/${jobNo}`} onClick={() => setLocked(null)} className="px-4 py-2 rounded-lg border border-line hover:bg-paper">Go to the job</Link>
              <button type="button" onClick={() => setLocked(null)} className="px-4 py-2 rounded-lg bg-brand text-white font-semibold">OK</button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
