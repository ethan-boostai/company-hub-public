import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button-class";

// A hub address that doesn't exist (or a record that's gone): the normal header and menu stay, so
// ‹ Back, search and the signed-in name are always there.
export default function HubNotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <main className="max-w-xl px-4 sm:px-6 pt-2 pb-8">
        <p className="mb-4 text-muted">This page doesn&apos;t exist, or the record it showed has been removed.</p>
        <Link href="/" className={buttonClass("primary", "form")}>Go to Home</Link>
      </main>
    </>
  );
}
