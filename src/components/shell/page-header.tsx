import { Suspense } from "react";
import { getCurrentPerson } from "@/lib/auth/session";
import { signOut } from "@/app/sign-in/actions";
import { ActionsBadge } from "./actions-badge";
import { BackButton, GlobalSearch, MobileMenu, NameMenu, NewTaskButton } from "./header-tools";

async function SignedInAs() {
  const person = await getCurrentPerson();
  if (!person) return null;
  return <NameMenu name={person.name} signOut={signOut} />;
}

// Standard header (as the live hub): white, ‹ Back on the left, the search box, the orange + New task
// and the signed-in person's name pill (Sign out inside its menu). The page title sits under it
// (PageTop on register pages; pages without one pass `title` and get a plain title row).
export function PageHeader({ title, search = "", bare = false }: { title: string; search?: string; bare?: boolean }) {
  return (
    <>
      <header className="bg-white border-b border-line">
        <div className="flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3">
          <MobileMenu actionsBadge={<ActionsBadge />} />
          <BackButton />
          <GlobalSearch initial={search} />
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <NewTaskButton />
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <SignedInAs />
            </Suspense>
          </div>
        </div>
      </header>
      {!bare && (
        <div className="px-4 sm:px-6 pt-5">
          <h1 className="text-2xl font-bold text-ink">{title}</h1>
        </div>
      )}
    </>
  );
}
