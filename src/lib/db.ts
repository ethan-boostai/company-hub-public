import "server-only";
import { connection } from "next/server";
import postgres from "postgres";
import { assertNotLive } from "./live-guard.mjs";

// One shared Postgres connection pool. Supabase: use the transaction pooler URL (port 6543).
const globalForSql = globalThis as unknown as { cbsSql?: postgres.Sql };

// Settings for Supabase's transaction pooler (Supavisor). max_pipeline is read by postgres.js but
// missing from its type definitions, so this object isn't typed as postgres.Options.
// - prepare: false. The pooler can't keep prepared statements between transactions.
// - max_pipeline: 0. Send one query at a time on each connection. postgres.js otherwise sends up
//   to 100 queries without waiting, and Supavisor's transaction mode can hang on pipelined
//   statements (supabase/supavisor#1239): every preview page stuck on "Loading…" until Vercel
//   killed it after 300 seconds (29/10/2026). With pipelining off, postgres.js's own sql.begin
//   can't reserve its connection (porsager/postgres#1264), so db().begin runs on a reserved
//   connection instead (below).
// - connect_timeout: give up on a connection after 10 seconds instead of 30.
// - idle_timeout / max_lifetime: close idle connections after 20 seconds, and every connection
//   after 5 minutes, so a broken one never lives long.
export const POOL_OPTIONS = {
  prepare: false,
  max: 5,
  max_pipeline: 0,
  connect_timeout: 10,
  idle_timeout: 20,
  max_lifetime: 60 * 5,
  onnotice: () => {},
};

// The database is only ever used while handling a request, never during `next build`:
// builds must not need (or bake in) data. Pages read through readDb(), which marks the
// render as needing a live request; this guard catches any read that slips through.
export function db(): postgres.Sql {
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new Error("The database was used during the build. Read data in pages through readDb().");
  }
  if (!globalForSql.cbsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    assertNotLive(url, "Connecting to the database");
    globalForSql.cbsSql = withReservedBegin(postgres(url, POOL_OPTIONS));
  }
  return globalForSql.cbsSql;
}

// db().begin(fn): the same as postgres.js's sql.begin, but on a connection reserved for the whole
// transaction (works with max_pipeline 0). Commits when fn resolves, rolls back when it throws.
export function withReservedBegin(sql: postgres.Sql): postgres.Sql {
  async function begin<T>(fn: (tx: postgres.TransactionSql) => T | Promise<T>): Promise<T> {
    const tx = await sql.reserve();
    try {
      await tx`begin`;
      let result: T;
      try {
        result = await fn(tx as unknown as postgres.TransactionSql);
      } catch (e) {
        await tx`rollback`.catch(() => undefined);
        throw e;
      }
      await tx`commit`;
      return result;
    } finally {
      tx.release();
    }
  }
  return new Proxy(sql, {
    get: (target, prop, receiver) => (prop === "begin" ? begin : Reflect.get(target, prop, receiver)),
  });
}

// For reads while rendering a page (server components and the data.ts helpers they call).
export async function readDb(): Promise<postgres.Sql> {
  await connection();
  return db();
}
