import { PageHeader } from "@/components/shell/page-header";
import { TeamTabs } from "@/components/shell/team-tabs";

// Team > Training and qualifications. Not built yet.
export default function Page() {
  return (
    <>
      <PageHeader title="Team" bare />
      <main className="p-4 sm:p-6">
        <h1 className="text-3xl font-bold text-ink">Team</h1>
        <TeamTabs active="training" />
        <p className="mt-6 text-sm text-muted">Registers is building this tab: training records and qualifications, with the training matrix.</p>
      </main>
    </>
  );
}
