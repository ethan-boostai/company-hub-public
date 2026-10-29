import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { POOL_OPTIONS, withReservedBegin } from "@/lib/db";

// Supabase's transaction pooler hangs on pipelined queries (preview pages stuck on "Loading…",
// 29/10/2026). The shared pool must send one query at a time per connection.
describe("database pool settings", () => {
  it("never pipelines and never prepares", () => {
    expect(POOL_OPTIONS.max_pipeline).toBe(0);
    expect(POOL_OPTIONS.prepare).toBe(false);
    expect(POOL_OPTIONS.connect_timeout).toBeLessThanOrEqual(10);
    expect(POOL_OPTIONS.max_lifetime).toBeGreaterThan(0);
  });

  const url = process.env.DATABASE_URL || "";
  it.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("still answers many queries at once, one in flight per connection", async () => {
    const sql = postgres(url, { ...POOL_OPTIONS, max: 2 });
    try {
      const results = await Promise.all(Array.from({ length: 40 }, (_, i) => sql`select ${i}::int as n, pg_sleep(0.01)`));
      expect(results.map((r) => r[0].n)).toEqual(Array.from({ length: 40 }, (_, i) => i));
      // With pipelining off, at most one query per connection is ever active on the server.
      const [busy] = await sql`select count(*)::int as n from pg_stat_activity where state = 'active' and query like 'select $1::int%'`;
      expect(busy.n).toBeLessThanOrEqual(2);
    } finally {
      await sql.end();
    }
  });

  it.skipIf(!/@(127\.0\.0\.1|localhost)[:/]/.test(url))("db().begin commits, rolls back, and copes with many transactions at once", async () => {
    const sql = withReservedBegin(postgres(url, { ...POOL_OPTIONS, max: 2 }));
    try {
      await sql`create table if not exists test_pool_begin (n int)`;
      await sql`delete from test_pool_begin`;
      // commits
      const r = await sql.begin(async (tx) => {
        await tx`insert into test_pool_begin values (1)`;
        const [a, b] = await Promise.all([tx`select count(*)::int as n from test_pool_begin`, tx`select 2 as two`]);
        return [a[0].n, b[0].two];
      });
      expect(r).toEqual([1, 2]);
      // rolls back on error
      await expect(sql.begin(async (tx) => {
        await tx`insert into test_pool_begin values (99)`;
        throw new Error("stop");
      })).rejects.toThrow("stop");
      expect((await sql`select count(*)::int as n from test_pool_begin where n = 99`)[0].n).toBe(0);
      // 20 transactions and 20 plain queries at once on a pool of 2
      await Promise.all([
        ...Array.from({ length: 20 }, (_, i) => sql.begin((tx) => tx`insert into test_pool_begin values (${100 + i})`)),
        ...Array.from({ length: 20 }, () => sql`select 1`),
      ]);
      expect((await sql`select count(*)::int as n from test_pool_begin where n >= 100`)[0].n).toBe(20);
    } finally {
      await sql`drop table if exists test_pool_begin`;
      await sql.end();
    }
  });
});
