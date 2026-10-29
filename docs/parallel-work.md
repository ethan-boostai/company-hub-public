# Parallel work

How several Claude Code sessions build the hub at the same time without getting in each other's way. Every session reads this file, `CLAUDE.md`, `docs/plan.md` and `docs/inventory.md` (section 5 is binding) before it starts.

## Before a parallel session starts

1. **Phase 0 is on `main`** (pull request #1 merged). Every workstream branches from `main` and needs the shared parts.
2. **Dev database for previews.** Every preview uses the shared dev database `cbs-hub-dev` (never live), and every preview build applies its branch's new migrations to it. Production applies migrations when a pull request merges to `main`. `MIGRATE_ON_BUILD=1` is set for Production and all Preview branches (`docs/environments.md`). So never edit a migration file once it has been pushed: add a new one.
3. **Each session merges its own pull requests once every check passes; Ethan tests at the end of each stage.** No session commits to `main` (see "Change process" below).

## Who owns what

**Core session** (the first session, currently on `phase-1-jobs-tasks`) owns:

- **The schema and migrations of every shared table:** `people`, `sessions`, `files`, `select_options`, `settings`, `activity_log`, `request_keys`, `schema_migrations`, `jobs`, `clients`, `client_contacts`, `job_requirements`, `requirement_types`, `job_moves`, `tasks`, `sm8_folders`, `sm8_staff`, `sm8_bookings`, `sm8_events`, and the ServiceM8 sync functions.
- **Shared code:**
  - `src/components/ui/*` and `src/components/shell/*`, including the one task panel and + New task;
  - `src/lib/` (`db`, `actions`, `action-types`, `activity`, `auth/`, `files/`, `pdf/`, `select-options`, `requirements`, `jobs/`, `sm8/`, `tasks/`);
  - `src/proxy.ts`, `scripts/`, `vercel.json`, `next.config.ts`, `package.json`.
- **Rules and docs:** `CLAUDE.md`, `docs/plan.md`, `docs/inventory.md` and this file.
- **n8n workflows** "CBS Hub - Files" and "CBS Hub - ServiceM8".
- **Phases:** Phase 1 (jobs and tasks), then Clients, Phase 5 (Money and close) and the parts of Phase 6 not handed out (TV dashboard, notifications, look-ahead, time off, support).
- **Shared helpers other workstreams may call (never edit):** `signToken` / `readToken` (`src/lib/files/ticket.ts`) and `uploadBytes` (`src/lib/files/server-upload.ts`).

## Workstreams

| Workstream | Branch | Scope | Can start |
|---|---|---|---|
| Core | `phase-1-jobs-tasks` | Phase 1, then as above | now |
| Registers | `registers` | Fleet; Team and training matrix; Subcontractors and suppliers; Insurance and accreditations; Equipment and materials registers (see the scope below) | after Phase 0 is on `main` |
| Safety | `phase-2-safety` | Phase 2 in `docs/plan.md` | after Phase 1 is on `main` |
| Site | `phase-3-site` | Phase 3, minus what Registers built | after Phase 1 and Registers are on `main` |
| Plan | `phase-4-plan` | Phase 4 | after Phase 1 is on `main` |

### Registers scope

Tables and pages from `docs/plan.md` §3.3:

| Area | Tables |
|---|---|
| Fleet | `vehicles`, `vehicle_checks`, `vehicle_services`, `vehicle_accidents` |
| Team and training matrix | `training_records`, plus the matrix page. The People page and the `people` table stay Core. |
| Subcontractors and suppliers | `subcontractors`, `subcontractor_docs`, `suppliers` |
| Insurance and accreditations | `insurance_policies`, `claims`, `company_certs` |
| Team app (agreed on PR #4) | `/team` (secret link, `TEAM_LINK_KEY`) and `/api/team/*`; vehicle checks, accidents, requests and tool reports from the team; owns the `requests` table (moved from Core) |
| Equipment and materials registers | `assets`, `asset_services`, `materials`, `stock_moves`, `stocktakes` and `stocktake_lines` |

On `stock_moves`, leave the job link empty until jobs exist on `main`. Its `job_id` column is nullable and gets its foreign key in a later migration.

Not in Registers, because these need jobs or other phases:

- **Clients**: its tables and the ServiceM8 sync/write-back are built in Phase 1 (Core).
- **`subcontractor_job_docs`, `job_plant`, load-up sheets, stock moves to jobs**: Site.
- **Claim links to jobs and incidents:** claims get `job_id` and `incident_id` columns, with no foreign key until those tables exist.
- **Reminders on the Actions board** (MOT due and so on): Core adds the hook once Phase 1 is on `main`. Until then the registers show their own due and overdue lists.

### Links between Safety, Site and Plan

- **Safety:** owns the crew portal (no sign-in, name picked per action). Site and Plan ask Core before adding to it.
- **Site:** uses `suppliers`, `assets` and `materials` from Registers. QuickBooks and PO reading go through new n8n workflows, with Ethan's OK.
- **Plan:** the programme is the only place a job's start date lives.

## Change process (every session, Core included)

Never commit or push to `main`; every change goes through a pull request (`main` is protected, so a direct push is refused anyway). Every change:

1. Work on a branch, commit, push.
2. Open a pull request that lists what changed and why, and every migration it adds (file name and what it creates or alters), so Ethan can see what went in.
3. Make sure the pull request's preview deploys.
4. Run every check: lint, typecheck, unit tests, the production build, and your browser tests (on the local database, plus the preview where it can be reached). All must pass.
5. When they all pass, merge your own pull request. If any fails, fix it on the same branch first.

- **Stage testing:** Ethan tests at the end of each stage, with one numbered checklist from the session covering the whole area (job 12 and fake data only). Problems he finds are fixed in a new pull request.
- **Conflicts with `main`:** merge `main` into your own branch and fix them there, re-run the checks, then merge. Never fix them on `main`.
- **Switch-over** (importing old data, or moving the team onto a new area) happens only when Ethan says so.
- **Settings:** never change Vercel, Supabase, GitHub or n8n settings, or anything in the live n8n hub, unless Ethan asks.

## Rules for every session except Core

1. **Your branch only.** Create it from the latest `main`. Small commits, clear messages.
2. **Shared code and existing tables.** No changes without asking Ethan, who agrees them with Core. If you need a change to a shared component, a shared `src/lib` file or an existing table, describe it in your pull request or ask; don't edit it yourself. The only shared touch points allowed without asking:
   - **Main menu:** add your own items (one line each) to `NAV` in `src/components/shell/nav.tsx`.
   - **Job pages:** add your own job pages as new route folders, `src/app/(hub)/jobs/[jobNo]/<slug>/page.tsx`, using the slugs in `src/lib/jobs/menu.ts`. A real page replaces the "comes in Phase N" placeholder automatically.
3. **New tables only through your own migration files:**
   - **File name:** `supabase/migrations/<YYYYMMDDHHMMSS>_<workstream>_<what>.sql`, for example `20261030093000_registers_fleet.sql`.
   - **Your own tables only:** create only your own tables, functions and indexes. Never alter, drop or add columns to Core's tables or another workstream's. Foreign keys to `people`, `files` and `jobs` are fine.
   - **Additive and backward compatible:** this is the README rule. Never edit a migration once it is on `main`.
   - **Follow the plan:** tables follow `docs/plan.md` §3.1 (identity `id`, `created_at`/`created_by`, `updated_at`/`updated_by`, the `set_updated_at()` trigger, RLS on with no policies) and match the plan's table. If you need to differ, ask.
4. **Use the shared parts. Never build a second copy:**
   - saves: `GuardedForm` + `SaveButton` for every save, `guarded()` in every server action, `logActivity()` for every change;
   - page reads: `readDb()`;
   - screens: `ConfirmDialog` for deleting, `Drawer`/`Modal`, `SearchBox` on every list, `SelectWithAdd` for dropdowns;
   - files and PDFs: `UploadFile` and `DocViewer` for files, `HousePdf` for every PDF.
5. **Tasks:** never write to the `tasks` table directly; use the Core helper in `src/lib/tasks` once Phase 1 is on `main`. Saving a record never completes a task.
6. **Before each pull request:** `git fetch origin main && git rebase origin/main`, then run `npm run lint && npm run typecheck && npm test` and a production build. Open the pull request listing what changed and any migrations, then follow "Change process" above.
7. **Testing:** use a local database only, test job 12 (the only ServiceM8 test job) and fake test data. Never run migrations or scripts against the environment's `DATABASE_URL` yourself: it can be the live database, and the hard block refuses it. **Never change Vercel, Supabase, GitHub or n8n settings**: read-only unless Ethan explicitly asks.
8. **n8n:** never change an existing workflow. A new workflow needs Ethan's OK and is named "CBS Hub - <thing>".
9. **Approach first:** explain your approach for anything non-trivial and wait for Ethan's go-ahead (`CLAUDE.md`).
10. **Secrets:** never in chat, code or commits.

## Local database (each new session)

Every session runs in its own container. Set up a local Postgres 16 once (if `/usr/lib/postgresql/16` is missing, install it first with `apt-get install -y postgresql-16`):

```bash
id pgdev >/dev/null 2>&1 || useradd -m pgdev
```

```bash
mkdir -p .local/pg && chown pgdev .local/pg && su pgdev -c "/usr/lib/postgresql/16/bin/initdb -U postgres --auth=trust -D $PWD/.local/pg/data"
```

```bash
su pgdev -c "/usr/lib/postgresql/16/bin/pg_ctl -D $PWD/.local/pg/data -o '-p 54329 -k /tmp' -l /tmp/pg.log start"
```

```bash
createdb -h 127.0.0.1 -p 54329 -U postgres cbs_hub
```

```bash
DATABASE_URL=postgres://postgres@127.0.0.1:54329/cbs_hub npm run db:migrate && DATABASE_URL=postgres://postgres@127.0.0.1:54329/cbs_hub npm run db:seed-local
```

The container's own `DATABASE_URL` is the live database. Always prefix local commands with the local address as above. If Postgres stops when the container restarts, remove `.local/pg/data/postmaster.pid` and run the `pg_ctl` line again.

## First prompts for new sessions

Paste one of these as the first message of a new Claude Code session on this repository.

### Registers (after Phase 0 is on `main`)

```text
You're joining the CBS Operations Hub rebuild as the Registers workstream, working in parallel with other sessions. Before anything else, read CLAUDE.md, docs/parallel-work.md, docs/plan.md and docs/inventory.md (section 5 is binding), and follow docs/parallel-work.md exactly: work only on a new branch `registers` from the latest main, never change shared components, shared lib files or existing tables (ask me instead), and add tables only through your own migration files named <timestamp>_registers_<what>.sql.

Scope (tables as defined in docs/plan.md section 3.3): Fleet (vehicles, vehicle checks, services, accidents; miles, "Vehicle Tax"), Team and training matrix (training records and the matrix page; the People page stays as it is), Subcontractors and suppliers (subcontractors, subcontractor documents, suppliers), Insurance and accreditations (insurance policies, claims, company certificates), and the Equipment and materials registers (assets, asset services, materials, stock moves without job links, stocktakes). Not in scope: Clients, anything linked to jobs (subcontractor job documents, plant bookings, load-ups, stock moves to jobs), and Actions board reminders. The old hub's behaviour for each area is in /legacy (pages/cbs-admin.html and the matching legacy/tables files); use it as reference only and never copy behaviour listed in docs/inventory.md section 5.

Use the shared parts for everything (GuardedForm/SaveButton, guarded(), logActivity(), readDb(), ConfirmDialog, Drawer/Modal, SearchBox on every list, SelectWithAdd, UploadFile/DocViewer, HousePdf). Test on a local database only (setup in docs/parallel-work.md); never run anything against the environment's DATABASE_URL.

Change process (docs/parallel-work.md, binding): never commit to main. Every change is a branch and a pull request that lists what changed and any migrations. Once lint, typecheck, unit tests, the build and your browser tests all pass and the preview deploys, merge it yourself. I test at the end of each stage with one numbered checklist from you covering the whole area (job 12 and fake data only). Switch-over happens only when I say so. Never change Vercel, Supabase, GitHub or n8n settings, or the live n8n hub, unless I ask.

First step: don't build yet. Read the docs and the old hub for these areas, then give me your approach: the tables and pages per area, the order you'll build them in (one small pull request per area is fine), anything in docs/plan.md you think needs changing, and any shared change you'd need from the Core session. Wait for my go-ahead.
```

### Safety (after Phase 1 is on `main`)

```text
You're joining the CBS Operations Hub rebuild as the Safety workstream (Phase 2), working in parallel with the Site and Plan sessions. Before anything else, read CLAUDE.md, docs/parallel-work.md, docs/plan.md and docs/inventory.md (section 5 is binding), and follow docs/parallel-work.md exactly: work only on a new branch `phase-2-safety` from the latest main, never change shared components, shared lib files or existing tables (ask me instead), and add tables only through your own migration files named <timestamp>_safety_<what>.sql.

Scope: everything in Phase 2 of docs/plan.md: RAMS (templates, hazard library), CPHSP (wording), permits, pre-starts, inspections (site and scaffold), toolbox talks (topics), sign-ons, visitors, incidents (reports, RIDDOR), CoSHH (substances, job CoSHH), the H&S policy, and the crew job portal (no sign-in, name picked per action, never remembered). Each record creates its PDF in the house format and its SharePoint copy in the job's folder (src/lib/requirements.ts gives the folder). Job pages go in their own route folders under src/app/(hub)/jobs/[jobNo]/<slug>/ using the slugs in src/lib/jobs/menu.ts. Saving a record never completes its task; use the src/lib/tasks helper for anything task-related. The old hub's builders are in /legacy (pages/cbs-rams-builder.html, cbs-cphsp-builder.html, cbs-toolbox-builder.html, cbs-permit.html, cbs-prestart.html, cbs-site-inspection.html, cbs-incident-report.html, cbs-coshh-builder.html, cbs-sign.html, cbs-visit.html, cbs-hs.html and the matching workflows); reference only, never copy docs/inventory.md section 5 behaviour.

Test on a local database with test job 12 (setup in docs/parallel-work.md); never run anything against the environment's DATABASE_URL.

Change process (docs/parallel-work.md, binding): never commit to main. Every change is a branch and a pull request that lists what changed and any migrations. Once lint, typecheck, unit tests, the build and your browser tests all pass and the preview deploys, merge it yourself. I test at the end of each stage with one numbered checklist from you covering the whole area (job 12 and fake data only). Switch-over happens only when I say so. Never change Vercel, Supabase, GitHub or n8n settings, or the live n8n hub, unless I ask.

First step: don't build yet. Give me your approach: tables, pages, the order of small pull requests, anything in docs/plan.md to change, and any shared change you'd need from the Core session. Wait for my go-ahead.
```

### Site (after Phase 1 and Registers are on `main`)

```text
You're joining the CBS Operations Hub rebuild as the Site workstream (Phase 3), working in parallel with the Safety and Plan sessions. Before anything else, read CLAUDE.md, docs/parallel-work.md, docs/plan.md and docs/inventory.md (section 5 is binding), and follow docs/parallel-work.md exactly: work only on a new branch `phase-3-site` from the latest main, never change shared components, shared lib files or existing tables (ask me instead), and add tables only through your own migration files named <timestamp>_site_<what>.sql.

Scope: Phase 3 of docs/plan.md, building on the registers already on main (suppliers, assets, materials): daily diary, purchase orders (QuickBooks upload and AI PO reading through new n8n workflows, only with my OK), plant booked to jobs, stock moves to jobs and stocktakes in use, load-up sheets, snagging, forms (checklists, pre-use checks, subcontractor audits), subcontractor job documents, the yard tablet page and the ServiceM8 onsite add-on (shared device, no sign-in, name picked per action). Job pages go in their own route folders under src/app/(hub)/jobs/[jobNo]/<slug>/ using the slugs in src/lib/jobs/menu.ts. Saving a record never completes its task; use the src/lib/tasks helper for anything task-related. The crew portal belongs to the Safety workstream: ask before adding to it. The old hub is in /legacy (cbs-po.html, cbs-po-board.html, cbs-ptm-sheet.html, cbs-ptm-crew.html and the matching workflows); reference only, never copy docs/inventory.md section 5 behaviour.

Test on a local database with test job 12 (setup in docs/parallel-work.md); never run anything against the environment's DATABASE_URL.

Change process (docs/parallel-work.md, binding): never commit to main. Every change is a branch and a pull request that lists what changed and any migrations. Once lint, typecheck, unit tests, the build and your browser tests all pass and the preview deploys, merge it yourself. I test at the end of each stage with one numbered checklist from you covering the whole area (job 12 and fake data only). Switch-over happens only when I say so. Never change Vercel, Supabase, GitHub or n8n settings, or the live n8n hub, unless I ask.

First step: don't build yet. Give me your approach: tables, pages, the order of small pull requests, anything in docs/plan.md to change, and any shared change you'd need from the Core session. Wait for my go-ahead.
```

### Plan (after Phase 1 is on `main`)

```text
You're joining the CBS Operations Hub rebuild as the Plan workstream (Phase 4), working in parallel with the Safety and Site sessions. Before anything else, read CLAUDE.md, docs/parallel-work.md, docs/plan.md and docs/inventory.md (section 5 is binding), and follow docs/parallel-work.md exactly: work only on a new branch `phase-4-plan` from the latest main, never change shared components, shared lib files or existing tables (ask me instead), and add tables only through your own migration files named <timestamp>_plan_<what>.sql.

Scope: Phase 4 of docs/plan.md: scope of works, programme (the only place a job's start date lives), drawings (with markups and task pins), pre-construction information, RFIs, variations, site surveys and enquiry prep (estimate-stage records). The pages open at Estimate are Scope, Programme, Drawings and Pre-con info; the rest unlock once the job is Approved (src/lib/jobs/menu.ts). Job pages go in their own route folders under src/app/(hub)/jobs/[jobNo]/<slug>/. Saving a record never completes its task; use the src/lib/tasks helper for anything task-related. The old hub is in /legacy (programme, scope, drawings, rfis, variations, site-survey and enquiry-prep workflows, cbs-pci.html); reference only, never copy docs/inventory.md section 5 behaviour (the old programme, RFI and variation pages use browser pop-ups: all prompts are in-app here).

Test on a local database with test job 12 (setup in docs/parallel-work.md); never run anything against the environment's DATABASE_URL.

Change process (docs/parallel-work.md, binding): never commit to main. Every change is a branch and a pull request that lists what changed and any migrations. Once lint, typecheck, unit tests, the build and your browser tests all pass and the preview deploys, merge it yourself. I test at the end of each stage with one numbered checklist from you covering the whole area (job 12 and fake data only). Switch-over happens only when I say so. Never change Vercel, Supabase, GitHub or n8n settings, or the live n8n hub, unless I ask.

First step: don't build yet. Give me your approach: tables, pages, the order of small pull requests, anything in docs/plan.md to change, and any shared change you'd need from the Core session. Wait for my go-ahead.
```
