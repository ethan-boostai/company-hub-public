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
    const pool = withReservedBegin(postgres(url, POOL_OPTIONS), {
      // A stuck query or save: drop this pool so the next request starts with fresh connections.
      onStuck: () => {
        if (globalForSql.cbsSql === pool) globalForSql.cbsSql = undefined;
        console.error("Database query timed out; the connection pool was reset.");
      },
    });
    globalForSql.cbsSql = pool;
  }
  return globalForSql.cbsSql;
}

// Time limits, so a stuck query fails visibly in seconds instead of hanging the page for minutes.
// - Every query: QUERY_TIMEOUT_MS on the app side (the pooler gives no server-side limit for a
//   single query).
// - Every db().begin(): TRANSACTION_TIMEOUT_MS overall on the app side, and on the database side
//   statement_timeout and idle_in_transaction_session_timeout for that transaction (set local).
// When a limit is hit, the query is cancelled and the whole pool is closed, because a connection
// stuck in the pooler never recovers; the next request opens fresh connections.
export const QUERY_TIMEOUT_MS = 15_000;
export const TRANSACTION_TIMEOUT_MS = 20_000;

export class DbTimeoutError extends Error {
  constructor(what: string, ms: number) {
    super(`The database didn't answer within ${Math.round(ms / 1000)} seconds (${what}). Try again.`);
    this.name = "DbTimeoutError";
  }
}

function withTimeout<T>(work: PromiseLike<T>, ms: number, what: string, onTimeout: () => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new DbTimeoutError(what, ms));
    }, ms);
    work.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

type Limits = { queryMs?: number; transactionMs?: number; onStuck?: () => void };

// Wraps a postgres.js pool: every query gets the time limit, and db().begin(fn) runs on a
// connection reserved for the whole transaction (postgres.js's own sql.begin can't reserve one
// with max_pipeline 0). begin commits when fn resolves and rolls back when it throws.
export function withReservedBegin(sql: postgres.Sql, limits: Limits = {}): postgres.Sql {
  const queryMs = limits.queryMs ?? QUERY_TIMEOUT_MS;
  const transactionMs = limits.transactionMs ?? TRANSACTION_TIMEOUT_MS;
  const stuck = () => {
    limits.onStuck?.();
    void sql.end({ timeout: 0 }).catch(() => undefined);
  };
  const secs = (ms: number) => `${Math.max(1, Math.round(ms / 1000))}s`;

  // A postgres.js query runs when it is first awaited (then); race that against the limit.
  function limit<Q>(q: Q): Q {
    const query = q as unknown as { then?: unknown; cancel?: () => void };
    if (!query || typeof query.then !== "function" || typeof query.cancel !== "function") return q;
    const original = (query.then as (a?: unknown, b?: unknown) => Promise<unknown>).bind(query);
    let raced: Promise<unknown> | null = null;
    (query as { then: unknown }).then = (onOk?: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => {
      raced ??= withTimeout({ then: original } as PromiseLike<unknown>, queryMs, "query", () => {
        try {
          query.cancel?.();
        } catch {
          // already finished or never started
        }
        stuck();
      });
      return raced.then(onOk, onErr);
    };
    return q;
  }

  async function run<T>(fn: (tx: postgres.TransactionSql) => T | Promise<T>): Promise<T> {
    const tx = await sql.reserve();
    try {
      await tx
        .unsafe(
          `begin; set local statement_timeout = '${secs(queryMs)}'; set local idle_in_transaction_session_timeout = '${secs(transactionMs)}'`,
        )
        .simple();
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
  const begin = <T>(fn: (tx: postgres.TransactionSql) => T | Promise<T>) =>
    withTimeout(run(fn), transactionMs, "save", stuck);

  return new Proxy(sql, {
    apply: (target, thisArg, args) => limit(Reflect.apply(target, thisArg, args)),
    get: (target, prop, receiver) => {
      if (prop === "begin") return begin;
      if (prop === "unsafe") return (...args: Parameters<postgres.Sql["unsafe"]>) => limit(target.unsafe(...args));
      return Reflect.get(target, prop, receiver);
    },
  });
}

// For reads while rendering a page (server components and the data.ts helpers they call).
export async function readDb(): Promise<postgres.Sql> {
  await connection();
  return db();
}
