import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";

export default function HomePage() {
  return (
    <>
      <PageHeader title="Home" />
      <main className="p-4 sm:p-6 max-w-4xl">
        <div className="bg-white border border-line rounded-xl p-5">
          <h2 className="font-semibold text-lg mb-2">CBS Operations Hub</h2>
          <p className="text-sm text-muted mb-4">
            This is the new hub, being built area by area. Jobs and tasks come next (Phase 1). Until each area moves over, keep using the old hub for it.
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li><Link className="underline" href="/people">Team</Link>: who can sign in, their PINs and the crew list.</li>
            <li><Link className="underline" href="/settings/shared-parts">Shared parts</Link>: the building blocks every page will use, to test.</li>
          </ul>
        </div>
      </main>
    </>
  );
}
