import { PageHeader } from "@/components/shell/page-header";
import { TeamTabs } from "@/components/shell/team-tabs";

// Team > Time off. Not built yet.
export default function Page() {
  return (
    <>
      <PageHeader title="Team" bare />
      <main className="p-4 sm:p-6">
        <h1 className="text-2xl font-bold text-ink">Team</h1>
        <TeamTabs active="time-off" />
        <p className="mt-6 text-sm text-muted">Time off is built in a later stage (holidays and absence).</p>
      </main>
    </>
  );
}
