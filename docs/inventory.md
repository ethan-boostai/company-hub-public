# CBS Operations Hub: inventory of the old n8n hub

What the old hub does today, so each area can be rebuilt and checked against it. Snapshot taken 28/10/2026.

Details per workflow (endpoints, tables, rules, JSON shapes) are in `legacy/workflows/_notes_batch1.md` and `_notes_batch2.md`. The raw workflows, page HTML and table samples are in `/legacy` (see `legacy/README.md`). The rebuild plan and new schema are in `docs/plan.md`.

## 1. How the old hub works

- **Pages** are n8n webhooks (`https://old-hub.example/webhook/<path>`) that return HTML. The HTML is either built in a Code node or stored in the `cbs_page_parts` data table (`page:<path>`), then patched in layers by later workflows.
- **Pattern per feature**: `GET <feature>` (page), `GET <feature>-data` (JSON), `POST <feature>-act {a, job, by, …}` (actions, returns `{ok, message}`).
- **Data**: 74 n8n data tables named `cbs_*`. Most pages read through `cbs-admin-data` (CBS - Hub Data, multi-table read) and write through `cbs-admin-save?a=list|save|del&t=<alias>` (CBS - Operations Backend, column whitelists).
- **Security**: there is no real server-side auth. The register API is open apart from a shared internal key that guards a few writes. The signed-in name is read from the browser's localStorage and sent as `by`.
- **Sign-in**: name + 4-digit PIN for office pages, a 30-day token in localStorage, re-checked at most every 10 minutes. No sign-in inside ServiceM8 frames or on crew pages.
- **Caching**: `cbs_cache` (finished job pages, requirement feeds, "dirty" stamps) and n8n workflow static data, because ServiceM8 and n8n reads are slow. `cbs_load_log` timed page loads.

## 2. Areas, pages and where they go

### 2.1 Hub-wide (main left menu: Jobs, Health and safety, Safety documents, Assets, People and companies, Settings)

| Area | What it does | Old workflows | Main tables | Phase |
|---|---|---|---|---|
| Shell, menu, sign-in, global search | Left menu, header, name + PIN sign-in, people list, job summary, logo | Nav, Pages (`cbs-admin` page, guard, search, viewer) | cbs_signin, cbs_workers | 0 |
| Admin registers | One big admin page with every register (team, vehicles, insurance, certs, training, subcontractors, suppliers, assets, hazards, notify rules…) | Pages (`cbs-admin`), Hub Data, Operations Backend | most tables | 0 (shell), then per area |
| Document viewer and files | Open SharePoint files in-window via a proxy; upload, rename, move, delete; zips and combined PDFs | Files, Combined PDF Downloads | (SharePoint) | 0 |
| Jobs list / pipeline | Enquiry and job pipeline from ServiceM8 | Enquiry Prep (`cbs-pipeline`, `cbs-jobs`), Clients | cbs_jobs | 1 |
| ServiceM8 sync | Webhooks + 5-minute poll: restore folders, create Job Files, mark changes; job lookup, attach documents to jobs, schedule | Auto Job Files, ServiceM8 Job Lookup & Attach | cbs_jobs, cbs_cache | 1 |
| Clients and contacts | Client people per ServiceM8 company; new job data | Clients | cbs_client_contacts | 1 |
| Tasks | Single task model, Actions board (To do / In progress / Done), task drawer, + New task, crew portal, job files browser | Tasks, Task Status, Task Checklist, Site Tasks, Job Task Done, Actions Feed | cbs_job_tasks, cbs_task_status | 1 |
| Notifications | `cbs-notify` → ServiceM8 job note (crew portal link + PDF) or hub notice; file alerts | (notify hook in batch 1), File Alerts | cbs_notify_rules, cbs_hub_notices, cbs_file_alerts | 1 |
| Today on site / look-ahead | Per-job roll-up for today; 2-week look-ahead | Today On Site, Look-ahead | (reads many) | 3 |
| TV dashboard | Office TV: tiles, needs attention, on now, expiring, enquiries, job requirement grid, cast a job | TV Dashboard | cbs_tv_settings | 6 |
| Team page (crew) | Vehicle check, accident, incident/near miss, request, lost/damaged tool, time off | Team, Pages (`cbs-team`) | cbs_vehicle_checks, cbs_vehicle_accidents, cbs_incidents, cbs_requests, cbs_time_off, cbs_photos | 6 |
| Yard tablet | Plant faulty/missing/found, materials returned, load-up problems, stock take + office approval | Yard | cbs_stocktakes, cbs_assets, cbs_materials, cbs_stock_moves | 3 |
| Support | Bug reports and feature requests with photos | Support | cbs_support | 6 |
| Company H&S | H&S policy, company docs, accreditations, training uploads, nearest hospital | Document Saves (`cbs-company-doc`, HS), Files, Nearest Hospital, Pages (`cbs-hs`) | cbs_hs_policy, cbs_company_certs, cbs_training | 2 / 6 |
| ServiceM8 add-on | Onsite add-on router and icons (crew, shared device, no sign-in) | Add-on Router, Add-on Icons | – | 3 |
| Excel → ServiceM8 | Creates ServiceM8 jobs from an Excel workbook | Excel to ServiceM8 (Create Job) | – | stays in n8n (integration) |

