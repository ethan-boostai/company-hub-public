import { Suspense } from "react";
import { getCurrentPerson } from "@/lib/auth/session";
import { signOut } from "@/app/sign-in/actions";
import { GlobalSearch, MobileMenu, NewTaskButton } from "./header-tools";

async function SignedInAs() {
  const person = await getCurrentPerson();
  if (!person) return null;
  return (
    <form action={signOut} className="flex items-center gap-2 text-sm text-white">
      <span className="font-semibold whitespace-nowrap" data-testid="signed-in-name">{person.name}</span>
      <button type="submit" className="rounded-md border border-white/40 px-2 py-1 text-xs hover:bg-white/10">Sign out</button>
    </form>
  );
}

// Standard page header: title, global search, + New task, signed-in person top right. No back buttons.
export function PageHeader({ title, search = "" }: { title: string; search?: string }) {
  return (
    <header className="bg-dark border-b-4 border-brand">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <MobileMenu />
        <h1 className="text-lg font-semibold text-white mr-2">{title}</h1>
        <GlobalSearch initial={search} />
        <div className="ml-auto flex items-center gap-3">
          <NewTaskButton />
          <Suspense fallback={<span className="text-sm text-white/60">…</span>}>
            <SignedInAs />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
