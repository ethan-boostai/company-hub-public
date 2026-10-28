import { Suspense, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/nav";
import { requirePerson } from "@/lib/auth/session";

async function SignedInOnly({ children }: { children: ReactNode }) {
  await requirePerson();
  return children;
}

export default function HubLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh lg:pl-60">
      <Sidebar />
      <Suspense fallback={<p className="p-6 text-muted">Loading…</p>}>
        <SignedInOnly>{children}</SignedInOnly>
      </Suspense>
    </div>
  );
}