### 2.2 Inside a job (one Job File page per job; left menu grouped)

Job · Summary, then:

| Group | Page | Old workflows | Main tables | Phase |
|---|---|---|---|---|
| – | Job File (job page, requirements, notes, photos, plant, stage/type changes) | Job File, Job Regs, Enquiry Prep (`cbs-enquiry-*`) | cbs_jobs, cbs_job_tasks, cbs_photo_tags, cbs_cache | 1 |
| Plan | Scope of works | Scope | cbs_scope | 4 |
| Plan | Programme (Gantt, phases/tasks, undo, go-live), progress by area | Programme, Programme Page, Progress by Area | cbs_programmes, cbs_prog_items | 4 |
| Plan | Drawings (register, viewer, markups, pins) | Drawings | cbs_drawings | 4 |
| Plan | Pre-con info | Job Safety Pages (`cbs-job-pci`), Pages (`cbs-pci`) | cbs_pci | 4 |
| Plan | RFIs (RFI-001) | RFIs | cbs_rfis | 4 |
| Plan | Variations (VAR-001; Raised → Priced → Submitted → Approved/Rejected) | Variations | cbs_variations | 4 |
| Plan | Site survey (estimate stage, versions) | Site Survey | cbs_surveys | 4 |
| Safety | RAMS (builder + templates + hazard icons) | Pages (`cbs-rams-builder`), Document Saves, Job Safety Pages | cbs_rams, cbs_rams_types, cbs_hazards | 2 |
| Safety | CPHSP (CDM) | Pages (`cbs-cphsp-builder`), Document Saves | cbs_cphsp, cbs_cphsp_wording | 2 |
| Safety | Permits (CDM; contractor link, approve/reject/close) | Document Saves (`cbs-permit-*`), Pages (`cbs-permit`) | cbs_permits | 2 |
| Safety | Pre-starts (signing today's pre-start = the day's sign-on) | Pages (`cbs-prestart`), Document Saves | cbs_prestarts | 2 |
| Safety | Inspections (site, scaffold) | Job Inspections, Pages (`cbs-site-inspection`), Document Saves | cbs_inspections, cbs_scaffold_insp | 2 |
| Safety | Toolbox talks / team meetings | Pages (`cbs-toolbox-builder`, `cbs-team-meeting`), Job Inspections, Document Saves | cbs_toolbox, cbs_tb_topics | 2 |
| Safety | Sign-ons (and stamping signatures onto PDFs) | Pages (`cbs-sign`), Sign-on Stamp, ServiceM8 Job Lookup & Attach (`cbs-sign-*`) | cbs_signons | 2 |
| Safety | Visitors (CDM) | Document Saves (`cbs-visit-*`), Pages (`cbs-visit`) | cbs_visitors | 2 |
| Safety | Incidents (record + formal report, RIDDOR) | Pages (`cbs-incident-report`), ServiceM8 Job Lookup & Attach (`cbs-incident-*`) | cbs_incidents, cbs_incident_reports | 2 |
| Safety | CoSHH (register, assessments, SDS, job CoSHH, packs) | CoSHH, Pages (`cbs-coshh-builder`) | cbs_substances, cbs_job_coshh | 2 |
| Site | Daily diary (CDM) | Daily Diary | cbs_diary | 3 |
| Site | Purchase orders (QuickBooks upload, AI PO reading, receive) | QuickBooks PO, Pages (`cbs-po`, `cbs-po-board`), ServiceM8 Job Lookup & Attach (`cbs-po-*`) | cbs_purchase_orders, cbs_suppliers | 3 |
| Site | Plant (booked to the job, yard register) | Job File (`cbs-job-plant`), Job Safety Pages (`cbs-job-plantlist`) | cbs_job_plant, cbs_assets | 3 |
| Site | Materials | Job Safety Pages (`cbs-job-materials`) | cbs_materials, cbs_stock_moves | 3 |
| Site | Load-up sheets (plant, tools, materials per van) | Pages (`cbs-ptm-sheet`, `cbs-ptm-crew`), Document Saves, ServiceM8 Job Lookup & Attach (`cbs-ptm-loaded`) | cbs_ptm_sheets | 3 |
| Site | Snagging (S01; push to ServiceM8) | Snagging | cbs_snags | 3 |
| Site | Forms (checklists, pre-use checks, sub audits) | Forms | cbs_form_templates, cbs_form_records | 3 |
| Money and close | Job costing (manual, QuickBooks bills sync) | Job Costing, QuickBooks Sync (inactive) | cbs_job_costs | 5 |
| Money and close | Service sheets (SS-01) | Service Sheets | cbs_service_sheets | 5 |
| Money and close | Close-out (ServiceM8 Completed, "Works completed" folder, report) | Close-out | cbs_jobs.closeout_json | 5 |

