import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// Needs a database: runs against DATABASE_URL (local dev database), skipped when it isn't set.
const url = process.env.DATABASE_URL;

describe.skipIf(!url)("double-save guard (database)", async () => {
  const { claimRequestKey } = await import("@/lib/actions");
  const { db } = await import("@/lib/db");
  afterAll(async () => {
    await db().end();
  });

  it("lets a key through once only, even when both saves arrive together", async () => {
    const key = randomUUID();
    const results = await Promise.all([claimRequestKey(key, null), claimRequestKey(key, null), claimRequestKey(key, null)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await claimRequestKey(key, null)).toBe(false);
  });

  it("refuses missing or malformed keys", async () => {
    expect(await claimRequestKey("", null)).toBe(false);
    expect(await claimRequestKey("not-a-uuid", null)).toBe(false);
    expect(await claimRequestKey(undefined, null)).toBe(false);
  });
});
