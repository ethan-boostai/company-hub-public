# CBS Operations Hub

Operations Hub for Chelmsford Building Services. Replaces the old n8n-served hub.

- Build rules: `CLAUDE.md`
- What the old hub does: `docs/inventory.md`
- Rebuild plan and Supabase schema: `docs/plan.md`
- Old hub reference (read only): `legacy/`

Stack: Next.js (App Router, TypeScript, Tailwind) on Vercel (London), Supabase Postgres (London).

## Local development

1. Copy `.env.example` to `.env.local` and fill it in. For a local database, any Postgres 16 works; `DATABASE_URL` points at it.
2. Install and set up the database:

```bash
npm install
```

```bash
npm run db:migrate
```

```bash
npm run db:seed-local
```

The local seed adds fake test people (Test Office One / Two, PIN 1234). It refuses to run against anything but a local database.

3. Run the app:

```bash
npm run dev
```

## Database access rule

Builds never touch the database. Pages and the `data.ts` helpers they call read through `readDb()` (in `src/lib/db.ts`), which marks the render as needing a live request; server actions and API routes run per request and use `db()`. If anything uses the database during `next build`, the build fails with a clear message, even on a machine that has a database.

## Checks

Tests never touch the live database. `tests/setup.ts` keeps `DATABASE_URL` (or `TEST_DATABASE_URL`) only if it is a local database or the dev project named in `TEST_DEV_DATABASE_REF`, and never the live project; otherwise it removes it and database tests skip. Run them with the local address, e.g. `DATABASE_URL=postgres://postgres@127.0.0.1:54329/cbs_hub npm test`.

```bash
npm run lint && npm run typecheck && npm test
```

Browser test of the whole Phase 0 flow (app running on port 3100 against the seeded local database; uses the Playwright install in the dev environment):

```bash
node tests/e2e/phase0.mjs
```

Phase 1 browser tests (test job 12 must be at Approved in the local database):

```bash
node tests/e2e/phase1-tasks.mjs
```

```bash
node tests/e2e/phase1-board.mjs
```

## Live database safety (hard block)

Everything that connects to a database refuses an address containing the live project ref (`chvyskcfjmxxprxoczon`), in any form (pooler, direct, encoded). The rule is in `src/lib/live-guard.mjs`.

- **The app** (`next dev`, `next start`, and every Vercel server) checks at start-up (`src/instrumentation.ts`) and on every new connection (`src/lib/db.ts`). It stops with a "refused" message.
- **Migrations and `add-person`** refuse before connecting.
- **Tests and the local seed never run against live**, even with the flag. `npm test` stops before any test file runs. To run tests, point `TEST_DATABASE_URL` at the local or dev database.
- **The two exceptions:**
  - the live site itself: Vercel's production deployment (`VERCEL=1` and `VERCEL_ENV=production`, both set by Vercel). Preview deployments are refused.
  - the switch-over flag: `CBS_LIVE_DATABASE=switch-over`, set only with Ethan's approval.
- `tests/unit/live-guard.test.ts` checks every one of these.

## Dev database (cbs-hub-dev)

- Supabase project `cbs-hub-dev`, ref `fbfkwwaeigrggcdrduit`, London, free plan. All Vercel previews use it; live is only for production.
- Locked down like live: RLS on every table, no policies, no public access. Only the app's server and the n8n sync role connect.
- Migrations run on each preview build (`MIGRATE_ON_BUILD=1` on Preview only).
- Tests may use it: set `TEST_DEV_DATABASE_REF=fbfkwwaeigrggcdrduit` and `TEST_DATABASE_URL` to its pooler address.
- A free project pauses after a week with no use; restore it from the Supabase dashboard.

## Live database (Supabase)

- `DATABASE_URL` is the Supabase "Transaction pooler" connection string (port 6543).
- Migrations live in `supabase/migrations` and are tracked in `schema_migrations`; don't mix with `supabase db push`.
- **Migrations run automatically on deploy.** Vercel runs `npm run vercel-build`, which applies any new migrations to that environment's `DATABASE_URL` and then builds. It only runs where the Vercel environment has `MIGRATE_ON_BUILD=1`. A failed migration fails the deploy, so the new code never goes live against an old database. A lock stops two builds applying the same migration at once.
- **Every migration must keep the previous release working**: add tables and columns; remove or rename only in a later release once nothing uses the old one. The database changes just before new code goes live, and a Vercel instant rollback doesn't undo a migration.
- By hand (local database): `npm run db:migrate`. `supabase/setup/phase0-sql-editor.sql` was the one-off first setup and is no longer needed.
- First office user: `node scripts/add-person.mjs "Full Name" 1234`. Everyone else is added on the People page.

## ServiceM8 sync (n8n → database)

n8n's "CBS Hub - ServiceM8" workflows call three database functions through one locked-down login, `cbs_n8n_sync`:

- `cbs_sync.sm8_apply_event(event)` for each ServiceM8 webhook;
- `cbs_sync.sm8_apply_records(kind, rows)` for the 5-minute and nightly reads, where kind is `folder`, `client`, `contact`, `staff`, `booking` or `job`;
- `cbs_sync.sm8_sync_since(kind)`, which gives where the last 5-minute read got to.

Rules for the login and the data:

- **What the login can do:** no rights on any table, no access to the `public` schema, no CREATE, a 15-second statement timeout, and at most 5 connections. The functions sit in `cbs_sync`, which the Supabase API doesn't expose. They run as their owner with a fixed search_path.
- **The sync filter:** until Ethan approves the trial copy, only jobs in the locked allow list (job 12) are stored, with their client, the client's contacts, the job's bookings and moves. Other jobs' events and records are ignored and leave nothing behind. Staff and folders sync in full. The write-back reads the same list.
- **Where n8n connects:** `cbs-hub-dev` first, never live, until switch-over. Use the **Session pooler** address (port 5432, IPv4) from Supabase → Connect, user `cbs_n8n_sync.<project ref>`, with SSL required.
- **Turning the login on:** it is created without a password. Once the dev tables exist, Ethan runs this once in the project's SQL editor with his own password:

  ```sql
  alter role cbs_n8n_sync with login password 'choose-a-long-password';
  ```

## Environment variables (Vercel)

See `.env.example`. Server-only secrets: `DATABASE_URL`, `APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_FILES_KEY`. On Vercel `FILE_STORAGE` must be `sharepoint`.

## Files (SharePoint through n8n)

The app never talks to Microsoft directly. The n8n workflow **CBS Hub - Files** has three webhooks, each protected by the `X-CBS-Files-Key` header:

- `cbs-hub-files-start` starts a resumable upload in a folder inside `CBS System`. The browser then sends the file to SharePoint in 5 MB chunks, so there's no size limit from Vercel or n8n (SharePoint allows up to 250 GB; the app caps uploads at 250 MB).
- `cbs-hub-files-info` returns a file's name, size, folder and web link (used to check an upload before it's recorded).
- `cbs-hub-files-link` returns short-lived view and download links, fetched fresh each time a file is opened.

All SharePoint calls go through the one "Graph Request" node, so the SharePoint credential is set in one place in n8n (the existing CBS Microsoft credential, kept permanently). If SharePoint fails, the workflow emails an alert (at most one per 15 minutes) and the app shows "SharePoint isn't reachable right now". Phase 0 uploads go to `CBS System/Hub uploads/Test` only.