**Estimate lock-out (old behaviour)**: while a job is at Estimate, Safety, Site and Money pages (and RFIs and Variations) show a padlock: "opens once the job is Approved". **CDM-only** items: CPHSP, permits, inductions, visitors, daily diary, site inspection.

## 3. All 64 workflows

Workflows marked **drop** are temp, one-off or developer tools; nothing to rebuild.

| Workflow | Active | Rebuild into |
|---|---|---|
| Actions Feed | yes | Tasks (Phase 1) |
| Add-on Icons | yes | ServiceM8 add-on (3) |
| Add-on Router | yes | ServiceM8 add-on (3) |
| Auto Job Files | yes | ServiceM8 sync (1) |
| Clients | yes | Clients (1) |
| Clients to Job Files (one-off) | no | drop |
| Close-out | yes | Close-out (5) |
| CoSHH | yes | CoSHH (2) |
| Combined PDF Downloads | yes | Files (0) |
| Daily Diary | yes | Daily diary (3) |
| Document Saves | yes | Safety builders save pattern (2), company docs (6) |
| Drawings | yes | Drawings (4) |
| Enquiry Prep | yes | Jobs list (1), enquiry prep (4) |
| Excel to ServiceM8 (Create Job) | yes | stays in n8n |
| Feature Probe (temp) | no | drop |
| File Alerts | yes | Notifications (1) |
| Files | yes | Files (0) |
| Forms | yes | Forms (3) |
| Hub Data | yes | replaced by Supabase reads (0) |
| Hub Inspect (temp) | no | drop |
| Job Costing | yes | Job costing (5) |
| Job File | yes | Job page (1) |
| Job Inspections | yes | Inspections, toolbox (2) |
| Job Regs | yes | Job page (1) |
| Job Safety Pages | yes | Safety and Site job pages (2, 3) |
| Job Task Done | yes | Tasks (1) |
| Look-ahead | yes | Today / look-ahead (3) |
| Nav | yes | Shell, sign-in (0) |
| Nearest Hospital | yes | RAMS / CPHSP helper (2) |
| Notify Test (temp) | no | drop |
| Operations Backend | yes | replaced by Supabase writes (0) |
| Page Patch (temp) | no | drop |
| Page Patcher | yes | drop |
| Page Read (temp) | no | drop |
| Pages | yes | split across all phases (see 2.1, 2.2) |
| Programme | yes | Programme (4) |
| Programme Page | yes | Programme (4) |
| Progress by Area | yes | Programme (4) |
| QuickBooks PO | yes | Purchase orders (3); PDF reading stays in n8n |
| QuickBooks Sync | no | Job costing (5), stays in n8n |
| RFIs | yes | RFIs (4) |
| SM8 Historic Load (one-off) | no | drop |
| SM8 Job Title Backfill (temp) | no | drop |
| Scope | yes | Scope (4) |
| Script Block Patch (temp) | no | drop |
| Service Sheets | yes | Service sheets (5) |
| ServiceM8 Client Lookup | no | drop |
| ServiceM8 Connection Test | no | drop |
| ServiceM8 Job Lookup & Attach | yes | ServiceM8 sync (1), POs, incidents, sign-ons, load-ups |
| SharePoint Browse (read only) | no | drop |
| SharePoint Crawl (read only) | no | drop |
| Sign-on Stamp | yes | Sign-ons (2) |
| Site Survey | yes | Site survey (4) |
| Site Tasks | yes | Tasks (1) |
| Snagging | yes | Snagging (3) |
| Support | yes | Support (6) |
| Task Checklist | yes | Tasks (1); checklists are now single tasks |
| Task Status | yes | Tasks (1) |
| Tasks | yes | Tasks, crew portal (1, 2) |
| Team | yes | Team page (6) |
| Today On Site | yes | Today / look-ahead (3) |
| TV Dashboard | yes | TV dashboard (6) |
| Variations | yes | Variations (4) |
| Yard | yes | Yard (3) |

