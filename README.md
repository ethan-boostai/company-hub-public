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

## Checks

```bash
npm run lint && npm run typecheck && npm test
```

Browser test of the whole Phase 0 flow (app running on port 3100 against the seeded local database; uses the Playwright install in the dev environment):

```bash
node tests/e2e/phase0.mjs
```

## Live database (Supabase)

- `DATABASE_URL` is the Supabase "Transaction pooler" connection string (port 6543).
- Apply migrations with `npm run db:migrate`. Where the database can't be reached directly (e.g. a sandbox that only allows HTTPS), use `supabase/setup/phase0-sql-editor.sql` in the Supabase SQL Editor instead; it records the migration so `db:migrate` skips it later. Migrations live in `supabase/migrations` and are tracked in `schema_migrations`; don't mix with `supabase db push`.
- First office user: `node scripts/add-person.mjs "Full Name" 1234`. Everyone else is added on the People page.

## Environment variables (Vercel)

See `.env.example`. Server-only secrets: `DATABASE_URL`, `APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_FILES_KEY`. On Vercel `FILE_STORAGE` must be `sharepoint`.

## Files (SharePoint through n8n)

The app never talks to Microsoft directly. The n8n workflow **CBS Hub - Files** has three webhooks, each protected by the `X-CBS-Files-Key` header:

- `cbs-hub-files-start` starts a resumable upload in a folder inside `CBS System`. The browser then sends the file to SharePoint in 5 MB chunks, so there's no size limit from Vercel or n8n (SharePoint allows up to 250 GB; the app caps uploads at 250 MB).
- `cbs-hub-files-info` returns a file's name, size, folder and web link (used to check an upload before it's recorded).
- `cbs-hub-files-link` returns short-lived view and download links, fetched fresh each time a file is opened.

All SharePoint calls go through the one "Graph Request" node, so the SharePoint credential can be swapped (e.g. to the app/service principal credential) in n8n with no app change. If SharePoint fails, the workflow emails an alert (at most one per 15 minutes) and the app shows "SharePoint isn't reachable right now". Phase 0 uploads go to `CBS System/Hub uploads/Test` only.
