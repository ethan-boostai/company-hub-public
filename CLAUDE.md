# CBS Operations Hub — build rules

Operations Hub for Chelmsford Building Services (CBS), UK. A build for CBS only — not a multi-tenant product. Keep it simple and direct.

This repo replaces the original n8n-served hub (pages served from n8n webhooks on https://old-hub.example, data in n8n data tables). The old hub stays live until each area here is tested and switched over.

## Stack
- Next.js (App Router, TypeScript), Tailwind
- Supabase (London region): Postgres + Storage only. No Supabase Auth.
- Vercel (London region) for hosting. Push to `main` = live. Feature branches = preview URLs.
- n8n stays for integrations only: ServiceM8, QuickBooks, SharePoint, PO PDF reading, notifications. n8n reads and writes Supabase or calls this app's API routes.
- Secrets live in `.env.local` and Vercel env vars. Never commit them.

## Sign-in
- Office users: pick name, then 4-digit PIN. Signed-in name shown top right on every page and recorded on every change.
- No sign-in inside the onsite app (ServiceM8 add-on). It's a shared device app; the name is picked per action, never remembered.

## Integrations
- ServiceM8 is the master for jobs, the schedule (who's on site and when) and folders. Jobs are created in ServiceM8 only. Never build anything that excludes ServiceM8.
- Use ServiceM8 webhooks over polling wherever possible.
- Documents go to SharePoint (tenant: chelmsfordbuildingservices). CBS doesn't use Google Drive.
- Microsoft Graph app registration is single-tenant: use tenant-specific auth/token URLs, not /common.
- CBS invoice and raise POs in QuickBooks.

## Job model
- Two job types only: Project or CDM. Every job starts as Project and can convert to CDM (and back) at any time. Every workflow must allow for both.
- Hub stage names: Estimate (ServiceM8 Quote), Approved (Work Order), Completed, Unsuccessful. Use hub names everywhere, colour coded.
- Folder and status changes: no restrictions, any to any, always visible. Close out sets Completed in ServiceM8 and moves the job to "Works completed".
- One job page per job (no tabs). Left menu inside a job shows that job's pages, grouped Plan / Safety / Site / Money and close, with estimate-stage lock-out.
- Start date lives on the programme only.

## Tasks
- Every task is a single task. No items or lines inside tasks.
- Three statuses: To do, In progress, Done. Verified is a sign-off step after Done. "In hand" is a note on an In progress task, not a status.
- One task panel, used everywhere. Never build a second copy of it.
- Task panel has one Save, one Assigned to + Due row in the same place, Upload file on every job task, and the office can mark any task Done by hand.
- Generic tasks with no job don't get file uploads.
- No Category field. Category is automatic (requirement tasks by requirement, one-off tasks Office).
- Tasks are created through + New task: Office tasks / On site tasks toggle, requirements grouped by stage (Estimate, Approved: Planning, Approved: on site, Completed), Other (one-off) at the top.
- Requirement types are built in, defined in code only. The office can't add its own types.
- Saving a record (e.g. a survey) never auto-completes its task. Office closes tasks by hand.
- The TV dashboard's tasks show exactly what's on the Actions board, no filters.

## Old hub
- `docs/inventory.md` section 5 lists old behaviour that breaks these rules. Follow it: never copy that behaviour into the rebuild.

## UI rules (non-negotiable)
- No button may ever double save. Disable on submit, guard server-side.
- Deleting saved data needs an in-app "are you sure" step. Small in-form removals don't.
- No browser pop-ups (alert/confirm/prompt). All prompts are in-app.
- No page scrollbar behind a drawer or modal. Only the drawer scrolls.
- Left menu always available. On mobile: menu button and a narrow drawer, no sticky menu.
- Standard page layout (`docs/decisions.md`, "Page standard"): white header with ‹ Back, global search, + New task and the signed-in name pill (Sign out in its menu); the page top with the title and "N records", then Needs attention, Reports ▾, More ▾ and one orange + New. Build pages from the shared parts only.
- Every list that holds data gets its own search box.
- Every dropdown lets users add new options.
- Documents and photos open in-window (dark backdrop) with an option to open full screen in a new tab.
- Buttons named Create, Add or Open + the thing (Create RAMS, Add CoSHH, Open scope).
- Uploads accept any file type ("Upload file").
- Reports let the user choose what to include.
- Spell check on all text inputs.
- UK English, miles, "Vehicle Tax" not "Rego".
- All builder PDFs use one standard house PDF format.

## Testing
- Never test on real jobs or real tasks. Use test job 12 (in ServiceM8) and fake test tasks. Until the Phase 1 switch-over is approved, the hub may only change job 12 in ServiceM8.
- Give Ethan test instructions as clear numbered steps.

## Change process (every change, every session)
Never commit or push to `main`; every change goes through a pull request. Every change:
1. Work on a branch, commit, push.
2. Open a pull request that lists what changed and why, and every migration it adds (file name and what it creates or alters), so Ethan can see what went in.
3. Make sure the pull request's preview deploys.
4. Run every check: lint, typecheck, unit tests, the production build, and your browser tests (on the local database, plus the preview where it can be reached). All must pass.
5. When they all pass, merge your own pull request. If any fails, fix it on the same branch first.
- Ethan tests at the end of each stage, with one numbered checklist from the session covering the whole area (job 12 and fake data only). Problems he finds are fixed in a new pull request.
- A conflict with `main` is fixed on your own branch (merge `main` into it), never on `main`.
- Switch-over (importing old data, or moving the team onto a new area) happens only when Ethan says so.
- Never change Vercel, Supabase, GitHub or n8n settings, or anything in the live n8n hub, unless Ethan asks.

## Working process
- Explain the approach before building anything non-trivial and wait for a go-ahead.
- Small commits, one branch per feature.
- The old n8n hub is reference only: read it, never change production n8n workflows without asking.
- Parallel sessions: `docs/parallel-work.md` says who owns shared parts, schema and migrations, and the rules every session follows.
