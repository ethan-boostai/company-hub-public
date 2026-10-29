import { Suspense } from "react";
import { PageHeader } from "@/components/shell/page-header";
import { TeamTabs } from "@/components/shell/team-tabs";
import { getCurrentPerson } from "@/lib/auth/session";
import { ukToday } from "../../_registers/dates";
import { canSeeTimeOff } from "../data";
import { loadTimeOff } from "./data";
import { TimeOffClient } from "./time-off-client";

// Team > Time off. Only people with the Time off tick on People see it: the check is here, on the
// server, before anything is loaded (and again in every action and the report).
async function Loader({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const person = await getCurrentPerson();
  if (!person || !(await canSeeTimeOff(person.id))) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-3xl font-bold text-ink">Team</h1>
        <TeamTabs active="time-off" />
        <p className="mt-6 max-w-xl text-muted" data-testid="time-off-locked">
          Time off holds personal information, including sick notes, so only people with the Time off tick on People can see it.
          Ask whoever looks after People to tick it for you if you need it.
        </p>
      </div>
    );
  }
  const [data, sp] = await Promise.all([loadTimeOff(), searchParams]);
  return <TimeOffClient initial={data} today={ukToday()} openId={Number(sp.open) || null} />;
}

export default function TimeOffPage(props: PageProps<"/people/time-off">) {
  return (
    <>
      <PageHeader title="Time off" bare />
      <main>
        <Suspense fallback={<p className="p-6 text-sm text-muted">Loading time off…</p>}>
          <Loader searchParams={props.searchParams as Promise<{ open?: string }>} />
        </Suspense>
      </main>
    </>
  );
}
