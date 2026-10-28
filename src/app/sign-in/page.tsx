import { Suspense } from "react";
import { redirect } from "next/navigation";
import { readDb } from "@/lib/db";
import { getCurrentPerson } from "@/lib/auth/session";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · CBS Operations Hub" };

async function SignInLoader({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentPerson()) redirect("/");
  const { next } = await searchParams;
  const sql = await readDb();
  const people = await sql<{ name: string }[]>`
    select name from people where active and can_sign_in order by lower(name)`;
  return <SignInForm names={people.map((p) => p.name)} next={typeof next === "string" ? next : "/"} />;
}

export default function SignInPage(props: PageProps<"/sign-in">) {
  return (
    <main className="min-h-dvh bg-paper flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/cbs-logo.png" alt="Chelmsford Building Services" className="h-12 w-auto mx-auto mb-6" />
        <h1 className="text-xl font-semibold text-center mb-6">Sign in to the Operations Hub</h1>
        <Suspense fallback={<p className="text-center text-muted">Loading names…</p>}>
          <SignInLoader searchParams={props.searchParams as Promise<{ next?: string }>} />
        </Suspense>
      </div>
    </main>
  );
}
