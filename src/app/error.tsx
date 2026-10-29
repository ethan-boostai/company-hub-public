"use client";

import { PageError } from "@/components/shell/page-error";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageError reset={reset} />;
}
