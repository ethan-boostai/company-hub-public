import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// The crew (onsite) page for one job: /crew/<job no>?t=<token>. No sign-in; the token is worked out
// from the job number and the team link key (TEAM_LINK_KEY), so changing that key cuts off every
// crew link. One job's link never opens another job.
function secret(): string | null {
  const k = process.env.TEAM_LINK_KEY || "";
  return k.length >= 16 ? k : null;
}

export function crewToken(jobNo: string): string | null {
  const k = secret();
  if (!k) return null;
  return createHmac("sha256", k).update(`crew:${jobNo}`).digest("hex").slice(0, 32);
}

export function crewTokenOk(jobNo: string, given: string | null | undefined): boolean {
  const want = crewToken(jobNo);
  if (!want || !given || !/^\d{1,8}$/.test(jobNo)) return false;
  const a = Buffer.from(want);
  const b = Buffer.from(String(given));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function crewPath(jobNo: string): string | null {
  const t = crewToken(jobNo);
  return t ? `/crew/${jobNo}?t=${t}` : null;
}
