import "server-only";
import postgres from "postgres";

// One shared Postgres connection pool. Supabase: use the transaction pooler URL (prepare: false).
const globalForSql = globalThis as unknown as { cbsSql?: postgres.Sql };

export function db(): postgres.Sql {
  if (!globalForSql.cbsSql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalForSql.cbsSql = postgres(url, {
      prepare: false,
      max: 5,
      idle_timeout: 20,
      onnotice: () => {},
    });
  }
  return globalForSql.cbsSql;
}
