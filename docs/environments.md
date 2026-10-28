# Environments and their variables

Where the hub runs, which database each environment uses, and every environment variable. Values are secrets and are never written here or committed: they live in Vercel (Project cbs-hub → Settings → Environment Variables) and, on a developer's machine, in `.env.local`.

The rules below are Ethan's (28/10/2026) and override anything else in a branch's docs. Where Vercel differs from them, Vercel is wrong and Ethan changes it back.

## The environments

| Environment | What it is | Database | Migrations on build | Files go to |
|---|---|---|---|---|
| **Production** | The live site, built from `main` (cbs-hub.vercel.app). | Live: Supabase `cbs-hub`. | **No**, until Ethan approves switch-over | Real SharePoint folders. |
| **Preview** | Every other branch and pull request gets its own preview link. | Dev: Supabase `cbs-hub-dev`, ref `fbfkwwaeigrggcdrduit`. | Only the Core branch `phase-1-jobs-tasks` | `CBS System/Hub uploads/Test` only. |
| **Local** | A developer's machine or a Claude Code container, used for building and tests. | Local Postgres (`postgres://postgres@127.0.0.1:54329/cbs_hub`, see `docs/parallel-work.md`). | By hand: `npm run db:migrate` | `.local/uploads` (`FILE_STORAGE=local`), or the test folder. |

**Rules that hold in every environment:**
- **The live database is blocked everywhere except the live site.** `src/lib/live-guard.mjs` refuses any connection to the live database unless the code is running as Vercel production, or the switch-over flag is set (only with Ethan's approval). Tests and the local seed never use live.
- **Only the live site writes to real SharePoint folders.** Outside production, every upload goes to `CBS System/Hub uploads/Test`, whatever folder the code asks for (`uploadFolderFor` in `src/lib/files/storage.ts`, applied when every upload starts in `src/lib/files/sharepoint.ts`).
- **No session changes settings.** Vercel, Supabase, GitHub and n8n settings are read-only for every session unless Ethan explicitly asks for a change. Only Ethan (or the adviser chat, when he asks) changes them.
- **Only the Core session migrates the dev database.** `MIGRATE_ON_BUILD=1` is set for Preview on the branch `phase-1-jobs-tasks` only, so only Core's preview builds apply migrations to `cbs-hub-dev`. Other previews build without migrating.
- **Production never migrates until Ethan approves switch-over.** `MIGRATE_ON_BUILD` is not set for Production.
- **Schema changes from other sessions go to Core as requests.** Describe the tables or columns you need in your pull request or to Ethan; the Core session adds the migration and its preview applies it to `cbs-hub-dev`. Test your own tables on a local database until then.
- **Never edit a migration file once it has been pushed**, on any branch: add a new migration instead.
- **The dev database holds test data only.** Core can reset and rebuild it from its branch whenever needed.
- **Preview builds create a test office user.** Each preview build creates or updates "Preview Admin" on the dev database, with `PREVIEW_ADMIN_PIN` as its PIN (`scripts/preview-admin.mjs`). Production builds skip this.

## Variables

| Variable | Production | Preview | Local (`.env.local`) | What it's for |
|---|---|---|---|---|
| `DATABASE_URL` | Live `cbs-hub` (transaction pooler) | Dev `cbs-hub-dev` (transaction pooler) | Local Postgres | The Postgres the app, migrations and scripts connect to. |
| `MIGRATE_ON_BUILD` | **not set** until Ethan approves switch-over | `1` for branch `phase-1-jobs-tasks` only (Core) | not used | When `1`, `npm run vercel-build` applies new files in `supabase/migrations` before the app builds. A failed migration fails the build. Without it, migrations are skipped. |
| `PREVIEW_ADMIN_PIN` | not set (must stay unset) | set (4 digits) | not used | The PIN for "Preview Admin", the test office user that each preview build creates on the dev database. Changing it takes effect on the next preview build. The script refuses the live database and does nothing on production. |
| `APP_SECRET` | set | set | any long random string | Signs upload tickets and short-lived tokens (for example the team app's photo tickets). 32+ random characters. Changing it cancels uploads in progress; nothing else. |
| `N8N_FILES_KEY` | set | set | only for real SharePoint tests | The `X-CBS-Files-Key` header for the n8n workflow "CBS Hub - Files", the app's only route to SharePoint. Must match the n8n credential "CBS Hub Files key". |
| `FILE_STORAGE` | `sharepoint` | `sharepoint` | `local` | Where uploads go. `local` writes to `.local/uploads` and is refused on Vercel. On previews, SharePoint uploads still go only to the test folder (see above). |
| `TEAM_LINK_KEY` | set | set | any 16+ character string | The secret in the team app's link (`/team?k=…`). The app refuses every team request if it is missing or shorter than 16 characters. Changing it cuts off every old team link. |
| `N8N_WEBHOOK_BASE` | not set | not set | not set | Optional. The n8n webhook address; defaults to `https://old-hub.example/webhook`. |
| `LEGACY_PIN_SALT` | not set yet | not set | only for PIN tests | The fixed prefix the old hub used in its PIN hashes. Set on Production at the People switch-over, with Ethan's OK, so people can sign in with their old PINs once. Until then an old PIN can't be accepted. |
| `CBS_LIVE_DATABASE` | not set | must never be set | not set | Switch-over flag. Set to `switch-over` only with Ethan's approval, to run an import script against the live database. Remove it afterwards. |
| `TEST_DATABASE_URL` | not used | not used | local (or dev) database | The database the tests use. `npm test` refuses anything but a local database, or the dev database named in `TEST_DEV_DATABASE_REF`. |
| `TEST_DEV_DATABASE_REF` | not used | not used | `fbfkwwaeigrggcdrduit` (optional) | Lets the tests use the dev database. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | not set | not set | not set | Listed in `.env.example` for Supabase Storage (signatures, thumbnails). Not used by the code yet. |
| `VERCEL`, `VERCEL_ENV` | set by Vercel | set by Vercel | not set | Tell the code which environment it is in (`production` or `preview`). The live-database guard, the upload folder guard and the preview user all rely on them. |

Browser tests in `tests/e2e/` also read `BASE_URL` and `TEAM_KEY` from the shell. These are local only and never set in Vercel.

## Notes

- **Vercel differs from these rules at the moment (read-only check, 28/10/2026 16:30 UTC):** `MIGRATE_ON_BUILD` is set for Production and for all Preview branches (changed at 16:25 UTC). Until Ethan changes it back, merging to `main` applies migrations to the live database, and every preview migrates `cbs-hub-dev`.

- **"Development" copies:** Vercel also holds "Development" copies of `DATABASE_URL`, `APP_SECRET`, `N8N_FILES_KEY`, `FILE_STORAGE` and `TEAM_LINK_KEY` from the first setup. They stay as they are (Ethan, 28/10/2026). Nothing uses the Development environment. If anyone runs `vercel env pull`, that `DATABASE_URL` may point at the live database; the live-database guard still refuses it.
- **`LEGACY_PIN_SALT`** is added to Production at the People switch-over, with Ethan's OK (see above).