## 4. Integrations

- **ServiceM8** (master for jobs, schedule, folders). Today: webhooks for job/company changes (Auto Job Files) plus a 5-minute poll and many live reads at page load. Reads `job`, `queue` (folders), `jobactivity` (schedule), `staff`, `attachment`, `company`, `companycontact`. Writes job status/folder, job notes (notifications) and attachments (one copy per hub document). The old hub used test job 99901 (not in ServiceM8); the rebuild uses ServiceM8 test job 12 (10278 was used briefly and deleted from ServiceM8 on 28/10/2026). Jobs 10871 and 10885 are generic and ignored.
- **SharePoint** (Microsoft Graph, tenant chelmsfordbuildingservices, drive "CBS System"). `Operations/Jobs/Job N/<folder>/`, `Operations/Enquiries/Job N/`, `H&S/…`, `Fleet/<REG>/…`. Builder PDFs overwrite their own file; other uploads are renamed on clash. Full layout in `_notes_batch1.md` and `_notes_batch2.md`. The old Graph credential is delegated (files show as uploaded by ZZ Person A); the new app needs a single-tenant app registration.
- **QuickBooks**: POs raised in QuickBooks; PO PDF upload; bills/expenses sync into job costs (inactive).
- **PO PDF reading**: OpenRouter, Claude Haiku 4.5, JSON-only prompt. Stays in n8n.
- **Notifications**: one hook `cbs-notify {event, job_no, message, link, pdf, sign}`; rules per event in `cbs_notify_rules` (post a ServiceM8 note yes/no, staff to tag). No email or SMS.
- **PDFs**: mostly made in the browser with jsPDF in the "house" style (A4, orange #F47920 top bar, logo, orange table headers, footer "Chelmsford Building Services Ltd | Job N …", page x of y). A few are hand-written PDF on the server (permits, H&S policy, incident record, sign-on stamping). The rebuild uses one server-side house PDF module.

## 5. Old behaviour that must not be copied

These conflict with `CLAUDE.md`. **This list is binding: the rebuild must not copy any of this behaviour** (also stated in `CLAUDE.md`).

1. Requirement tasks auto-complete when the builder record is saved or a file is uploaded. **New rule: saving never completes a task; the office closes tasks by hand.**
2. Old tasks had checklists (items inside tasks). Already split into single tasks on 27/10/2026; the new model has no items.
3. RFIs, variations, snagging and the programme page use browser `alert` / `confirm` / `prompt`. All prompts become in-app.
4. Pages remember the user's name in localStorage, and crew pages remember it too. Office: signed-in name from the server session. Crew/onsite: name picked per action, never remembered.
5. Registers are readable by anyone with the URL, and shared keys sit in page code. All data access goes through server code with a session check; secrets live in Vercel env vars.
6. Categories are a stored field on tasks. They become automatic (requirement group, or Office for one-off tasks).
7. The TV dashboard's "Needs attention" list adds TV-only alerts and category filters on top of the Actions board feed. In the rebuild the TV's tasks are exactly what's on the Actions board, no filters.
8. Office tasks with no job can have files uploaded (to `Office Tasks/<folder>`). In the rebuild, generic tasks with no job don't get file uploads.
9. Automatic register reminders close themselves when the register record stops triggering them (a `sync()` script in `cbs-admin.html` sets them to Done, "Cleared – fixed in the record"). Roll-up reminders also close themselves. **New rule: nothing closes a task except the office, by hand.**
10. "In hand" is treated as a status in places: the server accepts `In hand`, the Actions board and job Tasks panel group it separately, and the drawings task card has an In hand button. **New rule: In hand is a note on an In progress task, never a status.**
11. There are several task panels: the shared drawer, the board's own fallback drawer, the Job File fallback drawer, the notices view, claim forms, the drawings task card and the old admin Actions board. **New rule: one task panel, used everywhere.**
12. The task screens use browser pop-ups as well as the pages in item 3: `prompt()` for the name and the send-back note and `alert()` in the site-task drawer, `prompt()` on the drawings task card, `confirm()` when closing the task drawer without saving, `prompt('Your name:')` on the board and the job Tasks panel. **New rule: all prompts are in-app; the name comes from the sign-in.**
13. The office's on site controls (Send to site, Move to office, Approve and mark done, Send back to site) exist but are hidden by a CSS rule in the final task drawer, so the office can't see or act on Submitted or sent-back site tasks. **New rule: these controls are visible on every on site task.**
14. On the + New task picker's On site side, the Site survey, Additional surveys, Permits, Pre-use checks and Sub-contractor audit tiles create a one-off site task instead of switching the requirement on, so those requirements can no longer be added to a job. **New rule (approved 28/10/2026): those tiles add the requirement to the job; its task is an On site task.**
15. The Jobs list puts Completed jobs that have no folder under "No folder". **New rule (approved 28/10/2026): "No folder" holds Quote jobs with no folder only; Completed jobs with no folder are not listed there.**
16. The Jobs list hides Unsuccessful jobs from holding folders (On hold, Awaiting client, …) and "No folder" but still shows them in Enquiry, Estimated and Approved. **New rule (28/10/2026): Unsuccessful jobs are hidden everywhere by default, with one "Show unsuccessful" toggle (see plan §3.6).**

## 6. Secrets and hard-coded config found

Values are redacted in `/legacy` and not repeated here. They are still in use in production n8n, so treat them as known to anyone with repo access.

- Internal shared key for the register API (many workflows).
- TV dashboard link token.
- Crew job-portal link salt.
- Fixed prefix used in PIN hashes.
- Not secret but should be config: SharePoint drive id, Excel workbook id, ServiceM8 client uuids (Excel to ServiceM8), list of who may issue the H&S policy.

No API keys, passwords or OAuth tokens are in the workflows: ServiceM8, Graph, QuickBooks and OpenRouter use n8n stored credentials, which were not exported.

## 7. Gaps in this capture

- `cbs_page_parts`: only the first 48 rows were read (the n8n connector dropped beyond about 7.7 MB). All 24 live `page:*` parts are saved; `page:cbs-yard` and any rows after 48 are missing. The 22 backup rows were not kept.
- Pages built inside Code nodes (Nav, Job File parts, Programme Page, Scope, TV, Today) are only in the workflow JSON.
- The global search code lives in n8n workflow static data (`cbs-layout-js`) and is not in the export.
- No sample rows for `cbs_diary`, `cbs_inspections`, `cbs_cache`, `cbs_load_log`, `cbs_client_contacts`, `cbs_stocktakes`, `cbs_photos`, `cbs_page_parts_backup_20261006` (no saved executions read them). Eight more tables are simply empty today (snags, variations, job costs, permits, visitors, pci, job CoSHH, form records).
- JSON shapes of some builder states (RAMS `job_json`, CPHSP / pre-start / inspection `state_json`) are only partly recorded; read the builder page code in `legacy/pages` when rebuilding them.
