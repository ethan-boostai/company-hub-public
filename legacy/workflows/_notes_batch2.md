# Legacy n8n workflows: reference notes, batch 2

Reference for rebuilding each feature. Source: JSON exports in this folder (read-only). Table names come from `legacy/tables/_all_tables.json`.

How data is read and written (applies to nearly every section below):
- Most Code nodes do not use n8n data-table nodes. They call the generic register API in **CBS - Operations Backend** (batch 1): `POST /webhook/cbs-admin-save?a=list|save|del&t=<alias>&id=<id>[&partial=1]&k=<internal key>`, and they read through `GET /webhook/cbs-admin-data?t=a,b,c`. Aliases map to tables, for example `rfis`→cbs_rfis, `jobrows`→cbs_jobs, `progitems`→cbs_prog_items, `subbies`→cbs_subcontractors, `selectopts`→cbs_select_options, `notices`→cbs_hub_notices, `taskstat`→cbs_task_status, `pos`→cbs_purchase_orders, `ptmsheets`→cbs_ptm_sheets, `stockmoves`→cbs_stock_moves, `increports`→cbs_incident_reports. The full map is in the `Route` node of operations-backend.json.
- "Job" in a table almost always means the ServiceM8 job number (`generated_job_id`), stored as `job_no`, or as `ref` on cbs_jobs. Rows are matched with a normalised key: lower-case, alphanumerics only. When a job has several rows, the newest (highest `id`) wins.
- Timestamps are UK local time strings (`YYYY-MM-DDTHH:MM`, Europe/London). `history` text columns are newline-separated lines in the form `DD/MM/YYYY HH:MM - <what> by <name>`.
- Each action takes `by` (the person's name) from the browser's localStorage (`cbs_me`/`cbs_name`). If neither is set, the page uses `prompt()`. The server only checks that `by` is not empty.

---

### CBS - Page Patcher (`page-patcher.json`, active yes)
- Purpose: developer maintenance tool. It rewrites the stored HTML/JS of hub pages held in cbs_page_parts. Each `?flag=1` query runs one idempotent find-and-replace patch. Not a user feature. **Drop.**
- Endpoints:
  - `GET cbs-page-patcher?<flag>=1` runs one patch, chosen by the flag. Flags include inspect, test, unpack, flatten, accred, ubox, subtype, plant, uk, hosp, reg, yardjob, delguard, notices, jobfile, mxlogo, certs, selopts, mxprint, fleet, jobreqs, cchead, menu, scaff, crew, acts, tidy, rev2, rev3, move. `?inspect=` regex-searches stored pages; `?post=`/`?posts=` proxies a POST to other webhooks.
  - `POST cbs-patch-hzicons` replaces the hazard-icon rules in `page:cbs-hz-icons`.
  - `POST cbs-patch-replace` takes `{page, edits:[[from,to]...]}`. Each `from` must match exactly once.
- Tables: cbs_page_parts (read; update; insert `_bak_*` backup rows); cbs_subcontractors (update `type`: SubType Rows holds a hard-coded list that classes each company as Subcontractor or Supplier); cbs_select_options (list/save/del via the API).
- Integrations: calls its own n8n webhooks for testing. Content embedded in patches (RAMS step library, UK hazard data and lists, nearest-A&E finder, CoSHH picker, plant categories) now lives in the stored pages. See `legacy/pages`.
- Rule worth keeping: every patch is exact-once and anchor-based, and makes a backup row before big edits. The rebuild needs none of this.

### CBS - Page Read (temp) (`page-read-temp.json`, active no)
- Temporary debug hook (`POST cbs-page-read-temp`): lists, slices or searches stored pages in cbs_page_parts. Read-only. **Drop.**

### CBS - Pages (`pages.json`, active yes)
- Purpose: serves the hub's static pages and builders, which are stored in cbs_page_parts as `name='page:<path>'` with `content` = JSON `{t: content-type, b: body}`. It also serves the shared client scripts that every page loads.
- Endpoints (all GET):
  - Pages, each returning stored HTML: `cbs-admin` (the hub), `cbs-rams-builder`, `cbs-cphsp-builder`, `cbs-toolbox-builder`, `cbs-team-meeting`, `cbs-incident-report`, `cbs-ptm-sheet`, `cbs-ptm-crew`, `cbs-prestart`, `cbs-po`, `cbs-sign`, `cbs-team`, `cbs-subjobs-board`, `cbs-site-inspection`, `cbs-builder-kit`, `cbs-hz-icons`, `cbs-std`, `cbs-po-board`, `cbs-logo`, `cbs-permit`, `cbs-visit`, `cbs-hs`, `cbs-pci`, `cbs-coshh-builder`.
  - On serve: a download helper (`cbsDl`) and `<script src="/webhook/cbs-guard">` are injected into `<head>`. `no-store` cache.
  - Patches applied on the way out:
    - CBS Brand: Embr black/gold re-coloured to CBS grey #3d4043 and orange #F47920.
    - Keep View: the hub restores its last section after refresh; header Actions/Jobs badges.
    - Live Site Data: the site-inspection page gets workers, CPHSPs (frequency from CPHSP `state_json.insp`), previous inspections from cbs_inspections, and the record for `?id=`.
    - Sign Induction: the CPHSP induction slides on `cbs-sign`.
    - Scope Fill: the CPHSP builder gets a "Fill from scope of works" button that calls cbs-scope-data.
  - `cbs-guard` (JS, 5 min cache): the shared client layer.
    - Save guard: one write per tap, dedupes identical reads, backs off polling.
    - New-layout loading cover. iOS mobile fixes.
    - Loaders for the cast bar (TV), the side menu (cbs-nav), the combined-PDF helper and cbs-search.
    - **Not an auth check.** Sign-in lives in CBS - Nav (batch 1).
  - `cbs-search` (JS): switched off on 20/10/2026 at the client's request. Now an empty script.
  - `cbs-viewer` (JS): shared file viewer, `CBSView.open({u,n,list,actions})`.
    - PDFs render with pdf.js; images and video play in-page; Office files open in a new tab.
    - SharePoint URLs are proxied through `/webhook/cbs-file?u=`.
    - Locks page scroll; Esc or the back button closes it.
- Tables: cbs_page_parts (read), cbs_inspections (read).
- Integrations: none server-side. Client CDNs: pdf.js 3.11.174, qrcodejs.
- Rules: the CPHSP induction acceptance text and slides come from CPHSP `state_json`. The viewer's behaviour matches the CLAUDE.md rule (in-window, dark backdrop, full-screen option).

### CBS - Programme (`programme.json`, active yes)
- Purpose: backend for the job programme (Gantt): phases, then tasks, then sub-tasks, with dates, status, blockers, auto-shift of later items, undo, and draft (quote) programmes that go live later.
- Endpoints:
  - `GET cbs-programme-data?job=N` (JSON). Returns `{programme, phases[tasks[subs]], summary, week, planned_start, has_jobfile}`.
    - Roll-ups: % from leaves (checklist-driven, see Task Checklist); effective start/end from children; overdue; blocked-by name.
    - `week` = open leaves in the next 7 days, plus overdue ones.
    - Without `job`, returns `{jobs:[summary per Open programme]}`.
  - `POST cbs-programme-act {a, job, by, ...}` (JSON `{ok, message?, id?}`). Actions:
    - `create`: Open or Draft programme. Reopens if one exists.
    - `close`, `reopen`.
    - `settings`: `skip_weekends`, or shift rule `none|overlap|keep`.
    - `golive`: Draft to Open. Moves every date by the delta from the earliest start to the real start.
    - `save_item`, `status`, `move` (reorder), `shift` (±N days, working days if skip_weekends), `set_dates`, `delete_item` (cascades to children; clears `blocked_by` refs), `undo`.
    - `set_start`: writes cbs_jobs.starts_on.
  - `GET cbs-prog-start-ui` (JS): the "planned start" box injected into the programme page.
- Tables: cbs_programmes (r/w); cbs_prog_items (r/w/del); cbs_jobs (read; write `starts_on`, `contract_value` is not touched here).
- Business rules:
  - Item kinds: `phase` > `task` > `sub`. A parent must have the right kind, and an item can't change level.
  - Item status: Not started / In progress / Done. Programme status: Draft / Open / Closed. Closed blocks edits.
  - Shift rules (programme `notes.shift`, default `overlap`): `overlap` pushes only later items that now overlap; `keep` moves everything after by the same delta; `none` moves nothing.
  - After any change to an Open programme, cbs_jobs.starts_on is set to the earliest item start. A ServiceM8 booking still takes priority wherever the start is shown.
  - Every action writes one undo step (single level) and a history line.
- JSON columns:
  - cbs_programmes.`notes` = `{shift:'overlap'|'keep'|'none'}`.
  - cbs_programmes.`undo_json` = `{label, by, at, ops:[...]}`. Op shapes:
    - `{t:'set', id, row:{...old fields}}`
    - `{t:'del', id}`
    - `{t:'add', key, parentKey?, row}` (recreate a deleted item)
    - `{t:'prog', row}`
  - cbs_programmes.`history` is text lines.
  - cbs_prog_items: `checklist_json` (see Task Checklist), `check_token`, `area` (see Progress by Area).

### CBS - Programme Page (`programme-page.json`, active yes)
- Purpose: the programme page UI (`cbs-programme?job=N[&draft=1]`).
  - Timeline and list with collapsible phases and tasks. "+ New task/sub-task" rows where you type a name or drag across the row to set dates.
  - Edit dialog, undo button, skip-weekends toggle, shift-rule setting, go-live dialog.
  - Print Gantt PDF.
- Endpoints:
  - `GET cbs-programme` (HTML). Built server-side from cbs-programme-data, cbs-sm8-job (site/client) and cbs-admin-data (workers + subcontractors for "Assigned to", with CBS first).
  - `GET cbs-programme-logo` (the logo from page:cbs-logo; reused by many pages).
- Tables: cbs_page_parts (read logo).
- Integrations: PDF is **client-side jsPDF 2.5.1**. The Gantt is A4 or A3 landscape, with a "quote" variant for draft programmes.
  - It loads cbs-task-ui (checklists), cbs-lookahead-ui, cbs-area-ui and cbs-prog-start-ui.
- Rule worth keeping: a draft programme on an estimate is a quote programme. It goes live with a real start date.
- Note: uses `alert/confirm/prompt` widely. The rebuild must use in-app prompts.

### CBS - Progress by Area (`progress-by-area.json`, active yes)
- Purpose: adds an "Area / unit" field to programme items, plus a "Progress by area" panel (average % per area, done/total, overdue). Used by the programme page and the TV.
- Endpoints:
  - `GET cbs-area-ui` (JS injected into the programme page).
  - `POST cbs-prog-area {job,id,area,by}` (JSON `{ok}`). Sent after the normal save_item, by wrapping `fetch`.
- Tables: cbs_prog_items (update `area`; max 60 characters).
- Rule: a task with a blank area inherits its phase's area. No history line or `by` is recorded.

### CBS - QuickBooks PO (`quickbooks-po.json`, active yes)
- Purpose: the "Upload QuickBooks PO" page. The office drops in the PO PDF or photo that QuickBooks produced. AI reads it and pre-fills the form. The office checks it and saves to the PO board. A subcontractor-PO mode also exists (`po_type` Subcontract, status Approved).
- Endpoints:
  - `GET cbs-qbpo[?id=][&sub=1]` (HTML; stored as base64 in the Code node).
  - `POST cbs-qbpo-read {data(base64), mime}` (JSON `{ok, po:{...}}`).
- Tables: none directly. The page reads `cbs-admin-data?t=suppliers,pos,workers,subbies` and saves via `cbs-po-save` (see SM8 Lookup & Attach) into cbs_purchase_orders.
- Integrations:
  - **OpenRouter** chat completions, model `anthropic/claude-haiku-4.5`, n8n credential `openRouterApi`. The PDF is sent as a file part; images as `image_url`.
  - Fields extracted: po_no, supplier, po_date, expected_delivery, ship_to, job_ref (3–6 digits), deliver_guess (Site/Yard), type_guess (Material/Plant), hire_end, subtotal, vat, total, `lines[{desc,qty,unit,cost}]`.
  - The page looks up the job via cbs-sm8-job.
- Business rules:
  - PO number must be unique across the hub.
  - Saved row includes `source:'QuickBooks'`, `po_type` Material/Plant(/Subcontract), `deliver_to` Site/Yard (site = "CBS yard" when Yard), `hire_end`/`offhired_on` for Plant, and status Ordered / Part received / Received / Cancelled.
  - The PDF file name is `<po_no> - <supplier> (QuickBooks).pdf`. `notify` is set on new POs only.
- JSON: cbs_purchase_orders.`lines_json` = `[{desc, code, qty, unit, cost, material_id?}]`; `received_json` = `{"<line index>": qty received}`.

### CBS - QuickBooks Sync (`quickbooks-sync.json`, active no)
- Purpose: pulls QuickBooks Online bills and expenses (purchases) from the last 180 days into job costs. Inactive. Keep the logic for the job-costing rebuild.
- Endpoints/triggers: `POST cbs-qbo-run` (manual run; returns `{ok, added, updated, unmatched, message}`) and a daily schedule at 06:30.
- Tables: cbs_jobs (read refs); cbs_job_costs (insert/update); cbs_select_options (stores the sync status).
- Integrations: n8n QuickBooks node (`bill` and `purchase`, getAll with `WHERE TxnDate >= …`).
- Business rules:
  - A line matches a job when a 3–6 digit number in the line's Customer/Project, line description, memo or DocNumber equals a hub job ref.
  - Key `qbo_id = '<Bill|Expense>:<TxnId>:<job>'`. Net is summed per job; VAT is apportioned by net share.
  - New rows get a category guessed once from account and description: Subcontractors / Plant hire / Labour / Materials / Other. After that the category is left to the office.
  - Changed amount, date, supplier or ref updates the row and adds a history line.
- JSON: cbs_select_options row `reg='jobcosts', field='qbo_sync'`, `value` = `{at, ok, bills, expenses, added, updated, unmatched, message}`. Only one such row is kept.

### CBS - RFIs (`rfis.json`, active yes)
- Purpose: per-job RFI log. Raise an RFI, mark it sent, record the answer, close or reopen it. Filters (Open/Overdue/status), search, a single-RFI PDF and a log PDF.
- Endpoints:
  - `GET cbs-rfis?job=N` (HTML).
  - `GET cbs-rfis-data?job=N` (JSON `{rows, counts, overdue, contacts, site, client}`). Contacts come from cbs_subcontractors, cbs_suppliers and the job's client.
  - `POST cbs-rfi-act {a: save|status|answer|delete, job, by, ...}`.
- Tables: cbs_rfis (r/w/del); cbs_jobs, cbs_subcontractors, cbs_suppliers (read).
- Business rules:
  - Numbering is `RFI-001` per job (max + 1).
  - Status: Draft → Sent → Answered → Closed.
    - Sent needs a recipient and sets `sent_on`. Answered needs response text.
    - Back to Draft clears sent and answer fields.
    - Re-sending after an answer clears the answer and logs the previous answer in history.
  - Overdue = Sent and `needed_by` < today. Every change appends to `history`.
- Integrations: PDFs are client-side jsPDF, download only (`pdf_url` is never set). Email is a `mailto:` link only.
- JSON: `files_json` is always `'[]'` (unused).

### CBS - Scope (`scope.json`, active yes)
- Purpose: scope of works per job.
  - Sections hold items. Sections are areas on Project jobs, and phases or packages on CDM jobs. Each item has a "who" (CBS or a company). Two views: by section and by package.
  - Photos, plans and documents; supplier delivery instructions; scope PDF; mailto RAMS requests to subcontractors and delivery-instruction emails to suppliers.
  - Seeding from a site survey or the ServiceM8 job description; lock / unlock; read-only crew view.
- Endpoints:
  - `GET cbs-scope?job=N` (HTML).
  - `GET cbs-scope-data?job=N[&crew=1]` (JSON: scope, stage, cdm, locked, programme phases and current phase, subs/suppliers, variations, surveys).
  - `POST cbs-scope-act {a, job, by, ...}`. Actions: set_desc, lock, unlock, add_section, edit_section, del_section, move_section, add_item, add_var, edit_item, del_item, move_item, add_photos, del_photo, add_doc, del_doc, seed (`from: survey|desc`, `replace?`), build_prog.
  - `GET cbs-scope-crew?job=N` (crew HTML: no prices, no hub links; opens on the programme's current phase).
  - `GET cbs-scope-sm8?job=N` (JSON: the job's ServiceM8 photo attachments, newest first).
- Tables: cbs_scope (r/w); cbs_jobs, cbs_variations, cbs_surveys, cbs_suppliers (read); cbs_subcontractors (read, and insert when a new "who" company is typed with save_reg).
- Integrations:
  - ServiceM8 `job.json` (by generated_job_id) and `attachment.json` (job photos). Photos are shown via `/webhook/cbs-job-photo?u=<uuid>`.
  - Uploads go through `/webhook/cbs-job-upload` (folder `Scope`, so SharePoint `Jobs/Job N/Scope`).
  - `/webhook/cbs-job-files` for "From job files".
  - build_prog calls cbs-programme-act (now hidden in the UI).
  - The PDF is client-side jsPDF. pdf-lib merges the attached plans and documents at the back.
- Business rules:
  - Editable at Estimate and Approved until someone presses **Lock scope**. Lock needs at least one section.
  - Once locked: no structure or text changes. What is being done only changes via `add_var` (an item tagged with its `VAR-nnn`). Who, crew notes, photos and docs stay editable. Unlock is allowed and logged.
  - Stage is derived from the ServiceM8 status, falling back to the hub status:
    - Work Order / Approved → Approved
    - Completed → Completed
    - Unsuccessful → Unsuccessful
    - anything else → Estimate
  - Limits: 60 sections, 200 items per section, 30 photos per item, 40 docs per host. History is capped at 20k characters.
- JSON: cbs_scope.`scope_json` = `{v:1, next:<id counter>, desc?, locked_at?, locked_by?, docs?:[{n,u,by,at}], sections:[...]}`.
  - Section: `{id:'sN', name, who, prog_id?, docs?:[...]}` plus `items[]`.
  - Item: `{id:'iN', text, who, notes, src, var, supplier, sup_notes, prog_id?, photos?:[{k:'sp'|'sm8', u, n, by, at}]}`.
    - `u` is a SharePoint web URL when `k='sp'`, or a ServiceM8 attachment uuid when `k='sm8'`.
    - `src` records where the item came from, e.g. "Site survey dd/mm/yyyy · area 2" or "Job description".

### CBS - Script Block Patch (temp) (`script-block-patch-temp.json`, active no)
- Temporary tool: replaced or inserted a `<script id=…>` block in a stored page (cbs_page_parts), with a dry-run mode and a backup row. **Drop.**

### CBS - Service Sheets (`service-sheets.json`, active yes)
- Purpose: office-only service-sheet builder per job.
  - Header, then any number of sections, each with a title, details, and Before / Work in progress / After photos picked from the job's ServiceM8 photos.
  - Sign-off with a saved staff signature.
  - PDF in the house layout, saved to SharePoint.
- Endpoints:
  - `GET cbs-service-sheet?job=N` (HTML).
  - `GET cbs-service-data?job=N` (JSON: job, photos with Job File categories and captions, signers, sheets).
  - `POST cbs-service-save {job, by, id?, tok, sheet}`.
  - `POST cbs-service-del {id, job}`. The second confirmation is on the page; the PDF is left in SharePoint.
  - `POST cbs-service-pdf {job, by, id, b64}`.
- Tables: cbs_service_sheets (r/w/del); cbs_jobs, cbs_photo_tags, cbs_workers (read via the API with the internal key).
- Integrations:
  - ServiceM8 `job.json` (the active job for the number) and `attachment.json` (images).
  - SharePoint PUT to `CBS System/Operations/Jobs/Job N/Service Sheets/Job N - Service sheet SS-xx - <date>.pdf` (replace on conflict).
  - The PDF is built client-side with jsPDF in the standard house layout (same as the Close-out report): orange top bar, logo and title, sections, a 2-column photo grid, sign-off row, and SafeContractor + CHAS logos in the footer.
- Business rules:
  - Numbering is `SS-01` per job.
  - Double-save guard: the same `tok` resolves to the same sheet.
  - Status is Draft until a PDF is saved, then Issued.
  - Signers = workers with `in_service` true plus a saved `signature`.
  - Save also saves the PDF when the sheet has content and a signer. "Download PDF" only downloads.
- JSON:
  - `sections_json` = `[{title, details, photos:{before:[{u: SM8 attachment uuid, cap}], progress:[...], after:[...]}}]`. Max 40 sections, 60 photos per group.
  - `history` = JSON array `[{at, by, ev:'Created'|'Saved'|'PDF saved to the job files', file?}]`, last 30 entries.

### CBS - ServiceM8 Client Lookup (`servicem8-client-lookup.json`, active no)
- Manual helper: listed ServiceM8 clients (name, uuid, address) to extend the client map in "Excel to ServiceM8". **Drop.**

### CBS - ServiceM8 Connection Test (`servicem8-connection-test.json`, active no)
- Manual test: created a test job and note in ServiceM8, read it back, and included a `job.created` trigger. **Drop.** (It shows the ServiceM8 node and webhook trigger work.)

### CBS - ServiceM8 Job Lookup & Attach (`servicem8-job-lookup-attach.json`, active yes)
- Purpose: a grab-bag of ServiceM8 and SharePoint services used across the hub.
- Endpoints:
  - `GET cbs-sm8-job?no=N` returns `{found, job_no, site, client, description, status, crew[], booked[dates]}`.
    - Calls: job.json, company/{uuid}.json, jobactivity.json, staff.json.
    - Crew and dates come from active, scheduled activities.
  - `POST cbs-sm8-attach {job_no, item_id | pdf_url, name, doc_key?, source?, quiet?, dedupe?, replace?}`. Responds immediately and runs in the background.
    1. Downloads the file from SharePoint, by drive item id or by share URL using the `shares/u!` encoding.
    2. POSTs it as a multipart `attachment.json` to the ServiceM8 job: `related_object=job`, `attachment_source = 'CBS Operations Hub - <doc_key>'`.
    3. Deletes older active copies with the same source or the same normalised file name (keeps one copy per document).
    4. Calls `cbs-job-links`.
    5. For RAMS, CPHSP, toolbox, team meeting, pre-start, site inspection and PTM documents: calls `cbs-notify` (with a sign-on link `cbs-sign?doc=&id=`), then `cbs-sign-restamp`.
    - With `dedupe`, it skips the upload if a copy with the same name already exists.
  - `GET cbs-work-ahead` (JSON). An 8-week view from the ServiceM8 schedule:
    - Bookings expanded per day; a booking ending at 00:00 doesn't cover that day.
    - Jobs and staff per week, unscheduled Work Orders, and open quotes (count, value, last 30 days).
  - `POST cbs-ptm-loaded {id, by, mats[{id,qty}], plant[ids], extra[]}`. Crew signs out a load-up sheet:
    - Deducts materials (cbs_materials qty_on_hand) and logs cbs_stock_moves with reason "Loaded for job".
    - Books plant out (cbs_assets: yard_status Out, out_job, out_with `<van reg> - <assigned driver>`, out_since, due_back).
    - Sets sheet status Loaded and notifies (`ptm_loaded`), listing items now at or below min_level.
    - Refuses if the sheet is already loaded.
  - `POST cbs-po-receive {id, by, lines[{i,qty}]}`.
    - Adds to `received_json`. Lines with a `material_id` add stock and a stock move "Purchase order received".
    - Status becomes Received or Part received. Notifies `po_received`.
  - `POST cbs-po-save {id, row, pdf?(base64), filename?, existing_pdf_url, notify}`.
    - Uploads the PDF to `CBS System/Operations/Purchase Orders/` (an edited PO overwrites the same file name).
    - Saves the cbs_purchase_orders row and attaches the PDF to the SM8 job (`doc_key po-<po_no>`).
    - New POs notify `po_issued`.
  - `POST cbs-incident-record {id}` (async).
    - Builds a plain PDF of the incident **with hand-written PDF syntax** (no library).
    - Uploads to `CBS System/H&S/Incidents/<date> - <ref> - <kind> - Incident Record.pdf` and sets cbs_incidents.record_pdf_url.
    - Attaches to the SM8 job when `sm8_job` is set. Notifies `incident_reported`, flagged "INJURY / ILLNESS" when relevant.
    - The PDF deliberately has no office link (crew can see SM8 attachments).
  - `POST cbs-incident-report-save {pdf, incident_id, id?, row, inc?}`.
    - Uploads to `CBS System/H&S/Incident Reports/` and saves cbs_incident_reports.
    - Optional partial update of the incident. SM8 attach. Notifies `incident_report_saved`, including "RIDDOR report required".
  - `GET cbs-sign-data?doc=rams|swms|cphsp|sssp|prestart|toolbox|meeting|hsmeet&id=`.
    - Returns the document summary, who has signed (matching revision), the active worker list, and the CPHSP induction content (sections and acceptance wording built from CPHSP `state_json`).
  - `POST cbs-sign-save {doc_type, doc_id, doc_rev, doc_label, job_no, name, company, is_worker, signature(data:image/png|jpeg), inducted_by}`.
    - Inserts into cbs_signons (company defaults to Chelmsford Building Services; `reviewed=No`).
    - Notifies `signon`, then calls `cbs-sign-restamp`.
  - `POST cbs-pdf-out {name, data}` echoes a base64 PDF back as `application/pdf` inline. Used to open PDFs in a new tab where blob downloads are blocked (ServiceM8 app).
- Tables (all via the API): cbs_ptm_sheets, cbs_vehicles, cbs_materials, cbs_stock_moves, cbs_assets, cbs_purchase_orders, cbs_incidents, cbs_incident_reports, cbs_signons, cbs_workers; reads rams/cphsp/prestarts/toolbox.
- Integrations: ServiceM8 (job, company, jobactivity, staff, attachment GET/POST/DELETE); Microsoft Graph (drive item content, shares, PUT upload); `cbs-notify`, `cbs-job-links`, `cbs-sign-restamp`.
- JSON:
  - cbs_ptm_sheets.`loaded_json` = `{plant:[asset ids], extra:[text], mats:[{id,qty}], by}`.
  - `items_json` is read for `due_back`. `load_issues` is text lines (written by Yard).
  - PO `received_json` and `lines_json`: see QuickBooks PO.

### CBS - SharePoint Browse (read only) (`sharepoint-browse-read-only.json`, active no)
- Dev helper: `GET cbs-sp-browse?path=|q=` listed or searched the CBS drive. **Drop.** The single drive ID used everywhere is in this file.

### CBS - SharePoint Crawl (read only) (`sharepoint-crawl-read-only.json`, active no)
- Dev helper: `GET cbs-sp-crawl?path=Clients` recursively inventoried files (path, name, ext, size, date, id). Used for migration planning. **Drop.**

### CBS - Sign-on Stamp (`sign-on-stamp.json`, active yes)
- Purpose: keeps the sign-on sheet inside each issued document's PDF up to date, and produces the CPHSP site induction register.
- Endpoints: `POST cbs-sign-restamp {doc, id}` (responds immediately). It is called after every sign-on and after a document is attached to ServiceM8.
- Tables: cbs_signons (read by doc_id); rams/prestarts/toolbox/cphsp (read via cbs-admin-data); cbs_cphsp (update `register_pdf_url`).
- Integrations:
  - Microsoft Graph: share-URL metadata, GET content, PUT replace content of the same item.
  - For RAMS, pre-start, toolbox and meeting: appends signature pages as a **PDF incremental update** (hand-written PDF objects, JPEG signatures embedded).
    - Everything after a `%CBS-SIGNON` marker is replaced on each run, so re-stamping is idempotent.
    - Section titles: RAMS "12. Worker sign-on", pre-start/toolbox "Crew sign-on", meeting "Attendance sign-on".
    - Columns: #, Name, Company, Type (Worker / Visitor / Subcontractor), Signed, Signature.
  - For CPHSP: builds a separate "Site Induction Register" PDF in `CBS System/H&S/Construction Phase Plans/Induction Registers/`.
  - Re-attaches the result to the ServiceM8 job via cbs-sm8-attach (quiet), using doc_key `RAMS #id`, `Pre-start #id`, `Toolbox talk #id`, `Team meeting #id` or `Induction register #id`.
- Rules:
  - Only sign-ons for the current revision are included (or sign-ons with no revision).
  - Only JPEG signatures are embedded (the sign page saves JPEG).

### CBS - Site Survey (`site-survey.json`, active yes)
- Purpose: crew and office site-survey form (mobile).
  - Fields: client, site address, contact, raised by, surveyor, date, conditions; areas, each with scope, photos and recommended remedial works.
  - The PDF report goes to SharePoint and the ServiceM8 job. Photos go to both.
  - Versions: saved surveys can be reopened and edited; changes are marked in orange on the form and in the PDF.
  - Sharing via WhatsApp or email text. The draft autosaves on the device.
- Endpoints:
  - `GET cbs-survey[?job=N][&edit=ID]` (HTML). Opened with `?job`, the job number, client and address are locked.
  - `POST cbs-survey-save {pdf, job_no, site, surveyor, raised_by, client, site_address, contact_*, conditions, areas[], survey_ref?, version?, state, changes, filename}`. JSON response; validated (site/client, surveyor, raised_by, at least one area, PDF required).
  - `GET cbs-survey-job?no=N` returns client, site, address and contact.
    - Contact = the SM8 job contact of type "job", else a non-billing contact, else the client's primary contact.
    - Site = the hub job's site, else the client name.
  - `POST cbs-survey-photo {job_no, name, folder, sm8, data}`: one photo to SharePoint, plus a ServiceM8 attachment with source "CBS Operations Hub - Site survey photo".
  - `GET cbs-survey-list?job=N` (versions grouped by `survey_ref`).
  - `GET cbs-survey-get?id=` (state to reopen; rebuilds state for pre-version rows).
  - `GET cbs-survey-photo-get?f=&n=` (streams a photo; only under `CBS System/Operations/`).
- Tables: cbs_surveys (insert/read); cbs_jobs (read); cbs_page_parts (logo).
- Integrations:
  - ServiceM8: job, company, jobcontact, companycontact, attachment POST.
  - Graph: PUT the PDF to `CBS System/Operations/Jobs/Job N/Site Surveys/<name HHMM>.pdf`, or `Operations/Site Surveys/` when there's no job; rename on conflict.
  - Photos go to `…/Job N/Site Surveys/Photos`, or `Operations/Site Surveys/Photos/Survey <key>`.
  - Then `cbs-sm8-attach` with doc_key `Site survey #<survey_ref>`.
  - PDF is client-side **jsPDF 4.2.1** (jsdelivr), using an SVG logo rendered to PNG. `cbs-pdf-out` opens the PDF inline.
- Rules:
  - Photos are 2000 px at JPEG 0.88. Report warning at 10 MB; save blocked above 11.5 MB (n8n 16 MB body limit).
  - Every save of an edited survey is a new row with `version` + 1 and the same `survey_ref` (the first version's id).
  - `sm8_status` values: "Sent to ServiceM8" / "No job yet" / "SharePoint upload failed".
- JSON:
  - `areas_json` = `[{name, scope, remedial, photos:<count>}]`.
  - `state_json` = `{v:1, sk:<no-job photo folder key>, seq, job, client, addr, phone, email, raised, surveyor, date, conditions, areas:[{name, scope, remedial, photos:[{n:file name, f:SharePoint folder, w, h}]}], legacy?}`.
  - `change_summary` is a one-line text.

### CBS - Site Tasks (`site-tasks.json`, active yes)
- Purpose: backend for "On site tasks". A one-off job task can be sent to the crew's job portal, optionally carrying a form for the crew to fill in and submit. The office approves (marks Done) or sends it back.
- Endpoints: `POST cbs-site-task {a, by, ...}`.
  - `get {id}`, `create {job, form?, title, desc}`, `set {id, onsite}`, `sendback {id, note}` (back to To do with the note).
- Tables: cbs_job_tasks via `cbs-task-db` (internal); cbs_task_status via `cbs-task-status`.
- Rules:
  - Only `req='custom'` tasks on a job can go to site.
  - Form types and their categories: survey → Survey; permits, inspection, audit, preuse → H&S. Without a form the category is Site.
  - Older tasks with no setting count as on site when their category is Site, Snag or H&S.
- JSON: cbs_job_tasks.`data_json` keys `onsite` (bool), `form`, `sub:{by,at}` (crew submitted), `sendback:{note,by,at}`.

### CBS - SM8 Historic Load (one-off) (`sm8-historic-load-one-off.json`, active no)
- One-off migration: read the old Excel job tracker (SharePoint workbook, one tab per client) and created ServiceM8 clients and jobs for 2025+ rows. Wrote "Created" and a hyperlink back to the sheet. Dry-run by default. **Drop.**
- Rules worth knowing (they explain existing ServiceM8 data):
  - Sheet status mapped to ServiceM8 status and folder (queue):
    - Enquiry → Quote / Enquiry
    - Estimated → Quote / Estimated
    - On Hold → Quote / On Hold
    - Approved → Work Order / Approved
    - Part Approved → Work Order / Part Approved
    - Reactive (Call-Out) → Work Order / Reactive (Call-Out)
  - The sheet job number went into `purchase_order_number`. `job_description` = `<job no> <desc>` plus "Area:" and "Raised by:" lines.
  - Client naming used `ZZ Client A/ZZ Client B/ZZ Client P - <site>` prefixes.

### CBS - SM8 Job Title Backfill (temp) (`sm8-job-title-backfill-temp.json`, active no)
- One-off: rewrote line 1 of ServiceM8 job descriptions created by the Excel import to `<sheet job number> <description>`. **Drop.**

### CBS - Snagging (`snagging.json`, active yes)
- Purpose: per-job snag list.
  - Office: raise snags with before photos, area, phase, assignee and due date; push selected snags to the crew; sign off fixed snags; reopen or delete.
  - Crew view: fix a snag with an after photo and notes.
- Endpoints:
  - `GET cbs-snags?job=N` (admin HTML) and `GET cbs-snags-crew?job=N` (crew HTML, no hub links).
  - `GET cbs-snags-data?job=N` returns `{counts:{open, fixed, signed_off}, snags}`.
  - `POST cbs-snag-photo {job, snag, kind:before|after, data}` returns `{ok, url}`.
  - `POST cbs-snag-act {a: save|fix|signoff|reopen|delete, job, by, ...}`.
  - `POST cbs-snag-push {job, by, ids[], pdf?, filename}`.
- Tables: cbs_snags (r/w/del via the API).
- Integrations:
  - Graph PUT photos to `CBS System/Operations/Snagging/Job N/Photos/` (rename on conflict). The snag-list PDF (client jsPDF) goes to `…/Snagging/Job N/`.
  - `cbs-notify` events: `snag_fixed`, `snags_pushed` (message lists up to 12 snags, links the crew page, attaches the PDF), reopen after push.
  - The history line says "Sent to ServiceM8": the delivery is via cbs-notify.
- Rules:
  - Numbering is `S01` per job.
  - Status: Open → "Fixed - awaiting sign-off" (needs at least one after photo) → "Signed off" (bulk, only from Fixed). Reopen clears fixed and signed-off fields.
  - Photo URLs must be on the CBS SharePoint tenant. Max 30 photos.
- JSON: `before_json` and `after_json` = `[{u: SharePoint web URL, at: ISO, by}]`.

### CBS - Support (`support.json`, active yes)
- Purpose: bug reports and feature requests for the hub, with photos and a status workflow. A "Report" PDF (formerly "Claude report") bundles items with details and photos to hand to a developer, and items can be copied as text.
- Endpoints:
  - `GET cbs-support[?tab=bug|feature]` (HTML).
  - `GET cbs-support-data[?kind=]` returns `{rows, open}`.
  - `POST cbs-support-photo {ref, data}` returns `{ok, url}`.
  - `POST cbs-support-act {a: save|status|delete, by, ...}`.
- Tables: cbs_support (r/w/del); cbs_hub_notices (insert on a new item: events `support_bug` / `support_feature`).
- Integrations: Graph PUT photos to `CBS System/Operations/Support/Photos/`. PDF is client-side jsPDF.
- Rules:
  - Refs are `BUG-001` and `FR-001` (numbered per kind).
  - Bug statuses: New / Investigating / Fixed / Closed / Can't reproduce.
  - Feature statuses: Submitted / Under review / Accepted / Planned / In progress / Released / Not suitable (needs a reason) / Duplicate (needs `duplicate_of`).
  - Priorities: bug — Stops work / Annoying / Cosmetic; feature — Blocking my work / Important / Nice to have.
  - Bugs also store `expected`, `steps`, `page_url` and `device`.
- JSON: `photos_json` = `[{u, at, by}]`.

### CBS - Task Checklist (`task-checklist.json`, active yes)
- Purpose: checklists on programme tasks.
  - The office edits the checklist on the programme page; this sets the task's % and status.
  - A per-task crew link (`cbs-task?t=TOKEN`, put in the ServiceM8 job) opens a one-task tick page.
  - If the task came from the scope, the page shows the matching scope items: text, crew notes, supplier delivery, photos and plans (no prices).
- Endpoints:
  - `GET cbs-task?t=` (crew HTML).
  - `POST cbs-task-act {a: tick|link|save, ...}`.
  - `GET cbs-task-ui` (JS editor injected into the programme page).
- Tables: cbs_prog_items (r/w `checklist_json`, `status`, `pct`, `check_token`); cbs_programmes (history line).
- Rules:
  - Only leaf items (no children) can hold a checklist.
  - Status is derived: all done → Done; any done, or already In progress → In progress; else Not started.
  - Without a checklist, a manual `pct` can be set.
  - The crew token is 26 random characters, stored on the item; a tick checks both index and text.
  - Max 60 lines of 200 characters.
- JSON: `checklist_json` = `[{t: text, done: bool, by, at}]`.

### CBS - Task Status (`task-status.json`, active yes)
- Purpose: server-side store for the status of automatic and roll-up tasks (hub Actions board cards that aren't job-task rows), keyed by `task_key`.
- Endpoints: `POST cbs-task-status {rows:[{task_key, title, ref_table, ref_id, grp, status, v, note?, note_date?, note_by?}]}`. Upserts up to 200 rows.
- Tables: cbs_task_status (read + upsert).
- Rules:
  - Statuses accepted: New / In progress / Done / Dismissed. (The Tasks UI also writes "Removed" through the meta path.)
  - Only `v>=2` rows (current hub) may write.
  - **In progress is sticky**: a background sync (a row without a `note` field) can't move an In progress task. Only a person's action can.
  - Dismissed = a dismissed roll-up reminder. It comes back when the reminder text changes.
  - Task key examples: `substances|6|Review SDS - …`, `jobreq:<job>:task<id>`, `jobreq:<job>:<req>`.

### CBS - Tasks (`tasks.json`, active yes)
- Purpose: the single task model and everything around it. This is the reference for the CLAUDE.md "one task panel" rules.
  - Task feed; Actions board page; shared task drawer script (patched in many layers).
  - Crew job portal; job files browser and upload; job details; people list.
- Endpoints:
  - `GET cbs-tasks-data?job=N | ?all=1 [&fresh=1]` (JSON). Merges, without copying:
    - job task rows (cbs_job_tasks, `src:'row'`)
    - requirement checks and roll-ups (`cbs-job-reqs-data`, `src: req|roll|auto`)
    - the Enquiry prep checklist (cbs_jobs.enq_json, `src:'enq'`)
    - snags (`src:'snag'`)
    - team cards (`src:'team'`)
    - overlays from cbs_task_status
    - It also adds ServiceM8 client and description (from `cbs-pipeline`) and folds requirement items into their requirement card.
  - `POST cbs-tasks-act {a, by, ...}`. Actions: create, update, status, delete, meta (assignee + due + description), file, unfile, cfile, untick (remove an enquiry requirement), migrate_enq (one-off), save (one combined drawer save: create|update|meta|status|items).
  - `POST cbs-task-db {k, op: get|insert|update|delete, id, row}`: internal CRUD on cbs_job_tasks. Needs the internal key; whitelisted columns only.
  - `GET cbs-board` (Actions board HTML: To do / In progress / Done, drag, group by job, filters).
  - `GET cbs-tasks-ui-base` / `GET cbs-tasks-ui` (shared task drawer JS, base and patched).
  - `GET cbs-crew-link?job=N` returns `{url}` (crew portal link).
  - `GET cbs-crew?t=<job>.<hash>` is the **crew job portal** (no sign-in; a name is picked per action). Two tabs:
    - To do: sign on today, induction, documents to sign, office tasks sent to site, site actions.
    - Job info: scope, site, contacts, emergency, CoSHH, rules, documents, drawings, look-ahead.
  - `POST cbs-crew-act {t, a: tick|status|submit, by, id, ...}`.
  - `GET cbs-crew-go?uuid=<SM8 job uuid>` redirects to the portal (used by the ServiceM8 Onsite add-on's button).
  - `GET cbs-job-files?job=N` (JSON). Every file in SharePoint `Operations/Jobs/Job N/<folder>/` and `Operations/Enquiries/Job N/`, grouped by folder.
    - Folder order: Surveys, Drawings, Estimate, Quotes, Documentation, RAMS, Subcontractor RAMS, Purchase orders, Permits, Photos, Handover, Other.
  - `POST cbs-job-files-up {job, folder, filename, data, by, office?}`. Max 10 MB; any file type.
    - Goes to `Jobs/Job N/<folder>/Job N - <name>`, or to `Office Tasks/<folder>` for tasks with no job.
  - `GET cbs-job-details?job=N` and `POST cbs-job-details {job, by, details:{name, client, client_contact, site, starts_on, ends_on, pm, scope, contract_value, notes}}`. Updates the newest cbs_jobs row; fields not sent are kept.
  - `GET cbs-people` (active workers; template roles `{{…}}` dropped).
- Tables: cbs_job_tasks (r/w/del); cbs_jobs (r/w details); cbs_task_status (r/upsert); cbs_snags, cbs_workers (read); cbs_prog_items (list); cbs_claims and cbs_hub_notices (written from board scripts via the API).
- Integrations:
  - Graph: list children, PUT upload.
  - ServiceM8: `job/{uuid}.json` for crew-go.
  - Other n8n hooks: cbs-job-reqs-data, cbs-pipeline, cbs-jobtask-done, cbs-enquiry-save, cbs-actions-data, cbs-coshh-data, cbs-file-alerts-ui, cbs-visit, cbs-job-reg-data, cbs-drawings-data.
  - The slow feeds are cached in workflow static data: requirements 45 s (5 min for a single job), pipeline 60 s.
- Business rules (current, after the 27/10 patches):
  - Every task is a single task (no lines). Statuses are To do / In progress / Done, with Verified after Done. "In hand" = In progress with a note (note, note_date, note_by on cbs_task_status).
  - Any task can be set Done by hand ("no restrictions"). Requirement tasks are otherwise Done when the builder record is done **or** a file is uploaded.
    - Builder-only exceptions (a file never counts): pre-starts, toolbox talks, site meetings, diary, visitors, sign-ons, inspections, scaffold checks, plant pre-use checks.
  - Category is automatic; requirement, roll-up and auto tasks are never "Site". Categories: Paperwork, H&S, Procurement, Client, Site, Snag, Survey, Estimate, Supplier quotes, Enquiry, Office.
  - Delete, Remove from job and Dismiss are two-step in-app confirms (4 s arm). "Remove from job" sets status `Removed` on cbs_task_status, hidden for 10 minutes while the requirements feed catches up.
  - Snags can only be changed on the snagging page. Team cards only through their board buttons.
  - Crew token: `<job>.<first 20 hex chars of sha256(salt + ':' + job)>`. The salt is hard-coded (see Secrets). The crew can only act on `req=custom` tasks that are sent to site.
  - Crew can't mark form tasks Done; they "Mark as submitted" and the office approves.
- JSON columns:
  - cbs_job_tasks.`data_json`:
    - `checklist:[{cid, t, st:'To do'|'In progress'|'Done', done, by, at, who, due, nt, files:[{n,u,at,by}]}]` (older rows: `{t, done, by}`; the old list is kept as `checklist_old`)
    - `link:{type:'claim'|'inc'|'veh'|'plant', id, name}`
    - `tags` (comma text)
    - `pin:{drawing_id, page, x, y}`
    - `rec_id`
    - `onsite`, `form`, `sub:{by,at}`, `sendback:{note,by,at}`
    - `verified_by`, `verified_at`
    - `from_enq`, `from_item`, `from_checklist`
  - cbs_job_tasks.`files_json` = `[{n, u (SharePoint URL), at: YYYY-MM-DD, by}]`, last 60.
  - cbs_task_status.`files_json` uses the same shape. Also has `assignee`, `due_on` and `description` columns.

### CBS - Team (`team.json`, active yes)
- Purpose: backend for the crew "Team" page (`cbs-team`, served by Pages). Vehicle check, vehicle accident, incident or near miss, general request, lost / stolen / damaged tool, and time-off request.
- Endpoints:
  - `GET cbs-team-data` returns `{d: base64 JSON {workers, vehicles}, tools}`.
  - `POST cbs-team-submit {type: check|accident|incident|request|tool, name, ..., photos[data URIs]}`.
  - `POST cbs-team-leave {...}` (time off).
- Tables: cbs_workers, cbs_vehicles, cbs_assets (read); insert into the table that matches the type: cbs_vehicle_checks, cbs_vehicle_accidents, cbs_incidents, cbs_requests (request and tool), cbs_time_off. Also cbs_photos (up to 4 photos as base64 data URIs, `ref_table`/`ref_id`), cbs_requests (auto replacement request), cbs_assets (status Needs repair / Lost).
- Integrations: `cbs-notify` (link `cbs-admin?open=<register>&id=`); incidents go through `cbs-incident-record` instead (PDF + SM8 + notify).
- Rules:
  - Vehicle check status: Passed / Defects logged / Off road (driver marked it unsafe). Seven boolean checks.
  - Incident ref is `INC-YYMMDD-<random 3 digits>`. A near miss defaults to severity "No injury".
  - Leave counts working days (Mon–Fri). Part days = 0.5.
  - Tool report: Stolen = Today urgency; Damaged → asset Needs repair; Lost/Stolen → asset Lost; a replacement request is created when asked for.

### CBS - Today On Site (`today-on-site.json`, active yes)
- Purpose: the "Today on site" panel and page for a job (site manager / office). Read-only roll-up for today:
  - People on site, with chips for signed on / induction / RAMS.
  - Visitors on site.
  - Safety due: permits awaiting or expiring today, no pre-start, inspections and toolbox talks due, open incidents.
  - Programme today, behind plan, coming up.
  - Deliveries and off-hires due; unloaded load-ups.
  - Snags fixed or new; overdue RFIs; variations awaiting instruction.
  - Diary incomplete.
  - Also: documents to sign, the crew portal link and QR, and the visitor sign-in link.
- Endpoints:
  - `GET cbs-today-data?job=N` (JSON sections; each line is `{t, s, u, b, f:'r'|'a'}`). Returns `show:false` for enquiries.
  - `GET cbs-today-ui` (JS).
  - `GET cbs-today?job=N` (page shell).
  - `GET cbs-crew-me` (JS: crew pages opened from the portal with `?me=1` remember the name in `cbs_name`).
- Tables: none directly. Reads cbs-admin-data (rams, cphsp, prestarts, toolbox, signons, ptmsheets, incidents, pos, workers), prog items, cbs-sm8-job, cbs-cdm, cbs-job-reg-data (summary, permits, visitors), cbs-snags-data, cbs-drawings-data, cbs-variations-data, cbs-job-sched-data (scaffold, toolbox).
- Rules:
  - Signing today's pre-start **is** the day's sign-on (no separate site sign-in).
  - People = booked in ServiceM8 today, or signed today's pre-start.
  - Next due date = frequency (daily / weekly / fortnightly / monthly / "every N days") plus the last-done date; otherwise `due_on`.
  - Permits are CDM-only.

### CBS - TV Dashboard (`tv-dashboard.json`, active yes)
- Purpose: office TV dashboard. The URL is protected by a fixed link token `k`.
  - Overview: tiles; Needs attention (= the Actions board feed plus TV-only alerts); On now / Coming up (ServiceM8 schedule only, up to 21 days); Expiring (fleet, insurance, sub docs, accreditations, training, plant, CoSHH, H&S policy); Enquiries table; Job Files table (requirement status per column).
  - Single-job focus view (job / programme / rotate).
  - Actions-board view.
  - Enquiry view.
  - Cast-to-TV from the Job File or Enquiry prep, "Update TV now" nudge, and a settings page.
- Endpoints (all need `k`):
  - `GET cbs-tv` (HTML).
  - `GET cbs-tv-data` (JSON; slow, about 20 s, so cached).
  - `GET cbs-tv-settings` (HTML) and `POST cbs-tv-settings-save {k, s}`.
  - `GET cbs-tv-nudge` writes a timestamp; `GET cbs-tv-ping` is polled (every 2 minutes) for it.
  - `GET cbs-tv-cast?a=show|stop|status&job=&name=`.
  - `GET cbs-castbar` (JS bar shown on hub pages while a job is cast).
  - `?job=N` on cbs-tv gives a preview for one viewer only.
- Tables:
  - Read: cbs_jobs, cbs_permits, cbs_visitors, cbs_pci, cbs_job_plant, cbs_job_coshh, cbs_tv_settings, cbs_job_tasks.
  - Write: cbs_tv_settings (upsert); cbs_jobs (bare row `ref + name` for a cast enquiry).
  - Many registers are read via cbs-admin-data.
- Integrations (n8n hooks): cbs-work-ahead, cbs-pipeline, cbs-actions-data, cbs-sm8-job, cbs-programme-data, cbs-snags-data.
- Rules:
  - Morning readiness for jobs on today (RAMS not signed, no pre-start, no load-up sheet, load not picked up): amber until 07:29, red from 07:30.
  - Requirements per job come from `cbs_jobs.reqs_json.on` (written by the Job File). A job with nothing saved has nothing ticked.
  - Permits are shown only on CDM jobs. Pre-con info belongs to the Enquiries table.
  - The page version (`pv`) is bumped to force open TVs to reload.
- Caching: workflow static data (not cbs_cache). Fresh under 90 s; served while under 10 min with a background rebuild (at most one per view per 90 s). Cleared by nudge and settings save.
- JSON: cbs_tv_settings is key/value rows (`key, value, updated_at`):
  - `main` = `{view:'overview'|'board'|'job:<N>', panels:{act, live, pipe, jt, up, exp}, cats:{permits, paperwork, subrams, plant, incidents, vehicles, requests, stock, notices, pipeline, programme, snags, x_vehicle, x_insurance, x_subdocs, x_accred, x_training, x_plant, x_coshh, x_hs}, upDays 1–21, expDays 7–120, chaseDays 1–30, swap 0–600 s, prog:{on, wb, wa}, jv:{mode:'job'|'prog'|'rotate', secs}}`
  - `nudge` = ISO timestamp.
  - `cast` = `{job, prev:<previous view>, src:<page cast from>}`.

### CBS - Variations (`variations.json`, active yes)
- Purpose: per-job variations log, plus the job's contract value.
  - Raise, price, submit, approve or reject. Totals: contract, approved, current = contract + approved, pending, approved time (days).
  - Approved variations can add a programme task. Instruction-via options can be edited. Single and log PDFs.
- Endpoints:
  - `GET cbs-variations?job=N` (HTML).
  - `GET cbs-variations-data?job=N` (JSON `{rows, totals, opts, optsCustom, phases}`).
  - `POST cbs-variation-act {a: save|status|delete|contract|addtask|opt, job, by, ...}`.
- Tables: cbs_variations (r/w/del); cbs_jobs (read; write `contract_value`); cbs_select_options (`reg='variations', field='instruction_via'`).
- Integrations: `cbs-programme-data` and `cbs-programme-act` (save_item task under the chosen phase, notes "From variation VAR-nnn"). PDFs are client-side jsPDF, download only.
- Rules:
  - Numbering is `VAR-001` per job.
  - Statuses: Raised → Priced (automatic when a cost is entered; back to Raised if the cost is cleared) → Submitted → Approved / Rejected (sets `decided_by` and `decided_on`).
  - Any status other than Raised needs a cost. Only Approved variations can add programme tasks.
  - Default instruction-via list: Site instruction, Email, Verbal, Architect's instruction, Drawing revision, Client request. It is seeded into select options on the first edit.
  - Contract value needs a Job File row.
- JSON: `prog_item_ids` is CSV of cbs_prog_items ids. `files_json` is `'[]'` (unused).

### CBS - Yard (`yard.json`, active yes)
- Purpose: yard tablet page (`cbs-yard`, HTML stored as page:cbs-yard).
  - Flag plant faulty / missing / found.
  - Log materials returned from a job (including items not in the register).
  - Report load-up problems (out of stock / faulty / can't find / couldn't buy).
  - Submit a stock take, which the office approves (`cbs-yard-approve`).
- Endpoints:
  - `GET cbs-yard`.
  - `GET cbs-yard-approve[?id=]` (HTML).
  - `GET cbs-yard-data[?id=]` (last 30 stock takes, or one with its lines).
  - `POST cbs-yard-act {action: plant|matreturn|loadissue|stocktake, by, ...}`.
  - `POST cbs-yard-approve-act {id, action: approve|reject, by, lines?, notes}`.
- Tables: cbs_stocktakes (insert/read/update); via the API: cbs_assets, cbs_materials, cbs_stock_moves, cbs_ptm_sheets (`load_issues`), cbs_hub_notices (closes older `ptm_short` cards); cbs_page_parts (page).
- Integrations: `cbs-notify` events plant_faulty, plant_missing, plant_found, stock_return, ptm_short, stocktake_submitted.
- Rules:
  - Faulty → asset Needs repair; Missing → Lost (a note is required for both).
  - Found / back in use → In service at a location (default CBS Warehouse). The asset `notes` get a dated line.
  - Approving a stock take: new qty = counted + (stock now − stock at count), which keeps movements made since the count.
    - Logs "Stock take adjustment" moves and sets `last_counted_on` / `last_counted_by`.
    - Only Pending stock takes can be decided.
  - Only one open `ptm_short` notice per load-up sheet.
- JSON: cbs_stocktakes.`lines_json` = `[{id, name, unit, location, system, counted}]` (3-decimal strings).
- Note: several of its saves call cbs-admin-save **without** the internal key (the backend allows them). The notices save uses the key.

---

## Cross-cutting

- **Hosting pattern:** every page is a GET webhook returning HTML built in a Code node or stored in cbs_page_parts (`page:<path>`). Data comes from a `-data` GET (JSON) and actions go to an `-act` POST `{a, job, by, ...}` returning `{ok, message?, ...}`. Rebuild this as Next.js pages plus API routes.
- **Register API / internal key:**
  - `cbs-admin-save` (list/save/del by alias) and `cbs-admin-data` (multi-table read) in Operations Backend are the data layer.
  - A shared internal key (`k`) unlocks protected writes: sign-in records, task status, signons create, notices create, job plant, snags, incident reports. `cbs-task-db` also requires it.
  - In the rebuild these become server-side Supabase calls; no shared key in client-reachable URLs.
- **Auth / sign-in:**
  - Office sign-in (name + PIN, tokens in cbs_signin) lives in CBS - Nav (batch 1). Pages here only read the name from localStorage (`cbs_me`, `cbs_name`) and send it as `by`. `cbs-guard` is a save-guard and loader, not auth.
  - Crew pages have no sign-in. The crew portal uses an HMAC-like token `<job>.<sha256(salt:job)[0:20]>`. Task checklists use a random 26-character per-task token stored on the item.
  - The TV uses one fixed link token.
- **Double-save protection:** `cbs-guard` (client: one write per tap) plus per-feature server guards (service sheet `tok`, PTM "already loaded", stock take "already decided", RFI and variation existence checks).
- **Numbering schemes (per job, max + 1, zero-padded):** `RFI-001`, `VAR-001`, `S01` (snags), `SS-01` (service sheets). Global: `BUG-001` / `FR-001`; `INC-YYMMDD-nnn`. PO numbers come from QuickBooks and must be unique.
- **History convention:** text lines `DD/MM/YYYY HH:MM - <event> by <name>` on most registers. Service sheets use a JSON array instead.
- **PDF generation (not one house engine yet):**
  - Most builders build PDFs **in the browser with jsPDF 2.5.1** (cdnjs): RFIs, variations, snags, support, scope (plus pdf-lib to merge attachments), programme Gantt, service sheets. The survey uses jsPDF 4.2.1.
  - Server-side PDFs are **hand-written PDF syntax** in Code nodes: incident record, sign-on stamp pages (incremental update on the existing PDF), and the induction register.
  - The service-sheet layout ("standard layout, as the Close-out report": orange bar, logo, sections, photo grid, sign-off, SafeContractor/CHAS footer) is the closest to the CLAUDE.md "one house PDF format". Build one shared server-side generator.
  - `cbs-pdf-out` exists only to open a PDF inline (blob downloads are blocked in the ServiceM8 app).
- **SharePoint** (Graph, single drive; tenant chelmsfordbuildingservices; n8n `microsoftOAuth2Api` credential). Layout under the drive root:
  - `CBS System/Operations/Jobs/Job N/<folder>/`, where folder is one of Surveys, Drawings, Estimate, Quotes, Documentation, RAMS, Subcontractor RAMS, Purchase orders, Permits, Photos, Handover, Scope, Tasks, Service Sheets, Site Surveys(/Photos), Other.
  - `CBS System/Operations/Enquiries/Job N/` (file names `Job N - <kind> - …`).
  - `CBS System/Operations/Purchase Orders/`, `…/Snagging/Job N/(Photos/)`, `…/Support/Photos/`, `…/Site Surveys/` (no-job surveys), `…/Office Tasks/<folder>/`.
  - `CBS System/H&S/Incidents/`, `CBS System/H&S/Incident Reports/`, `CBS System/H&S/Construction Phase Plans/Induction Registers/`.
  - Upload conventions: PUT `root:/path:/content`, with `conflictBehavior=replace` for documents and `rename` for photos. Store `webUrl` (and the item id when it is re-attached later).
  - Pages open SharePoint files through the proxy `/webhook/cbs-file?u=<webUrl>` (batch 1).
- **ServiceM8 sync pattern:**
  - Look up the job by number: `job.json?$filter=generated_job_id eq 'N'`, preferring `active=1`.
  - Hub documents are pushed to the job as attachments through the single `cbs-sm8-attach` service, which keeps one copy per document (same `attachment_source` = "CBS Operations Hub - <doc_key>", or the same name).
  - Photos come from ServiceM8 attachments (`/webhook/cbs-job-photo?u=<uuid>`), with Job File categories in cbs_photo_tags.
  - Schedule: `jobactivity` (active and `activity_was_scheduled`) gives crew and dates. "On site" always comes from ServiceM8, never from hub dates.
  - Statuses: Quote = Estimate; Work Order = Approved; Completed; plus folders (queues). The rebuild should use ServiceM8 webhooks rather than these polls.
- **Notifications:** everything goes through `POST /webhook/cbs-notify {event, job_no, message, link, sign?, pdf?}` (batch 1). Events seen in this batch:
  - Documents and sign-on: rams, cphsp, toolbox, prestart, ptm, signon, incident_reported, incident_report_saved.
  - Purchasing and stock: po_issued, po_received, ptm_loaded, ptm_short, stock_return, stocktake_submitted.
  - Plant: plant_faulty, plant_missing, plant_found.
  - Snags: snag_fixed, snags_pushed.
  - Team: check_pass, check_defect, accident, incident, request, tool, leave.
  - Hub notices (cbs_hub_notices) are also inserted directly (support_bug, support_feature).
- **Caching:** this batch doesn't use the `cbs_cache` table (it is used in batch 1: auto-job-files, document-saves, job-file, operations-backend). The heavy feeds here cache in n8n workflow static data instead: TV data (90 s fresh / 10 min stale), task feed requirements (45 s, 5 min per job) and pipeline (60 s). In the rebuild use Postgres views or a cache table rather than per-process memory.
- **Client UI debt to avoid:** RFIs, variations, snagging and the programme page use `alert/confirm/prompt` and remember the name in localStorage. CLAUDE.md forbids both (in-app prompts; office sign-in; pick a name per action on crew pages).
- **AI:** PO reading uses OpenRouter (Claude Haiku 4.5) with a strict JSON-only prompt; values not on the document are left blank.

## Secrets found (values deliberately not copied)
- Internal shared key for the register API and cbs-task-db, hard-coded (`K=` / `k=` in URLs):
  - programme.json: Act, Start Sync
  - quickbooks-sync.json: QBO Sync
  - rfis.json: RFI Act
  - scope.json: Scope Act
  - service-sheets.json: D Build
  - servicem8-job-lookup-attach.json: PTM Loaded, PO Receive, PO Finish, Incident Record Finish, Incident Report Finish, Sign Save
  - site-tasks.json: Site Task Act
  - snagging.json: Act, Push Finish
  - support.json: Act
  - task-checklist.json: Task Act
  - tasks.json: Tasks Act, DB Check (the comparison value), Crew Act
  - variations.json: Variation Act
  - yard.json: Act
  - (The same key is also in operations-backend.json `Route`, batch 1.)
- TV dashboard link token, hard-coded and also embedded in client JS/URLs:
  - tv-dashboard.json: Build Page, Build Dashboard Data, Build Settings Page, Check Save, Check Nudge, Cast Prep, Cast Nudge, Serve Castbar
  - pages.json: Keep View
- Crew job-portal token salt (secret string hashed with the job number to make crew links):
  - tasks.json: Crew Link, Crew Act, Crew Go, Crew Page
  - today-on-site.json: Today Data
- No API keys, passwords or OAuth tokens are embedded. ServiceM8, Microsoft Graph, QuickBooks and OpenRouter use n8n stored credentials (`serviceM8CredentialsApi`, `microsoftOAuth2Api`, QuickBooks node credential, `openRouterApi`), which are not in the exports.
- Not secret but sensitive: the SharePoint drive ID is hard-coded in many HTTP nodes; company registration and VAT numbers appear in the site survey page footer.
