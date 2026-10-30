# CBS Operations Hub — build rules

Operations Hub for Chelmsford Building Services (CBS), UK. A build for CBS only — not a multi-tenant product. Keep it simple and direct.

This repo replaces the original n8n-served hub (pages served from webhooks on the old hub's n8n instance, data in n8n data tables). The old hub stays live until each area here is tested and switched over.

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
- Use the old live hub only to view and screenshot it, and only through `scripts/old-hub.mjs` (signs in with `OLD_HUB_NAME` / `OLD_HUB_PIN`; aborts every request that isn't a GET except its own sign-in). Never open the old hub any other way.
- Never type into or submit live forms beyond what's needed to open a view. Never sign documents.
- Old hub screenshots show real data: never commit them and never put them in the public copy. Keep them outside the repo or in `private/screens/` (git-ignored).
- Before building or checking any page that exists in the old hub, take the live screenshots yourself and put them beside your build. Keep using the old code in `/legacy` on fake data for anything shared or published.

## UI rules (non-negotiable)
- No button may ever double save. Disable on submit, guard server-side.
- Deleting saved data needs an in-app "are you sure" step. Small in-form removals don't.
- No browser pop-ups (alert/confirm/prompt). All prompts are in-app.
- No page scrollbar behind a drawer or modal. Only the drawer scrolls.
- Left menu always available. On mobile: menu button and a narrow drawer, no sticky menu.
- Standard page layout (`docs/decisions.md`, "Page standard"): white header with ‹ Back, global search, + New task and the signed-in name pill (Sign out in its menu); the page top with the title and "N records", then Needs attention, Reports ▾, More ▾ and one orange + New. Build pages from the shared parts only.
- Every hub page uses `PageHeader`, `PageTop`, `RegisterLayout`, `FilterPills`, `DataTable`, `Button` and `ReportDialog`. No hand-built page tops, panels, tables, buttons or report dialogs. Menu items only change in `nav.tsx`.
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
- **Preview check (before every merge):** previews sit behind Vercel Authentication. Open them with the `x-vercel-protection-bypass` header set to `VERCEL_AUTOMATION_BYPASS_SECRET` plus `x-vercel-set-bypass-cookie: true`, and sign in as Preview Admin with `PREVIEW_ADMIN_PIN` (both in the session environment; never print them). `node scripts/preview-open.mjs <preview url> [path] [shot.png]` does both and takes a screenshot; reuse its headers and sign-in in your own preview scripts. On the preview, open the pages the PR changes and do its main actions on job 12 with fake ZZ data (previews use the dev database and the SharePoint test folder). Merge only when that works.
- Ethan tests at the end of each stage, with one numbered checklist from the session covering the whole area (job 12 and fake data only). Problems he finds are fixed in a new pull request.
- A conflict with `main` is fixed on your own branch (merge `main` into it), never on `main`.
- Switch-over (importing old data, or moving the team onto a new area) happens only when Ethan says so.
- Never change Vercel, Supabase or GitHub settings unless Ethan asks.
- Never change anything in n8n: workflows (including the hub's own "CBS Hub - …" workflows), data tables, credentials or settings. Any n8n change goes through Ethan or the adviser. Reading is fine. `.claude/settings.json` blocks the n8n change tools for every session.

## Client-specific settings, not hard-coded
This codebase is a starter template that gets copied for other clients. Anything specific to CBS goes in a settings table or config file, never scattered through the code. That includes the company name, logo, address and contacts; SharePoint folder paths; ServiceM8 IDs and job rules; email and notification wording; default document wording (policy statement, RAMS standard steps, CPHSP wording); and test job numbers. When you touch existing code that hard-codes any of these, move it into settings as part of the same PR. Don't do a separate clean-up sweep unless Ethan asks.

## Public copy (company-hub-public)
`cbs-hub` stays private. `ethan-boostai/company-hub-public` is a public, cleaned copy of `main` (no PRs, no old branches).
- After every merge to `main` in `cbs-hub`, run `node scripts/public-mirror.mjs` (scan only), then `node scripts/public-mirror.mjs --push`.
- The script scans the new commits first: real names and companies (`private/public-denylist.txt`), vehicle registrations, phone numbers, emails, postcodes, policy and licence numbers, SharePoint links, the live n8n address and secrets. If it reports anything, stop, push nothing and tell Ethan.
- `private/` is never published. Add any new real name you come across to `private/public-denylist.txt`.
- Never push anything else to `company-hub-public`, and never force-push it.
- Use fake data everywhere in code, tests, docs and seeds (ZZ names, `07700 900nnn` phones, `ZZ99` postcodes, `ZZ01ZZA` registrations, `example.com` and `example.sharepoint.com`).

## Working process
- Explain the approach before building anything non-trivial and wait for a go-ahead.
- Small commits, one branch per feature.
- The old n8n hub is reference only: read it, never change it.
- Refresh `/legacy` from live before building each page: fetch the live page (and the scripts it loads) from its URL on the old hub's n8n instance into a scratch folder, run the faking map (`python3 private/fake-legacy.py <files>`), then copy the result into `legacy/pages/` (and update `legacy/pages/_index.md`). Run the faking map before every commit that touches `/legacy`. Never commit live HTML that hasn't been through it.
- Parallel sessions: `docs/parallel-work.md` says who owns shared parts, schema and migrations, and the rules every session follows.
