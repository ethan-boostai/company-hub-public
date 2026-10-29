"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { niceDate } from "../_registers/dates";
import { Chip, Section } from "../_registers/ui";
import { listLinkedClaims } from "./actions";
import type { LinkedClaim } from "./data";
import { CLAIM_STATUSES, isClosed, labelOf } from "./rules";

// The Claims list on a vehicle, accident or equipment drawer. Claims live on Insurance and
// accreditations; these links open them there.
export function LinkedClaims({ kind, id }: { kind: "vehicle" | "accident" | "asset"; id: number }) {
  const [claims, setClaims] = useState<LinkedClaim[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    listLinkedClaims(kind, id)
      .then((r) => {
        if (!live) return;
        if (r.ok) setClaims(r.data ?? []);
        else setError(r.message);
      })
      .catch(() => live && setError("Couldn't load the claims. Refresh to try again."));
    return () => {
      live = false;
    };
  }, [kind, id]);

  return (
    <Section title="Claims" action={
      <Link href={`/insurance?add=claim&${kind}=${id}`} className="px-3 py-1.5 rounded-lg border border-dark text-sm font-semibold hover:bg-paper">Add claim</Link>
    }>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      {!claims && !error && <p className="text-sm text-muted">Loading claims…</p>}
      {claims && claims.length === 0 && <p className="text-sm text-muted">No claims.</p>}
      {claims && claims.length > 0 && (
        <ul className="divide-y divide-line border border-line rounded-lg">
          {claims.map((c) => (
            <li key={c.id}>
              <Link href={`/insurance?claim=${c.id}`} className="px-3 py-2 hover:bg-paper flex flex-wrap items-center gap-x-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{c.claimNo} {c.claimType}</span>
                  {c.incidentDate && <span className="block text-xs text-muted">Incident {niceDate(c.incidentDate)}</span>}
                </span>
                <Chip tone={isClosed(c.status) ? "ok" : "up"}>{labelOf(CLAIM_STATUSES, c.status)}</Chip>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
