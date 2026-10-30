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
| Site: plant and materials on a job (Ethan, 30/10/2026) | `job_plant`, `stock_moves.job_id`, load-up sheets, the yard app (`/yard`, opened with the team-app key) and plant pre-use checks; job pages Plant, Materials and Load-up. Core keeps the daily diary, POs, snagging and the onsite app. |

On `stock_moves`, leave the job link empty until jobs exist on `main`. Its `job_id` column is nullable and gets its foreign key in a later migration.

Not in Registers, because these need jobs or other phases:

- **Clients**: its tables and the ServiceM8 sync/write-back are built in Phase 1 (Core).
- **`subcontractor_job_docs`**: Site. (`job_plant`, load-up sheets and stock moves to jobs moved to Registers on 30/10/2026.)
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

## Preview check before every merge (Ethan, 30/10/2026)

- Previews are reachable from cloud sessions now. Before merging, open your PR's preview with the bypass headers and sign in as Preview Admin (`PREVIEW_ADMIN_PIN`); `node scripts/preview-open.mjs <preview url> [path]` does both. Check the pages your PR changes on job 12 with fake ZZ data (`CLAUDE.md`, Change process).

## n8n is read-only for every session (Ethan, 30/10/2026)

- Never change anything in n8n, including the hub's own "CBS Hub - …" workflows. Any n8n change goes through Ethan or the adviser. `.claude/settings.json` blocks the n8n change tools.
- Before building a page, refresh it in `/legacy` from the live hub and run `python3 private/fake-legacy.py` on it before committing (`CLAUDE.md`, Working process).

## Public copy and client settings (Core, 30/10/2026; read before your next push)

- **`ethan-boostai/company-hub-public`** is a public, cleaned copy of `cbs-hub`'s `main`. `cbs-hub` stays private and its history was **not** rewritten, so no re-clone is needed. After every merge to `main`, run `node scripts/public-mirror.mjs` then `--push` (see `CLAUDE.md`, "Public copy"). If the scan reports anything, stop and tell Ethan.
- Fake data only from now on (ZZ names, `ZZ01ZZA` registrations, `07700 900nnn`, `ZZ99`, `example.com`). New real names go in `private/public-denylist.txt`.
- **Client-specific settings, not hard-coded** (`CLAUDE.md`): this is a starter template copied for other clients; move anything CBS-specific you touch into settings in the same PR.

## Safety changes to Registers' tables (Core, 30/10/2026)

- `materials.sds_substance_id → substances` (migration `20261030140000_safety_hazards_coshh.sql`, later than everything on main when it was added). It links a material to its CoSHH substance (and so its safety data sheet). Nothing in Registers' screens uses it yet: Registers, add a "CoSHH substance" dropdown to the material form when convenient (read `substances`: id, product, supplier name; no add-new, substances are added on Hazards and CoSHH).
- People: the "Issue H&S policy" tick is the `hs_issue` entry in `people.lists` (like `crew` and `time_off`). Check it with `canIssuePolicy(person.id)` in `src/app/(hub)/people/data.ts`.
- People: the "Can approve permits" tick is `permit_approve` in `people.lists`; check it with `canApprovePermits(person.id)`.
- `/crew/<job>` and `/api/crew/…` are open without sign-in (like `/team`), checked by the job's crew link token (`src/lib/signons/crew-link.ts`).
- `subcontractors`: Job > RAMS > + New > Subcontractor RAMS can add a subcontractor by company name only (insert, no other columns; logged). No schema change. Their other details are filled in on Subcontractors and suppliers.
- Hazards list equipment categories from Registers' `equipment.category` options (read-only).
- The CoSHH supplier dropdown can add a supplier with just a name to `suppliers` (logged as usual).

