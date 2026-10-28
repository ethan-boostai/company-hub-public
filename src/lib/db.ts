import "server-only";
import { connection } from "next/server";
import postgres from "postgres";
import { assertNotLive } from "./live-guard.mjs";

// One shared Postgres connection pool. Supabase: use the transaction pooler URL (prepare: false).
const globalForSql = globalThis as unknown as { cbsSql?: postgres.Sql };

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
    globalForSql.cbsSql = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return globalForSql.cbsSql;
}

// For reads while rendering a page (server components and the data.ts helpers they call).
export async function readDb(): Promise<postgres.Sql> {
  await connection();
  return db();
}
