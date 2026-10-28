// Applies SQL files in supabase/migrations to DATABASE_URL, in name order, once each.
// Usage: DATABASE_URL=postgres://... node scripts/db-migrate.mjs
//
// --on-build: used by Vercel's build ("vercel-build" in package.json). Runs only when the
// environment has MIGRATE_ON_BUILD=1, so each Vercel environment opts in separately. A failed
// migration fails the build, and the new code never goes live.
//
// Migrations must keep the previous release working (add columns/tables; remove or rename
// only in a later release), because the database changes just before the new code goes live
// and a Vercel instant rollback does not undo a migration.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";
import { liveRefusal } from "../src/lib/live-guard.mjs";

const onBuild = process.argv.includes("--on-build");
if (onBuild && process.env.MIGRATE_ON_BUILD !== "1") {
  console.log("Database migrations: skipped (MIGRATE_ON_BUILD is not 1 for this environment).");
  process.exit(0);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const refused = liveRefusal(url, "Database migrations");
if (refused) {
  console.error(refused);
  process.exit(1);
}

const LOCK = 727274001; // any fixed number; stops two builds applying the same migration at once
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
const dir = path.join(process.cwd(), "supabase", "migrations");

try {
  if (onBuild) console.log(`Database migrations (${process.env.VERCEL_ENV || "build"}):`);
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  // Locked like every other table: no Supabase API access (RLS on, no policies).
  await sql`alter table schema_migrations enable row level security`;
  const done = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const file of files) {
    if (done.has(file)) continue;
    const body = await readFile(path.join(dir, file), "utf8");
    const ran = await sql.begin(async (tx) => {
      // Transaction-level lock: works through the Supabase transaction pooler.
      await tx`select pg_advisory_xact_lock(${LOCK})`;
      const [already] = await tx`select 1 from schema_migrations where name = ${file}`;
      if (already) return false;
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
      return true;
    });
    if (ran) {
      console.log(`applied ${file}`);
      applied++;
    }
  }
  console.log(applied ? `${applied} migration(s) applied` : "database is up to date");
} catch (e) {
  console.error("Migration failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await sql.end();
}
