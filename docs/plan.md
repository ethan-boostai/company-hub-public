# CBS Operations Hub: rebuild plan

Status: **schema approved by Ethan on 28/10/2026** (with the decisions in 3.5). Changes to the schema after this need his OK.

Reference for every session: `CLAUDE.md` (build rules), `docs/inventory.md` (what the old hub does), `/legacy` (old workflows, page HTML, table columns and sample rows).

---

## 1. Approach

- Rebuild the n8n-served hub as one Next.js app (App Router, TypeScript, Tailwind) on Vercel (London), with Supabase Postgres + Storage (London).
- n8n stays for integrations only: ServiceM8, QuickBooks, SharePoint, PO PDF reading, notifications. n8n calls this app's API routes, or reads and writes Supabase directly.
- Move one area at a time. For each area: build it, copy that area's n8n tables into Supabase with a one-off script, Ethan tests on job 99901, then that area switches over. The old hub stays live until every area has moved.
- Until the Supabase project's URL and keys are added as env secrets, work against a local Postgres (Supabase CLI) only.

## 2. Phases

| Phase | What | Done when |
|---|---|---|
| 0. Foundations | App shell: left menu (drawer on mobile), standard header (title, global search, + New task, signed-in name). Name + 4-digit PIN sign-in. Shared parts: single-save buttons (disabled on submit, server guard), in-app "are you sure", drawer without page scroll behind it, dropdowns with "add new", Upload file (any type), in-window document viewer, house PDF format. Tables: `people`, `sessions`, `select_options`, `activity_log`, `files`, `settings`. | Ethan can sign in, sees the shell on desktop and phone, and the shared parts on a demo page. |
| 1. Jobs and tasks | ServiceM8 → `jobs`/`clients`/`sites` by webhook. Project/CDM switching, hub stage names in colour, folder/status any-to-any, start date on programme only. One job page with the grouped left menu and estimate-stage lock-out. Requirements per job. The single task panel and + New task (all task rules). Office task list. | Job 99901 works end to end with tasks; matches the old Job File. |
| 2. Safety | RAMS (+ templates, hazard library), CPHSP (+ wording), permits, pre-starts, inspections (site + scaffold), toolbox talks (+ topics), sign-ons, visitors, incidents (+ reports), CoSHH (substances + job CoSHH). H&S policy. Crew job portal (no sign-in, name per action). | Each Safety page on 99901 creates its record, PDF and SharePoint copy. |
| 3. Site | Daily diary, purchase orders (incl. AI PO reading), plant (job bookings, yard/assets), materials (stock, moves, stocktakes), load-up sheets, snagging, forms (checklists, pre-use checks, sub audits), yard tablet page. Onsite add-on (ServiceM8). | Site pages on 99901 match the old hub; onsite add-on works on a shared device with no sign-in. |
| 4. Plan | Scope of works, programme, drawings, pre-con info, RFIs, variations, site surveys, enquiry prep (estimate-stage requirements). | Plan pages on 99901 match the old hub. |
| 5. Money and close | Job costing, QuickBooks sync (PO + bills), service sheets, close-out (ServiceM8 Completed + "Works completed" folder, close-out report). | 99901 closes out and reopens correctly. |
| 6. Company-wide | Team and training, vehicles (checks, services, accidents), insurance and claims, company certs, subcontractors and suppliers, requests and time off, support, notifications, TV dashboard (its tasks are exactly the Actions board, no filters), look-ahead / today on site. | Every remaining old page has a new home; old hub can be switched off. |

Each phase is its own feature branch with small commits. Each phase ends with numbered test steps for Ethan.

## 3. Supabase schema

### 3.1 Conventions

