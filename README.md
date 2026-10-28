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

See `.env.example`. Server-only secrets: `DATABASE_URL`, `APP_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `MS_CLIENT_SECRET`. On Vercel `FILE_STORAGE` must be `sharepoint`.
