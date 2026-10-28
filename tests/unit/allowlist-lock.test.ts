import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

// The ServiceM8 allow lists (settings 'sm8_sync') may only change through an approved migration
// or an approved direct change, never from the hub.

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}

describe("ServiceM8 allow lists", () => {
  it("no hub code mentions the allow-list setting or its unlock", () => {
    const root = path.join(__dirname, "../../src");
    const offenders = files(root).filter((f) => /\.(ts|tsx|js|mjs)$/.test(f)).filter((f) => {
      const text = readFileSync(f, "utf8");
      return /sm8_sync|allow_sync_settings/.test(text);
    });
    expect(offenders).toEqual([]);
  });
});

const url = process.env.DATABASE_URL || "";
describe.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("ServiceM8 allow lists (database lock)", () => {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  it("refuses a change without the opt-in", async () => {
    await expect(sql`update settings set value = jsonb_set(value, '{write_allow}', '"all"') where key = 'sm8_sync'`)
      .rejects.toThrow(/approved migration/);
    await expect(sql`delete from settings where key = 'sm8_sync'`).rejects.toThrow(/approved migration/);
    const [r] = await sql`select value->'write_allow' as w from settings where key = 'sm8_sync'`;
    expect(r.w).toEqual(["12"]);
  });

  it("allows a change made the approved way", async () => {
    await sql.begin(async (tx) => {
      await tx`set local cbs.allow_sync_settings = 'on'`;
      await tx`update settings set value = value where key = 'sm8_sync'`;
    });
  });
});
