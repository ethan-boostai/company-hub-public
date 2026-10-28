import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

// The team app opens only with the secret link /team?k=<TEAM_LINK_KEY>. Its API calls send the key
// in the X-Team-Key header. Changing TEAM_LINK_KEY in Vercel cuts off every old link.
// No key set means nothing gets in. The key is never logged.
export function teamKeyOk(given: string | null | undefined): boolean {
  const key = process.env.TEAM_LINK_KEY || "";
  if (key.length < 16 || !given) return false;
  // Hash both so the compare is always on equal-length buffers.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(key).digest();
  return timingSafeEqual(a, b);
}
