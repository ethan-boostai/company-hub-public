import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/nav";
import { requirePerson } from "@/lib/auth/session";
import { TaskProvider } from "@/components/tasks/task-provider";
import { ActionsBadge } from "@/components/shell/actions-badge";

async function SignedInOnly({ children }: { children: ReactNode }) {
  await requirePerson();
  return children;
}

export default function HubLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-72">
      <Sidebar actionsBadge={<ActionsBadge />} />
      <TaskProvider>
        <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
          <SignedInOnly>{children}</SignedInOnly>
        </Suspense>
      </TaskProvider>
    </div>
  );
}