## /legacy refreshed and the old hub viewer (Core, 30/10/2026; read before your next page)
- **/legacy has been refreshed from the live hub** (30/10): all 67 "CBS - …" workflows, every page in `legacy/pages/` (now including `cbs-yard.html`) and the column layouts in `legacy/tables/` (no new data rows). What changed since 27/10 is in `legacy/README.md`. **Registers: your Site work (load-up, yard, plant) must check against the new copy**: plant overdue back cards, Plant Return (`cbs-plant-act`: back in yard / extend / move), Found at the yard clears the job, pre-use checks on the crew portal and Book in Job all arrived on 28–29/10.
- **Live screenshots: take them yourself.** Before building or checking any page that exists in the old hub, screenshot the live page beside your build. Use only `scripts/old-hub.mjs` (`node scripts/old-hub.mjs "<path?query>" <out.png> [--mobile] [--full]`, or import `openOldHub`). It signs in once with `OLD_HUB_NAME` / `OLD_HUB_PIN` (address in `OLD_HUB_URL`), aborts every request that isn't a GET (and GETs that save), and dismisses pop-ups. Never open the old hub any other way, never type into or submit its forms beyond opening a view, never sign anything.
- **Screenshots show real data:** save them outside the repo (the script's default is the OS temp folder) or in `private/screens/` (git-ignored). Never commit them; never put them in the public copy.
- The faking map (`private/fakemap.py`) now also fakes mobiles and geographic phone numbers, emails and postcodes. Run it on anything you bring into `/legacy`.

## Plant overdue back (Registers, 30/10/2026; for Core's Actions board cards)
- **The list:** `overduePlant(sql, today)` in `src/app/(hub)/_site/plant.ts` returns plant still out on a job whose due back date is before today, oldest first: `{ bookingId, assetId, item, jobId, jobNo, outWith, dueBack }`. Group the cards by job (`jobNo`) or by `outWith`.
- **The actions** (server-side, one transaction each, all in the same file): `returnPlant(tx, { bookingId, to, by })` (Back in the yard; `to` is a location, normally `{ place: "CBS Warehouse" }`), `extendPlant(tx, { bookingId, dueBack, by })` (Extend) and `movePlant(tx, { bookingId, toJobId, to: null, dueBack, by })` (Move to another job, with whoever has it). They throw `PlantRefused` with a message to show. The yard Plant tab and the job's Plant page already use them.
- Found at the yard (or anywhere) closes the booking straight away (`foundPlant`), so a found item never shows as overdue.

## Page standard (every page, every session)

Ethan approved one page layout on 29/10/2026 (`docs/decisions.md`, "Page standard"). Build every page from the shared parts, never your own copies:

- `PageHeader` (white header) with `bare` when the page has a `PageTop`.
- `RegisterLayout` (`src/components/ui/page-top.tsx`) around the page: pass your own `AttentionItem`s (overdue / soon, tag, name, detail, open) and it draws the Needs attention panel down the right (320px, » to hide, All clear when empty, a button bottom right under 1100px). The page's own `main` has no padding; `RegisterLayout` adds it.
- `PageTop`: title and "N records"; Reports ▾ (Create report, choosing what to include); More ▾ only if needed; one orange + New (one kind: "+ New vehicle"; several kinds: "+ New ▾").
- Under it, in this order: `FilterPills`, then `FilterRow` (with `SearchBox`), then `DataTable` (first column bold, `sub` for the grey line) and `StatusPill` (`src/components/ui/register.tsx`).
- No due or attention panels, or extra buttons, between the page top and the filter pills: those items go into Needs attention.
- Team tabs (`src/components/shell/team-tabs.tsx`) on Training and qualifications (`/training`) and Team requests (`/requests`). Neither is a menu item of its own: the menu highlights Team on them. Core added the "Team" title and the tabs to both pages when merging main; the rest of their layout update is Registers'.
- Match the build's look, not live (`docs/decisions.md`, "The build's look is the approved standard").
- Time off tab (Registers): show the tab, its notes and its files only to people with the Time off tick. Check it server-side with `canSeeTimeOff(person.id)` (`src/app/(hub)/people/data.ts`, the `time_off` entry in `people.lists`), on the page and on every route that returns its notes or files, not just by hiding the tab. Nobody is ticked by default; on dev, Ethan Paraha and Preview Admin are.

Fleet is converted (Core did it as the example: `src/app/(hub)/fleet/fleet-client.tsx`; it also gained `src/app/api/fleet/report/route.ts` for Reports ▾ and lost the + New ▾ list, as checks, services and accidents are added inside the vehicle). Registers: convert Insurance and accreditations, Team training, Equipment and materials (its "due" list becomes Needs attention items), Subcontractors and suppliers, Team requests and Training and qualifications the same way, and move Fleet's other lists to `DataTable` if you want them as tables. The old `NeedsAttention` button and drawer are gone; `PageTop` no longer takes `attention`.

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