- Every table: `id bigint generated always as identity primary key`, `created_at timestamptz default now()`, `created_by text`, `updated_at timestamptz`, `updated_by text`. `created_by`/`updated_by` hold the signed-in person's name (the rule "recorded on every change").
- Every change is also written to `activity_log` (who, when, table, row, what changed). This replaces all the old per-row `history` text columns.
- Every migrated table keeps `legacy_id bigint` (the old n8n row id) until the old hub is switched off, so imports can be re-run safely.
- Real types: `date`, `timestamptz`, `numeric(12,2)` for money, `boolean`, `int`. The old tables stored almost everything as text ("Yes"/"No", "" for empty dates); the import script converts.
- Repeating child data becomes child tables where we query or edit it on its own (PO lines, programme items, attendees). Data that is only ever read and written as one block (a builder's working state, a PDF snapshot) stays as `jsonb`, named `*_data`.
- Job links use `job_id bigint references jobs(id)`. The ServiceM8 job number stays on `jobs.job_no` for display and search.
- People links: `*_by` / assignee columns store `person_id references people(id)` where the person is a hub user or worker; free-text names are kept only where outsiders sign (visitors, subcontractor operatives).
- Files: one `files` table for every upload, document and photo (see 3.3). The old `files_json`, `docs_json`, `photos_json`, `doc_url`, `pdf_url`, `cbs_pci` and `cbs_photos` all become rows in `files`.
- Row Level Security on, with no public policies. The browser never talks to Supabase directly; all reads and writes go through server code using the service key after checking the hub session.
- Status and type columns are `text` with a `check` constraint, not Postgres enums (easier to change).

### 3.2 Merges and drops (all 74 n8n `cbs_` tables)

**Merged**

| New table | Old n8n tables | Why |
|---|---|---|
| `people` | `cbs_workers`, `cbs_signin`, `cbs_signatures` | One record per person: details, PIN hash, signature image, which lists they appear in. Signatures already moved onto the Team record on 27/10/2026; `cbs_signatures` is only a backup. |
| `tasks` | `cbs_job_tasks`, `cbs_task_status`, `cbs_cover_tasks` | One task model everywhere (CLAUDE.md: one task panel). `cbs_task_status` held status for auto-generated register tasks (e.g. "Review SDS"); `cbs_cover_tasks` held insurance cover actions. All become single tasks with an optional link to the record they came from. Old checklists inside tasks were already split into separate tasks on 27/10/2026. |
| `incidents` | `cbs_incidents`, `cbs_incident_reports` | The report is one-to-one with the incident; its fields become columns plus `report_data jsonb`. |
| `files` | `cbs_pci`, `cbs_photos`, `cbs_photo_tags`, every `*_url` / `files_json` / `docs_json` / `photos_json` column | One place for documents and photos, with links to what they belong to. |
| `settings` | `cbs_tv_settings`, `cbs_notify_rules` | Small key/value settings. Notify rules become rows with `kind = 'notify_rule'`. |
| `notifications` | `cbs_hub_notices`, `cbs_file_alerts` | Both are in-hub alerts for the office with a status. |
| `jobs` | `cbs_jobs` + `cbs_programmes` (one per job) + `cbs_scope` (one per job); `enq_json` split out to `enquiry_items` | Programme settings (status, skip weekends, closed) and scope become columns / `scope_data jsonb` on the job. Programme items keep their own table. |
| `job_requirements` | `cbs_jobs.reqs_json`, `cbs_jobs.enq_json.reqs` | Which requirements are switched on for a job (prestart, rams, pos …), one row per job + requirement. |
| `job_closeouts` | `cbs_jobs.closeout_json` | Close-out events become rows (a job can close, reopen and close again). |
| `job_moves` | `cbs_jobs.moves_json` | Stage moves (approved, back to estimate …) with who, when, source. |
| `inspections` | `cbs_inspections`, `cbs_scaffold_insp` | Both are inspections on a job; `kind` = `site` or `scaffold`, type-specific fields in `data jsonb`. |

**Kept (renamed, typed, linked)**: `clients` (from ServiceM8 + `cbs_client_contacts` → `client_contacts`), `select_options`, `rams`, `rams_templates` (`cbs_rams_types`), `hazards`, `cphsp`, `cphsp_wording`, `permits`, `prestarts`, `toolbox_talks` (`cbs_toolbox`), `toolbox_topics` (`cbs_tb_topics`), `sign_ons` (`cbs_signons`), `visitors`, `substances`, `job_substances` (`cbs_job_coshh`), `hs_policy`, `diary_entries` (`cbs_diary`), `purchase_orders` + `purchase_order_lines` (from `lines_json`), `suppliers`, `assets`, `asset_services`, `job_plant`, `materials`, `stock_moves`, `stocktakes` + `stocktake_lines` (from `lines_json`), `load_up_sheets` (`cbs_ptm_sheets`), `snags`, `service_sheets`, `programme_items` (`cbs_prog_items`), `drawings`, `rfis`, `variations`, `surveys`, `job_costs`, `vehicles`, `vehicle_checks`, `vehicle_services`, `vehicle_accidents`, `insurance_policies` (`cbs_insurance`), `claims`, `company_certs`, `training_records` (`cbs_training`), `subcontractors`, `subcontractor_docs` (`cbs_sub_docs`), `subcontractor_job_docs` (`cbs_sub_jobdocs`), `requests`, `time_off`, `support_tickets` (`cbs_support`).

**Dropped**

| Old table | Why |
|---|---|
| `cbs_cache` | n8n workaround for slow ServiceM8 reads. Next.js caching and our own `jobs` table replace it. |
| `cbs_load_log` | Page-load timing log for n8n. Vercel analytics covers this. |
| `cbs_page_parts`, `cbs_page_parts_backup_20261006` | Stored the old pages' HTML/JS. Saved to `/legacy/pages` as reference; the new app is code. |
| `cbs_signatures` | Merged into `people` (backup only since 27/10/2026). |
| `cbs_signin` | Merged into `people` (PIN hash) and `sessions` (tokens). Old tokens are not migrated; everyone signs in once. |
| `cbs_task_status`, `cbs_cover_tasks`, `cbs_job_tasks` | Merged into `tasks`. |
| `cbs_programmes`, `cbs_scope` | Merged into `jobs`. |
| `cbs_photo_tags`, `cbs_photos`, `cbs_pci` | Merged into `files`. |
| `cbs_incident_reports` | Merged into `incidents`. |
| `cbs_hub_notices`, `cbs_file_alerts` | Merged into `notifications`. |
| `cbs_tv_settings`, `cbs_notify_rules` | Merged into `settings`. |
| `cbs_scaffold_insp` | Merged into `inspections`. |
| All `embr_*` and `ep_inv_*` tables | Other businesses on the same n8n instance; not CBS. |

### 3.3 Tables

Columns listed are the business columns; the standard columns from 3.1 are on every table. `→` means foreign key.

#### Core

**people** (from `cbs_workers`, `cbs_signin`, `cbs_signatures`)
- `name text not null unique`, `role text`, `mobile text`, `email text`, `active boolean default true`
- `can_sign_in boolean` (old `hub_signin`), `pin_hash text` (bcrypt), `pin_set_at timestamptz`
- `signature_file_id → files` (image), `site_lead boolean`, `hide_from_portal boolean`
- `lists text[]` — which pick-lists the person appears in. Replaces the 17 `in_*` booleans (`crew`, `tasks`, `rams`, `coshh`, `cphsp`, `checks`, `toolbox`, `permits`, `incidents`, `po`, `survey`, `diary`, `docs`, `director`, `sm8`, `service`).
- `sm8_staff_uuid text` (ServiceM8 staff link, when known), `notes text`

**Added during Phase 0 (needs Ethan's OK; small and infrastructure only):**
- `people`: `legacy_pin_hash` (old hub PIN hash, checked once then cleared), `failed_pin_count` and `locked_until` (lock-out after 5 wrong PINs for 15 minutes).
- `files.storage` also allows `local`, used only on a developer's machine; Vercel refuses it.
- **request_keys** (new) — `key text primary key`, `person_id`, `created_at`. The server-side double-save guard: every save carries a one-time key and a second save with the same key is refused. Rows older than 7 days are cleared.
- **schema_migrations** — which migration files have been applied.

**sessions** (new) — `person_id → people`, `token_hash text unique`, `device text`, `created_at`, `last_seen_at`, `expires_at`, `revoked_at`. Office sign-in only; the onsite add-on has no sessions.

**clients** (new, synced from ServiceM8) — `sm8_uuid text unique`, `name`, `address`, `phone`, `email`, `active`.
**client_contacts** (from `cbs_client_contacts`) — `client_id → clients`, `sm8_uuid`, `name`, `role`, `phone`, `email`, `active`.

**jobs** (from `cbs_jobs`, `cbs_programmes`, `cbs_scope`, plus ServiceM8)
- ServiceM8 mirror (ServiceM8 is master; written only by the sync): `sm8_uuid text unique`, `job_no text unique` (old `ref`), `sm8_status text` (Quote / Work Order / Completed / Unsuccessful), `sm8_folder text` (ServiceM8 queue: Enquiry, Estimated, Approved, Part Approved, Reactive (Call-Out), Maintenance, Awaiting client, Works completed, Part invoiced, On hold, …), `sm8_folder_expires date`, `sm8_po_number text`, `sm8_invoice_total numeric(12,2)`, `sm8_booked_until timestamptz`, `sm8_active boolean`, `client_id → clients`, `site_address text`, `sm8_description text`, `sm8_updated_at timestamptz`
- Hub stage (derived from `sm8_status`, stored for filtering): `stage text check (stage in ('estimate','approved','completed','unsuccessful'))`
- Hub fields: `name text`, `client_contact_id → client_contacts`, `contract_value numeric(12,2)`, `qbo_ref text`, `notes text`, `pm_id → people`, `show_on_tv boolean`
- Job type: `job_type text check (job_type in ('project','cdm')) default 'project'`, `job_type_since date`, `job_type_by text` (replaces `mode`, `cdm`, `cdm_since`, `cdm_by`, `project_since`, `project_by`; old `mode = 'closed'` becomes `stage = 'completed'` + a `job_closeouts` row)
- Programme: `programme_status text`, `programme_skip_weekends boolean default true`, `programme_closed_at`, `programme_closed_by`. Start/end dates are **not** stored on the job: they are the min/max of `programme_items` (rule: start date lives on the programme only). Old `starts_on`/`ends_on` are imported as a first programme item only if the job has no programme.
- Scope: `scope_data jsonb` (scope of works builder state), `scope_updated_at`, `scope_updated_by`
- Enquiry: `enquiry_next text`, `enquiry_notes text`, `estimate_status text`, `estimate_by_id → people`, `estimate_due date` (the rest of old `enq_json` moves to `enquiry_items`)

**job_requirements** — `job_id → jobs`, `req_key text`, `on boolean`, unique (`job_id`, `req_key`). `req_key` is either a built-in key or `custom:<requirement_types.id>`.

**Requirement types (two sources):**
- Built-in types that open a builder or page (RAMS, CPHSP, programme, POs, …) are defined in code (`src/lib/requirements.ts`), so they version with the app. The full list comes from the old Job File (see inventory and `_notes_batch1.md`).
- **requirement_types** (new table) — simple custom types the office adds themselves: `name text not null unique`, `stage text check (stage in ('estimate','approved_planning','approved_onsite','completed'))`, `side text check (side in ('office','site'))`, `active boolean default true`, `sort int`. Each one is a plain task with a stage; it never opens a builder.

**enquiry_items** (from `enq_json.surveys`, `.dwg`, `.docs`, `.quotes`, `.subquotes`) — estimate-stage records, one row each: `job_id → jobs`, `kind text check (kind in ('survey','client_info','document','supplier_quote','subcontractor_quote'))`, `description`, `source` (CBS / specialist / client / third party), `company` (supplier or subcontractor), `for_what`, `who_id → people`, `due_on`, `status`, `requested_on`, `received_on`, `sent_on`, `amount numeric(12,2)`, `quote_decision` (accepted / declined), `notes`. Files are `files` rows. Old `rid` kept as `legacy_rid`. Old `enq_json.tasks` become `tasks`.

**job_moves** (from `moves_json`) — `job_id → jobs`, `kind text` (approved, back, …), `source text` (hub, sm8, auto), `note text`, `at timestamptz`, `by text`.

**job_closeouts** (from `closeout_json`) — `job_id → jobs`, `closed_at`, `closed_by`, `reason`, `open_items text[]`, `previous_job_type`, `sm8_completed_at`, `report_file_id → files`, `reopened_at`, `reopened_by`.

**tasks** (from `cbs_job_tasks`, `cbs_task_status`, `cbs_cover_tasks`)
- `job_id → jobs null` (null = office task with no job)
- `title text not null`, `notes text`
- `status text check (status in ('todo','in_progress','done')) default 'todo'`
- `in_hand_note text` (the "In hand" note on an In progress task, not a status)
- `assignee_id → people`, `due_on date`
- `done_at`, `done_by` (office can mark Done by hand; saving a record never does)
- `verified_at`, `verified_by` (sign-off after Done)
- `side text check (side in ('office','site'))` (Office tasks / On site tasks toggle; `site` tasks show in the crew job portal)
- `submitted_at`, `submitted_by` (crew "Mark as submitted" on a site task; the office then marks it Done), `sent_back_note`, `sent_back_at`, `sent_back_by`
- `removed_at`, `removed_by` (requirement task removed from this job; hidden, not deleted)
- `drawing_pin jsonb` (`{drawing_id, page, x, y}` when the task is pinned on a drawing)
- `req_key text` (null for one-off tasks). Category is not stored: it is the requirement's group, or "Office" for one-off tasks.
- `stage text` (estimate / approved_planning / approved_onsite / completed), copied from the requirement when created
- `source_table text`, `source_id bigint` (record the task came from, e.g. a substance's SDS review, an insurance cover action)
- `repeat text` (old `freq`), `last_done_on date` (for repeating register tasks)
- Files on a task: `files` rows linked to the task, **only when the task has a job**. Generic tasks with no job don't get file uploads (enforced in the server code and by a check when a `files` row is linked to a task).

**files** (new; replaces `cbs_pci`, `cbs_photos`, `cbs_photo_tags`, all url/json file columns)
- `name text`, `mime text`, `size_bytes bigint`
- `storage text check (storage in ('sharepoint','supabase'))`, `sharepoint_item_id text`, `sharepoint_url text`, `storage_path text` (Supabase Storage, for signatures, thumbnails and files waiting to go to SharePoint)
- `job_id → jobs null`, `entity_table text`, `entity_id bigint` (what it belongs to: task, rams, po, snag …), `role text` (e.g. `pdf`, `before`, `after`, `sds`, `photo`, `drawing`)
- `caption text`, `categories text[]`, `taken_at`, `taken_by`, `phase text` (from photo tags)
- `superseded_by → files` (new revision)

**activity_log** (new) — `at timestamptz`, `person_name text`, `table_name text`, `row_id bigint`, `job_id bigint`, `action text` (create, update, delete, status), `changes jsonb` (field: [old, new]). Written by server code on every save.

**select_options** (from `cbs_select_options`) — `list text` (old `reg` + `field`, e.g. `company_certs.name`), `value text`, unique (`list`, `value`). Every dropdown reads and adds here.

**settings** (from `cbs_tv_settings`, `cbs_notify_rules`) — `key text unique`, `value jsonb`. Notify rules stored as `notify.<event>` keys.

**notifications** (from `cbs_hub_notices`, `cbs_file_alerts`) — `kind text` (event, e.g. `ptm_short`, `file_added`), `title`, `message`, `job_id → jobs`, `link text`, `file_id → files`, `status text` (new / done / dismissed), `dismissed_by`, `dismissed_at`.

#### Safety (Phase 2)

- **hazards** (library) — `hazard`, `activity`, `harm`, `likelihood`, `consequence`, `risk_rating`, `controls`, `control_level`, `control_codes text[]`, `residual_likelihood`, `residual_consequence`, `residual_risk`, `owner`, `plant_categories text[]`, `rams_key`, `source`, `status`, `last_reviewed_on date`, `review_on date`, `notes`.
- **rams_templates** (from `cbs_rams_types`) — `key text unique`, `name`, `status`, `template jsonb` (activity, scope, plant, materials, hazard keys, PPE, permits, steps), `notes`.
- **rams** — `job_id`, `revision int`, `status`, `activity`, `task`, `site`, `prepared_by`, `dated date`, `data jsonb` (builder state, old `job_json`), `pdf_file_id → files`, `notes`.
- **cphsp** — `job_id`, `cphsp_no`, `revision`, `status`, `project`, `client`, `site`, `prepared_by`, `dated`, `approved_by`, `approved_on`, `subcontractors text[]`, `subcontractors_not_approved text[]`, `data jsonb` (old `state_json`), `pdf_file_id`, `register_pdf_file_id`, `notes`.
- **cphsp_wording** — `item_key unique`, `list`, `title`, `text`, `sort int`, `notes`.
- **permits** — `job_id`, `permit_no`, `permit_type`, `status`, `location`, `scope`, `hazards`, `controls`, `isolations`, `people`, contractor (`contractor_name`, `contractor_company`, `contractor_email`, `contractor_mobile`), `valid_from`, `valid_to`, `requested_at/by`, `submitted_at`, `approved_at/by`, `rejected_reason`, `closed_at/by`, `access_token_hash` (contractor link), `data jsonb`, `pdf_file_id`, `notes`.
- **prestarts** — `job_id`, `prestart_no`, `held_on date`, `held_at time`, `site_lead_id → people`, `headcount int`, `acknowledged boolean`, `linked_docs jsonb`, `data jsonb`, `pdf_file_id`, `notes`.
- **inspections** (from `cbs_inspections`, `cbs_scaffold_insp`) — `job_id`, `kind text check (kind in ('site','scaffold'))`, `inspection_no`, `inspected_on date`, `inspector text`, `status`, `result text`, `no_count int`, `actions_open int`, `next_due date`, `cphsp_id → cphsp`, `data jsonb` (checklist answers; scaffold: company, CISRS card, requested by/on), `report_file_id`, `notes`.
- **toolbox_topics** — `key unique`, `title`, `points text`, `status`, `notes`.
- **toolbox_talks** — `job_id null` (also used for H&S team meetings), `meeting_type`, `topic`, `held_on`, `presenter`, `key_points`, `hazards_raised`, `actions`, `attendees text[]`, `data jsonb`, `pdf_file_id`, `notes`.
- **sign_ons** — `job_id`, `doc_type` (site sign-in, induction, RAMS, …), `doc_ref` (old `doc_id`), `doc_revision`, `doc_label`, `name`, `company`, `person_id → people null` (when a worker), `signed_at`, `signature_file_id`, `inducted_by`, `reviewed boolean`, `record_file_id`.
- **visitors** — `job_id`, `visit_key`, `visit_date`, `name`, `company`, `phone`, `vehicle_reg`, `visiting`, `reason`, `inducted boolean`, `signed_in_at`, `signed_out_at`, `signature_file_id`, `notes`.
- **incidents** (from `cbs_incidents` + `cbs_incident_reports`) — `ref`, `job_id`, `kind`, `severity`, `occurred_at`, `location`, `person`, `reported_by`, `description`, `immediate_action`, `injury_detail`, `treatment`, `first_aid`, `notifiable boolean`, `riddor_required boolean`, `riddor_notified_at`, `requires_investigation boolean`, `investigation`, `root_cause`, `corrective_actions`, `action_owner`, `action_due`, `review_hazard_register boolean`, `hazard_register_done_on`, `status`, `closed_at`, `report_signed_by`, `report_signed_on`, `report_data jsonb`, `record_file_id`, `report_file_id`.
- **substances** (CoSHH register) — `product`, `supplier`, `use_for`, `location`, `quantity`, `coshh_class`, `controls`, `ppe`, `sds_date`, `sds_url`, `assessed_by`, `assessed_on`, `review_on`, `status`, `version`, `assessment jsonb`, `sds_file_id`, `pack_file_id`, `notes`.
- **job_substances** (from `cbs_job_coshh`) — `job_id`, `substance_id → substances`, unique pair.
- **hs_policy** — `version`, `status`, `scope`, `commitment`, `objectives`, `effective_on`, `review_due`, `approved_by`, `approver_role`, `approved_on`, `data jsonb`, `pdf_file_id`, `manual_file_id`, `notes`.

#### Site (Phase 3)

- **diary_entries** — `job_id`, `day date`, unique (`job_id`, `day`), `on_site jsonb` (who was on site, from ServiceM8 schedule), `weather jsonb`, `delays text`, `delay_cause`, `delay_hours numeric`, `instructions`, `notes`, `snapshot jsonb`, `locked_at`, `locked_by`.
- **suppliers** — `name`, `contact`, `email`, `phone`, `address`, `account_no`, `qbo_vendor_id`, `notes`.
- **purchase_orders** — `job_id null`, `po_no text unique`, `po_type` (supplier / subcontractor / hire), `supplier_id → suppliers`, `status`, `ordered_by`, `ordered_on`, `needed_by`, `deliver_to`, `hire_end`, `offhired_on`, `subtotal`, `vat`, `total` (numeric), `qbo_po_id`, `source` (hub / PDF read), `received jsonb`, `pdf_file_id`, `notes`.
- **purchase_order_lines** (from `lines_json`) — `purchase_order_id`, `sort`, `description`, `qty numeric`, `unit`, `unit_price`, `vat_rate`, `line_total`, `received_qty`.
- **assets** (yard/plant register) — `asset_tag unique`, `name`, `category`, `make_model`, `serial_no`, `status`, `yard_status`, `location`, `assigned_to`, `purchased_on`, `service_interval`, `last_service_on`, `next_service_on`, `test_tag_due`, `hav_magnitude`, `hav_trigger_mins`, `hav_ref`, `notes`. Current check-out (`out_job`, `out_with`, `out_since`, `due_back`) is derived from the open `job_plant` row, not stored twice.
- **asset_services** — `asset_id → assets`, `serviced_on`, `serviced_by`, `work_done`, `cost`, `next_due`, `notes`.
- **job_plant** (plant booked to a job) — `job_id`, `asset_id → assets null` (null = hired-in), `asset_name`, `category`, `source` (yard / hire PO), `purchase_order_id`, `booked_at`, `booked_by`, `out_with`, `due_back`, `returned_at`, `returned_by`, `notes`.
- **materials** — `name`, `category`, `unit`, `supplier_id`, `supplier_code`, `cost`, `location`, `qty_on_hand numeric`, `min_level`, `reorder_qty`, `sds_substance_id → substances`, `sm8_uuid`, `status`, `last_counted_on/by`, `notes`.
- **stock_moves** — `material_id`, `job_id null`, `change numeric`, `qty_after numeric`, `reason`, `location`, `ref`, `at`, `by`, `notes`.
- **stocktakes** — `location`, `status`, `counted_by`, `decided_at/by`, `notes`; **stocktake_lines** (from `lines_json`) — `stocktake_id`, `material_id`, `expected`, `counted`, `diff`.
- **load_up_sheets** (from `cbs_ptm_sheets`, "PTM" = plant, tools, materials) — `job_id`, `sheet_date`, `vehicle_id → vehicles`, `crew text[]`, `status`, `prepared_by`, `items jsonb` (plant ids, materials, custom lines), `loaded jsonb`, `loaded_at/by`, `shortages`, `load_issues`, `order_task_id → tasks`, `pdf_file_id`, `notes`.
- **snags** — `job_id`, `snag_no`, `area`, `phase`, `description`, `status`, `assigned_to`, `due_on`, `raised_at/by`, `fixed_at/by`, `fix_notes`, `signed_off_at/by`, `pushed_at/by` (sent to ServiceM8), `notes`. Before/after photos are `files` rows (`role` before/after).
- **service_sheets** — `job_id`, `sheet_no`, `sheet_date`, `job_title`, `location`, `status`, `sections jsonb`, `signed_by`, `access_token_hash`, `pdf_file_id`.
- **form_templates** — `key`, `kind`, `title`, `doc_ref`, `version`, `status`, `intro`, `footer`, `header jsonb`, `items jsonb`, `refs`, `prepared_on`, `review_on`, `sort`.
- **form_records** — `template_id → form_templates`, `job_id null`, `asset_id null`, `kind`, `title`, `doc_ref`, `version`, `site`, `sub_company`, `checked_at`, `checked_by`, `outcome`, `fail_count`, `answers jsonb`, `header jsonb`, `released_at/by`, `signature_file_id`, `pdf_file_id`.

#### Plan (Phase 4)

- **programme_items** (from `cbs_prog_items`) — `job_id`, `parent_id → programme_items` (phases/sub-items), `kind` (phase / task / milestone), `name`, `area`, `start_on`, `end_on`, `pct int`, `status`, `assigned_to text[]`, `blocked_by bigint[]`, `sort`, `notes`, `checklist jsonb`.
- **drawings** — `job_id`, `kind` (drawing / markup / pin), `number`, `title`, `discipline`, `doc_type`, `revision`, `status`, `supersedes_id → drawings`, `file_id → files`, `page int`, markup position (`x`, `y`, `rotation`, `geo jsonb`), `ref_table`, `ref_id`, `label`, `tags text[]`, `notes`.
- **rfis** — `job_id`, `rfi_no`, `subject`, `question`, `sent_to`, `sent_to_email`, `sent_on`, `needed_by`, `response`, `responded_on`, `status`, `pdf_file_id`.
- **variations** — `job_id`, `var_no`, `title`, `description`, `instructed_by`, `instructed_on`, `instruction_via`, `cost numeric`, `time_days numeric`, `status`, `decided_by`, `decided_on`, `programme_item_ids bigint[]`, `pdf_file_id`.
- **surveys** — `job_id`, `survey_ref`, `version`, `survey_date`, `surveyor`, `site_address`, `client`, contact (`contact_phone`, `contact_email`), `conditions`, `areas jsonb`, `area_count`, `photo_count`, `change_summary`, `submitted_at`, `raised_by`, `sm8_status`, `data jsonb`, `pdf_file_id`.

#### Money and close (Phase 5)

- **job_costs** — `job_id`, `cost_date`, `category`, `supplier`, `description`, `ref`, `purchase_order_id → purchase_orders`, `net`, `vat`, `gross` (numeric), `source` (manual / QuickBooks / PO), `qbo_id`, `file_id`, `notes`.
- Close-out uses `job_closeouts` (core).

#### Company-wide (Phase 6)

- **vehicles** — `reg unique`, `make_model`, `year`, `assigned_to_id → people`, `vehicle_tax_due date`, `mot_expiry date`, `insurance_due date`, `service_due date`, `inspection_frequency`, `next_inspection_on`, `fleet_only boolean`, `no_monthly_check boolean`, `notes`.
- **vehicle_checks** — `vehicle_id`, `checked_on`, `checked_by`, `odometer int`, `tyres_ok`, `lights_ok`, `fluids_ok`, `body_ok`, `restraints_ok`, `first_aid_ok`, `extinguisher_ok` (boolean), `defects`, `action`, `status`, `reviewed boolean`, `file_id`. Odometer in miles.
- **vehicle_services** — `vehicle_id`, `serviced_on`, `workshop`, `work_done`, `odometer`, `cost`, `next_due`, `next_due_miles` (old column was `next_due_km`; the hub works in miles, so check the stored values during import), `receipt_file_id`, `notes`.
- **vehicle_accidents** — `vehicle_id`, `occurred_at`, `driver`, `location`, `description`, `damage`, `injuries`, third party (`third_party`, `third_party_reg`, `third_party_insurer`), `police_event_no`, `claim_id → claims`, `status`, `file_id`, `notes`.
- **insurance_policies** — `item`, `custom_name`, `insurer`, `policy_no`, `cover`, `covers jsonb` (type, limit, excess), `starts_on`, `expires_on`, `file_id`, `notes`.
- **claims** — `claim_no`, `claim_type`, `direction` (by us / against us), `policy_id → insurance_policies`, `insurer`, `insurer_claim_no`, `job_id`, `vehicle_id`, `asset_id`, `incident_id`, `client`, `site`, `other_party`, `other_contact`, `incident_date`, `lodged_on`, `closed_on`, `amount_claimed`, `amount_settled`, `excess`, `status`, `next_action`, `next_action_due`, `file_id`, `description`, `notes`.
- **company_certs** — `name`, `other_name`, `issuer`, `reference`, `level`, `issued_on`, `expires_on`, `cost`, `contact`, `notes` (+ files).
- **training_records** — `person_id → people`, `qualification`, `qualification_other`, `provider`, `reference`, `issued_on`, `expires_on`, `notes` (+ files).
- **subcontractors** — `company`, `type`, `trade`, `contact`, `email`, `mobile`, `approved boolean`, `inducted boolean`, `licence_type`, `licence_no`, `licence_expiry`, `insurance_expiry`, `notes`.
- **subcontractor_docs** — `subcontractor_id`, `item`, `custom_name`, `reference`, `issued_on`, `expires_on`, `file_id`, `notes`.
- **subcontractor_job_docs** — `subcontractor_id`, `job_id`, `doc_type`, `status`, `requested_on`, `received_on`, `reviewed_by`, `reviewed_on`, `start_date`, `notes` (+ files).
- **requests** — `requested_by`, `category`, `urgency`, `details`, `status`, `response`, `requested_at`, `closed_at`.
- **time_off** — `person_id`, `kind`, `from_date`, `to_date`, `days numeric`, `part_day`, `status`, `response`, `requested_at`, `notes`.
- **support_tickets** — `ref`, `kind` (bug / feature), `title`, `section`, `page_url`, `device`, `steps`, `expected`, `details`, `priority`, `status`, `reason`, `response`, `duplicate_of → support_tickets`, `raised_at`, `raised_by` (+ files).

### 3.4 Relations at a glance

```
clients ─< client_contacts
clients ─< jobs >─ client_contacts
jobs ─< job_requirements, enquiry_items, job_moves, job_closeouts, tasks, files, activity_log
jobs ─< programme_items (self-parent), drawings, rfis, variations, surveys
jobs ─< rams, cphsp, permits, prestarts, inspections, toolbox_talks, sign_ons, visitors, incidents, job_substances >─ substances
jobs ─< diary_entries, purchase_orders ─< purchase_order_lines, job_plant >─ assets, load_up_sheets, snags, service_sheets, form_records
jobs ─< job_costs >─ purchase_orders
people ─< sessions, tasks (assignee), training_records, time_off, vehicles (assigned)
suppliers ─< purchase_orders, materials ─< stock_moves; stocktakes ─< stocktake_lines >─ materials
assets ─< asset_services, job_plant, form_records
vehicles ─< vehicle_checks, vehicle_services, vehicle_accidents >─ claims >─ insurance_policies
subcontractors ─< subcontractor_docs, subcontractor_job_docs >─ jobs
form_templates ─< form_records
files: belongs to one row anywhere via (entity_table, entity_id), plus job_id for job filtering
```

### 3.5 Decisions (Ethan, 28/10/2026)

1. **Requirement types: both.** Types that open a builder or page stay in code; the `requirement_types` table lets the office add simple custom types (plain task with a stage).
2. **Documents:** SharePoint stays the home for documents and PDFs (`files.storage = 'sharepoint'`). Supabase Storage holds signatures and thumbnails only. The app reaches SharePoint only through the n8n workflow "CBS Hub - Files" (start upload / file info / short-lived links, secret header `X-CBS-Files-Key`); n8n holds the SharePoint credential, set in its one "Graph Request" node. Uploads go from the browser straight to SharePoint in 5 MB chunks (no Vercel or n8n size limit). Same library and `CBS System` folder as the old hub; Phase 0 uses `CBS System/Hub uploads/Test` only.
3. **PINs** carry over: old hashes are copied, the existing PIN is accepted on first sign-in, then re-stored with bcrypt plus a lock-out after repeated wrong PINs. Old sign-in tokens are not migrated.
4. **`/legacy`** has no real contact details: phone numbers, emails and addresses are replaced with fake values.
5. **TV dashboard:** its tasks show exactly what's on the Actions board, no filters.
6. **Generic tasks** (no job) don't get file uploads.
7. `docs/inventory.md` section 5 is binding: the rebuild never copies that old behaviour.

### 3.6 Phase 1 decisions (Ethan, 28/10/2026)

1. **Requirements are added only through + New task**: picker tiles grouped by stage (Estimate, Approved: Planning, Approved: on site, Completed), Other (one-off) at the top, Office tasks / On site tasks toggle. Tiles already on the job show On or Done, and tapping one opens that task. No requirements panel or on/off toggles on the job page. A requirement is taken off a job with "Remove from job" in its task (in-app "are you sure"; its files are kept).
2. **Jobs list mirrors the old Jobs screen**: every active ServiceM8 folder as a tile in ServiceM8's order, plus "Booked / on site" (Work Orders with no folder) and "No folder" (Quote jobs with no folder). Tap a tile to show or hide it, remembered on the device; Enquiry, Reactive, Maintenance and Approved show by default; Show all / Default buttons. Search covers the folders shown; Enter opens a typed job number.
3. **Unsuccessful jobs** are hidden from every folder, from "No folder", from the tile counts and from the list search by default. One "Show unsuccessful" toggle on the Jobs list shows them in whichever folder they're in, remembered on the device like the folder tiles. Typing a job number and pressing Enter still opens an Unsuccessful job. Global search always finds them.
4. **ServiceM8 rules**: jobs are created in ServiceM8 only. New Quote jobs stay in No folder. A Work Order that drops out of its folder (when scheduled, or when the folder expires) goes back to the folder it was in: Approved, Part Approved, Reactive or Maintenance. The last kept folder is stored on the job. Hub folder changes set a one-year folder expiry. The ServiceM8 schedule is the only source for who's on site.
5. **Folder and status changes**: any to any, no reason or warning. Each change adds a ServiceM8 job note naming who made it, with an optional note. Setting Completed doesn't close the job out; setting a closed-out job back to Estimate or Approved reopens it.
6. **Sync**: ServiceM8 webhooks through a new n8n workflow, plus a nightly catch-up. No existing workflow is changed.
7. **Test job**: Phase 1 tests use a test job created in ServiceM8. Its files go to its real job folder in SharePoint.
8. **Job folders in SharePoint** (same as the old hub, all inside `CBS System`, so the "CBS Hub - Files" folder rule needs no change): job files go to `CBS System/Operations/Jobs/Job N/<folder>`, where the folder comes from the requirement (RAMS and Subcontractor RAMS → `RAMS`; Supplier POs, Subcontractor POs, Hire plant → `Purchase orders`; Survey → `Surveys`; Estimate → `Estimate`; Supplier and Subcontractor quotes → `Quotes`; Documentation → `Documents`; RFIs → `RFIs`; Programme → `Programme`; Inspections → `Inspections`; Permits → `Permits`; CPHSP and Pre-con info → `CDM`; Inductions → `Inductions`; Toolbox talks → `Toolbox talks`), else `Tasks`. The old Enquiry prep page also saved estimate-stage uploads to `CBS System/Operations/Enquiries/Job N`; the job page reads both locations for old files.

## 4. Migration (per area)

1. Script in `scripts/migrate/<area>.ts` reads the n8n tables (through a read-only n8n export workflow or JSON exports) and upserts into Supabase on `legacy_id`.
2. Converts types ("Yes"/"No" → boolean, "" → null, text dates → `date`), splits JSON columns into child tables, maps names to `people.id` and job numbers to `jobs.id`, and creates `files` rows for every URL.
3. Prints a count check (rows in vs rows out) and a list of rows it could not map.
4. Re-runnable until switch-over; after switch-over the old n8n table is read-only.

## 5. Risks

- **ServiceM8 webhooks**: the old hub mostly polls (see inventory). Webhooks need a public HTTPS endpoint (Vercel) and ServiceM8 add-on app registration; until then, n8n can keep polling and push into the app's API.
- **Shared n8n key**: the old hub uses one hard-coded internal key between workflows. The new API routes use a fresh secret in Vercel env vars, never in code. The old key is redacted from `/legacy`.
- **Two systems live at once**: while an area is half-moved, both hubs can edit. Each area switches over in one go, and the old page then shows a "moved" notice (needs Ethan's OK to change that n8n page).


## Appendix A. Every old table and where it goes

Kept tables lose the `cbs_` prefix.

| Old n8n table | Action | New table |
|---|---|---|
| `cbs_asset_services` | keep | `asset_services` |
| `cbs_assets` | keep | `assets` |
| `cbs_cache` | drop | - |
| `cbs_claims` | keep | `claims` |
| `cbs_client_contacts` | keep | `client_contacts` |
| `cbs_company_certs` | keep | `company_certs` |
| `cbs_cover_tasks` | merge | `tasks` |
| `cbs_cphsp` | keep | `cphsp` |
| `cbs_cphsp_wording` | keep | `cphsp_wording` |
| `cbs_diary` | keep | `diary_entries` |
| `cbs_drawings` | keep | `drawings` |
| `cbs_file_alerts` | merge | `notifications` |
| `cbs_form_records` | keep | `form_records` |
| `cbs_form_templates` | keep | `form_templates` |
| `cbs_hazards` | keep | `hazards` |
| `cbs_hs_policy` | keep | `hs_policy` |
| `cbs_hub_notices` | merge | `notifications` |
| `cbs_incident_reports` | merge | `incidents` |
| `cbs_incidents` | merge | `incidents` |
| `cbs_inspections` | merge | `inspections` |
| `cbs_insurance` | keep | `insurance_policies` |
| `cbs_job_coshh` | keep | `job_substances` |
| `cbs_job_costs` | keep | `job_costs` |
| `cbs_job_plant` | keep | `job_plant` |
| `cbs_job_tasks` | merge | `tasks` |
| `cbs_jobs` | split | `jobs + job_requirements + enquiry_items + job_moves + job_closeouts` |
| `cbs_load_log` | drop | - |
| `cbs_materials` | keep | `materials` |
| `cbs_notify_rules` | merge | `settings` |
| `cbs_page_parts` | drop | (saved in /legacy/pages) |
| `cbs_page_parts_backup_20261006` | drop | - |
| `cbs_pci` | merge | `files` |
| `cbs_permits` | keep | `permits` |
| `cbs_photo_tags` | merge | `files` |
| `cbs_photos` | merge | `files` |
| `cbs_prestarts` | keep | `prestarts` |
| `cbs_prog_items` | keep | `programme_items` |
| `cbs_programmes` | merge | `jobs` |
| `cbs_ptm_sheets` | keep | `load_up_sheets` |
| `cbs_purchase_orders` | split | `purchase_orders + purchase_order_lines` |
| `cbs_rams` | keep | `rams` |
| `cbs_rams_types` | keep | `rams_templates` |
| `cbs_requests` | keep | `requests` |
| `cbs_rfis` | keep | `rfis` |
| `cbs_scaffold_insp` | merge | `inspections` |
| `cbs_scope` | merge | `jobs` |
| `cbs_select_options` | keep | `select_options` |
| `cbs_service_sheets` | keep | `service_sheets` |
| `cbs_signatures` | merge | `people (drop: backup)` |
| `cbs_signin` | merge | `people + sessions` |
| `cbs_signons` | keep | `sign_ons` |
| `cbs_snags` | keep | `snags` |
| `cbs_stock_moves` | keep | `stock_moves` |
| `cbs_stocktakes` | split | `stocktakes + stocktake_lines` |
| `cbs_sub_docs` | keep | `subcontractor_docs` |
| `cbs_sub_jobdocs` | keep | `subcontractor_job_docs` |
| `cbs_subcontractors` | keep | `subcontractors` |
| `cbs_substances` | keep | `substances` |
| `cbs_suppliers` | keep | `suppliers` |
| `cbs_support` | keep | `support_tickets` |
| `cbs_surveys` | keep | `surveys` |
| `cbs_task_status` | merge | `tasks` |
| `cbs_tb_topics` | keep | `toolbox_topics` |
| `cbs_time_off` | keep | `time_off` |
| `cbs_toolbox` | keep | `toolbox_talks` |
| `cbs_training` | keep | `training_records` |
| `cbs_tv_settings` | merge | `settings` |
| `cbs_variations` | keep | `variations` |
| `cbs_vehicle_accidents` | keep | `vehicle_accidents` |
| `cbs_vehicle_checks` | keep | `vehicle_checks` |
| `cbs_vehicle_services` | keep | `vehicle_services` |
| `cbs_vehicles` | keep | `vehicles` |
| `cbs_visitors` | keep | `visitors` |
| `cbs_workers` | merge | `people` |
