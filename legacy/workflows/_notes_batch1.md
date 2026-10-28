# Legacy n8n workflows – rebuild notes (batch 1)

Reference notes for rebuilding each feature of the old n8n hub in Next.js + Supabase. Source: `legacy/workflows/<slug>.json` (read-only exports). All webhook paths are under `https://old-hub.example/webhook/`. "Internal key" means the shared key that `cbs-admin-save` accepts as `&k=` (value deliberately not copied; see **Secrets found**).

Common patterns used throughout (described once here, referred to below):
- **Pages** are HTML strings built in Code nodes and returned by `respondToWebhook`. Many later Code nodes then "patch" that HTML or JS with exact-once string replacements (`Xxx Inject` / `Xxx Patch` nodes). Treat the last patch as the current behaviour; earlier ones are history.
- **Registers**: almost every table is read through `GET cbs-admin-data?t=a,b,c` (Hub Data) and written through `POST cbs-admin-save?a=list|save|del&t=<reg>&id=N[&partial=1][&k=KEY]` (Operations Backend).
- **SharePoint upload**: Graph `PUT /drives/{CBS drive}/root:/<path>:/content?@microsoft.graph.conflictBehavior=replace|rename`, then the hub stores `webUrl` (and sometimes the item `id`).
- **Dirty flags**: after a save, a row `dirty:<register>[@<job>]` in `cbs_cache` gets `at=Date.now()`. The cached job page polls for these (see Cross-cutting › Caching).
- Times are `Europe/London`, and stamps are `YYYY-MM-DDTHH:MM` strings.

---

### CBS - Actions Feed (`actions-feed.json`, active yes)
- Purpose: a server-side copy of the hub's Actions board. Returns the open "cards" (New / In progress) that the TV dashboard and other callers show.
- Endpoints: `GET cbs-actions-data` → JSON list of cards `{s (section), t (register), id, bad, x (title), y (sub-line), status, dtitle, key, …}`.
- Tables: read `cbs_vehicles`. Everything else comes from `cbs-admin-data`, `cbs-tasks-data?all=1` and (as a fallback) `cbs-job-reqs-data`.
- Integrations: n8n webhooks only (`cbs-admin-data`, `cbs-tasks-data`, `cbs-job-reqs-data`).
- Business rules worth keeping (the `notes()` rules, copied from the hub page):
  - Incidents: Open with a reporter; notifiable but RIDDOR not recorded; corrective action overdue.
  - CoSHH review overdue. RAMS still Draft. RAMS issued but a linked hazard was updated afterwards.
  - Vehicles: tax, MOT or service due within 30 days or overdue. Vehicle check not reviewed, or a vehicle Off road. Vehicle accident not Closed.
  - Vehicle inspection per vehicle uses `insp_freq` (Weekly / Monthly / Quarterly / Not required; blank = Monthly, or Not required when `no_monthly=Yes`) and `insp_next`.
  - Assets: service or PAT test due within 30 days, or Needs repair. Subcontractor documents, insurance and training expiring within 60 days.
  - Requests with status New (urgent when urgency is Today). Time off Pending. Hazard review due within 30 days.
  - Insurance claims get one card per open claim, keyed `claims|<id>`. The card closes when the claim is Settled, Closed, Withdrawn or Declined.
  - Job and office tasks come from the task system: Done and Verified are left out. "In hand" is shown as In progress with its note.
  - Card status comes from `cbs_task_status` (key → status / note).
  - Display title drops the opening verb when the status already says it ("Approve RAMS – X" → "RAMS – X").

### CBS - Add-on Icons (`add-on-icons.json`, active yes)
- Purpose: serves the PNG icons for the ServiceM8 add-ons.
- Endpoints: `GET cbs-addon-icons?name=onsite|team|site-prep|survey|enquiry` → binary PNG (256×256), cached for 1 day. An unknown name falls back to `onsite`.
- Tables: none. Integrations: none (the icons are base64 in the code).
- Rebuild: static files in `/public`.

### CBS - Add-on Router (`add-on-router.json`, active yes)
- Purpose: the entry point from the ServiceM8 job add-on. Reads the job and its folder, then redirects to the right hub page.
- Endpoints: `GET cbs-addon?uuid=<sm8 job uuid>` → an HTML redirect, or a small "Job not found" / "nothing to prepare" page.
- Tables: read `cbs_jobs` (the `mode` decides whether a Job File exists).
- Integrations: ServiceM8 `GET job/{uuid}.json` and `GET queue.json` (polled at request time).
- Business rules (folder buckets, compared lower case against the folder name):
  - ENQUIRY = enquiry, estimated → `cbs-job-file?job=N#enquiry`.
  - JOBFILE = reactive (call-out), maintenance, approved, part approved, awaiting client, works completed, part invoiced → `cbs-job-file?job=N` (the `#enquiry` tab when there is no Job File yet).
  - BLOCKED = on hold, ss rsd inv qb → info page.
  - Unknown folder: open the Job File if one exists, otherwise show the info page.
  - "Has Job File" means `mode` is project, cdm or closed.

### CBS - Auto Job Files (`auto-job-files.json`, active yes)
- Purpose: keeps ServiceM8 folders stable and creates a hub Job File automatically for approved, reactive and maintenance jobs.
- Endpoints: no HTTP endpoints of its own.
  - Triggers: schedule every 5 minutes.
  - ServiceM8 webhook triggers (n8n ServiceM8 Trigger node): `job.created`, `job.updated`, `job.queued`, `job.status_changed`, `job.completed`, `company.created`, `company.updated`.
- Tables: writes `cbs_cache` `dirty:sm8[@job]` on every ServiceM8 event. Creates `cbs_jobs` rows indirectly via `POST cbs-cdm-set`.
- Integrations:
  - ServiceM8 `GET queue.json`, `GET job.json?$filter=status eq 'Work Order' and active eq 1`, `POST job/{uuid}.json` (`queue_uuid`, `queue_expiry_date`).
  - Calls `GET cbs-pipeline?fresh=1` and `POST cbs-cdm-set`.
- Business rules:
  - Folder keeper (every 5 minutes): for active Work Orders in Approved / Part Approved / Reactive / Maintenance, a folder expiry less than 60 days away is pushed out to one year from now.
  - A Work Order that lost its folder (ServiceM8 drops it when the job is scheduled or the expiry passes) is put back into its previous folder for a year. Previous folders are kept in workflow static data `folders{uuid:queue}`. At most 40 updates per run.
  - The webhook path does the same "restore" instantly. On `job.queued` into one of those folders it checks for a Job File.
  - Job File creator: any job in Approved, Part Approved, Reactive or Maintenance with no hub `mode` gets `cbs-cdm-set {job_no, mode:'project', create:true, by:'Auto: <folder> folder'}`. Existing, CDM and closed Job Files are never touched. Quote jobs are never filed.
- Rebuild: replace the polling with ServiceM8 webhooks into a Next.js API route. Keep the "restore folder" logic.

### CBS - Clients (`clients.json`, active yes)
- Purpose: the Clients page (People and companies › Clients) and the client/contact data feed used by New job. ServiceM8 is the master.
- Endpoints:
  - `GET cbs-newjob-data` → JSON `{clients[{uuid,name,address,…}], folders, people{client_uuid:[{id,name,role,phone,email}]}, …}`.
  - `GET cbs-client-people` → HTML page.
  - `POST cbs-client-people-act {a: client_save|client_new|contact_add|contact_save|contact_remove|remove, …}` → JSON.
- Tables: `cbs_client_contacts`. Read; upsert role / extra people; soft-delete (`active='0'`).
- Integrations: ServiceM8 `company.json` and `companycontact.json` (GET active rows, POST to create/update; a new uuid comes back in the `x-record-uuid` header), plus `job.json` and `queue.json`. Read live (polled).
- Business rules:
  - Every change is written to ServiceM8. The hub table only keeps each contact's `role` (matched by `sm8_uuid`) and people not yet in ServiceM8.
  - Only fields that are sent are written. Payment terms are never written.
  - The primary BILLING contact is the "accounts contact". Blank contacts that ServiceM8 creates automatically are hidden.
  - A contact deleted in ServiceM8 is also hidden in the hub.

### CBS - Clients to Job Files (one-off) (`clients-to-job-files-one-off.json`, active no)
- One-off, **drop**. `GET cbs-clients-import?dry=0|1` crawled an old SharePoint clients library and copied files into `CBS System/Operations/Jobs/Job N/<Estimate|RAMS|Purchase orders|Site Surveys|Drawings>`, guessing the category from the file name.

### CBS - Close-out (`close-out.json`, active yes)
- Purpose: closes a job out. Shows a checklist of open items, takes a reason when items are still open, sets the job Completed in ServiceM8, closes the hub Job File and saves a close-out report PDF.
- Endpoints:
  - `GET cbs-closeout?job=N[&close=1]` → HTML page.
  - `GET cbs-closeout-data?job=N[&nosf=1]` → JSON: open-items checklist, close-out record and the registers for the report (job, snags, variations, RFIs, programme, scope of works, costs).
  - `POST cbs-closeout-act {a:'close', job, by, reason, open[]}` → upserts `cbs_jobs.closeout_json`.
  - `POST cbs-closeout-pdf {job, by, b64}` → uploads the PDF and stores its link.
- Tables:
  - `cbs_jobs`: read via `cbs-admin-save?a=list&t=jobrows` (internal key); upsert `closeout_json`. `mode` is set to closed via `cbs-cdm-set`.
  - Data reads a range of registers through other webhooks.
- Integrations:
  - ServiceM8 via `POST cbs-enquiry-move {action:'complete'}`: status Completed, folder "Works completed", plus a note.
  - SharePoint: `PUT CBS System/Operations/Jobs/Job N/Close-out/Job N - Close-out report - YYYY-MM-DD.pdf` (replace).
  - The PDF is made in the browser with jsPDF 2.5.1 (house style).
- Business rules:
  - The name is required. A reason is required when anything is still open.
  - If ServiceM8 is not updated, nothing is closed. Pressing again finishes the close-out (an already-Completed job is fine).
  - The report includes a "Works completed" section from the scope of works.
- JSON `cbs_jobs.closeout_json`:
  `{closed_at, by, reason, open:[text], open_count, was_mode, sm8_completed, log:[{at,by,ev,reason?,open?}] (last 20), report_url, report_at, report_by, report_name}`.

### CBS - Combined PDF Downloads (`combined-pdf-downloads.json`, active yes)
- Purpose: a shared browser script that adds a "one combined PDF" option to every download pop-up (forms posted to `cbs-docs-zip`) and to site file / close-out pack links.
- Endpoints: `GET cbs-dlpdf` → JavaScript (loaded by `cbs-guard`).
- Tables: none. Integrations: client-side pdf-lib 1.17.1, which merges PDFs fetched through `cbs-file`.

### CBS - CoSHH (`coshh.json`, active yes)
- Purpose: the CoSHH assessment register and builder. Builds an assessment pack PDF (cover sheet + the SDS pages), links substances to jobs, and offers a per-job zip of packs.
- Endpoints:
  - `GET cbs-coshh[?job=N|?id=]` → HTML (view or job list).
  - `GET cbs-coshh-data[?id][&job]` → JSON `{items, row, links, job, on_job}`.
  - `POST cbs-coshh-save {id, version, fields, state, prev, by, pack{data}, sds{name,mime,data}}` → JSON row.
  - `POST cbs-coshh-job {action:'add'|'remove', job_no, ids[] | id, by}`.
  - `GET cbs-coshh-zip?job=N` → zip "Job N - CoSHH Assessments - date.zip".
  - Maintenance patch hooks, not needed in the rebuild: `cbs-coshh-hubpatch`, `cbs-coshh-builderpart`, `cbs-coshh-ramspatch`. They rewrite pages stored in `cbs_page_parts` (`page:cbs-admin`, `page:cbs-coshh-builder`, `page:cbs-rams-builder`).
- Tables:
  - `cbs_substances`: read, upsert.
  - `cbs_job_coshh`: read, insert, delete.
  - `cbs_jobs`: read.
  - `cbs_page_parts`: read logo and pages; write builder / patches.
- Integrations:
  - SharePoint: `CBS System/H&S/COSHH/<product>/<product> - COSHH Assessment vN - date.pdf` and `.../SDS/<date> - <name>` (rename on conflict).
  - Graph `shares/{u!base64}/driveItem/content` for the zip.
  - PDF is client-side: jsPDF + html2canvas + pdf-lib (merges the SDS pages) + pdf.js (SDS preview).
- Business rules:
  - The product name is required. The pack limit is 20 MB and the SDS limit is 15 MB.
  - `version` goes up each time a new pack is built.
  - Status: Draft / Assessed / "Assessed – edits not rebuilt".
  - Linking to a job skips duplicates.
  - The RAMS builder gets a CoSHH picker for its materials field.
  - Delete needs an in-app confirm (Del Guard).
- JSON `cbs_substances.assessment_json` = builder state: `{product, supplier, supplier_addr, hz[] (hazard pictograms), hz_other, process, ingredients, who_emp, who_oth, frequency, duration, risk, controls, ppe, fa (first aid), quantity, location, sds_date, assessed_by, assessed_on, review_on, notes, …}`.

### CBS - Daily Diary (`daily-diary.json`, active yes)
- Purpose: the daily diary per job. Builds each day automatically from the hub registers, adds weather, and lets the office write delays, instructions and notes. A day can be locked or unlocked. PDF export.
- Endpoints:
  - `GET cbs-diary?job=N` → HTML.
  - `GET cbs-diary-data?job=N[&from&to]` → JSON days.
  - `GET cbs-diary-data?due=1` → days in the last 14 days with site activity but no entry, per open job. Used by the Actions board and the requirements feed.
  - `POST cbs-diary-act {a:save|lock|unlock, job, day, by, …}`.
  - `POST cbs-diary-opt {op, value, by}` → delay-cause options.
- Tables:
  - `cbs_diary`: read, upsert on (job_no, day).
  - Read `cbs_visitors`, `cbs_inspections`, `cbs_permits`.
  - Other registers via `cbs-admin-data` / `cbs-admin-save?a=list` (prestarts, signons, toolbox, incidents, rams, cphsp, jobrows, progitems, pos, snags, variations, rfis).
  - `cbs_select_options` (reg=diary, field=delay_cause).
- Integrations: api.postcodes.io (postcode → lat/lon); Open-Meteo forecast API (last 90 days) and archive API (older). PDF via jsPDF (house style).
- Business rules:
  - The diary is CDM-only (enforced in the Job File and the requirement feed).
  - Save is refused on a locked day. Lock freezes the day's auto record and weather; unlock takes a reason.
  - Delay hours are rounded to 0.25.
  - Default delay causes: Weather, Client / access, Design or information, Materials late, Subcontractor, Plant breakdown, Other (seeded on the first change).
  - `history` is plain text lines: `dd/mm/yyyy hh:mm – what by who`.
- JSON:
  - `weather_json` = `{code, max, min, rain, wind, gust}` (Open-Meteo daily values).
  - `snapshot_json` = the frozen auto record for the day: `{brief[], signons[], visitors[], ticks[], planned[], started[], done[], deliveries[], hire[], snags[], vars[], rfis[], insp[], permits[], toolbox[], incidents[], people{}}`.

### CBS - Document Saves (`document-saves.json`, active yes) — SharePoint save pattern and H&S back end
- Purpose: one shared save pipeline for the builder documents, plus the endpoints for job mode (Project / CDM / closed), the CDM site file, permits, visitors, H&S policy / manual, pre-con info and notifications.
- **Builder save pattern** (`POST cbs-rams-save | cbs-cphsp-save | cbs-prestart-save | cbs-site-inspection-save | cbs-ptm-save | cbs-toolbox-save | cbs-team-meeting-save`):
  - Body: `{id, row{…}, pdf (base64 or data URL), filename, existing_pdf_url, folder?}`.
  - The `Config` map gives the table, SharePoint folder, doc key, default file name, default status and the allowed columns:

    | hook | table | folder (`CBS System/…`) | default status |
    |---|---|---|---|
    | rams | cbs_rams | H&S/RAMS | Issued |
    | cphsp | cbs_cphsp | H&S/Construction Phase Plans | Draft |
    | prestart | cbs_prestarts | H&S/Pre-starts | – |
    | site-inspection | cbs_inspections | H&S/Site Inspections | – |
    | ptm (load-up) | cbs_ptm_sheets | Operations/PTM Sheets | – |
    | toolbox | cbs_toolbox | H&S/Toolbox Talks (meetings → H&S/Team Meetings) | – |
    | team-meeting | cbs_toolbox (meeting_type = Team meeting) | H&S/Team Meetings | – |

  - Steps: upsert the row by `id` → PDF step → Graph PUT (replace) → write `pdf_url` back to the row → `POST cbs-sm8-attach {job_no, pdf_url, item_id, name, doc_key}` (attaches the PDF to the ServiceM8 job) → respond.
  - **Overwrite, don't add**: if the record already has a PDF in the same folder, the new version is saved over that file, so the name and link stay the same. Revisions overwrite too.
  - A new PTM sheet that is not yet loaded sends notify event `ptm_ready`.
- `POST cbs-cdm-set {job_no, mode: project|cdm|closed|enquiry, create?, by, since?}`:
  - Upserts `cbs_jobs` {ref, mode, cdm, cdm_since, cdm_by, project_since/by when create}.
  - `enquiry` = blank mode (reopen as an enquiry). Nothing is deleted.
  - Notify events: `job_project`, `cdm_on`, `cdm_off`, `job_closed`, `job_reopened`.
- `GET cbs-cdm?job=N` (site file status), `?a=pack` (zip of the site file), `?a=jobs` (list of jobs with documents):
  - The site file has 13 sections, each with a SharePoint-style folder name `N.0 <name>`: 1 Client Pre-Construction Information, 2 Construction Phase Plan, 3 Other Contractor RAMS, 4 Permits to Work, 5 Site Induction, 6 H&S Manual & Policies, 7 Visitors Log Daily, 8 COSHH, 9 Training & Certs, 10 Site Safety Inspection, 11 Toolbox Talks, 12 Incident Reports, 13 Close-out & Handover.
  - Sections 1–3, 5, 6 and 8–11 are marked required.
  - The pack zips the linked PDFs (Graph `shares/…/content`, n8n Compression node) plus generated index PDFs.
- Permits:
  - `GET cbs-permit-data`; `POST cbs-permit-act {action: raise|submit|approve|reject|handback|signoff|cancel, token|id, …}`.
  - Upsert `cbs_permits` keyed on `token`.
  - Number `PTW-<job>-NN`. A 28-character random `token` is the contractor's link.
  - Statuses: With contractor → Submitted → Approved (or Rejected) → Handed back → Closed. Cancelled at any point.
  - Only people named on the job's paperwork may approve, reject or sign off. Names are collected from the CPHSP state, RAMS prepared_by, pre-start site_lead and `cbs_jobs.pm`.
  - Cancel is allowed for the person who raised it or an approver. Valid to must be after valid from.
  - On approve and on sign-off a PDF is built server-side as hand-written raw PDF (Helvetica, orange 3 pt top rule, footer with page numbers). It is uploaded to `CBS System/H&S/Permits to Work/` and overwrites the same file on close.
  - Notify: `permit_raised`, `permit_submitted`, `permit_approved`, `permit_rejected`, `permit_handed_back`, `permit_closed`, `permit_cancelled`.
  - `state_json` = `{log:[{at,by,ev}], checklist{item:answer}, emergency, sub_sig, sub_at, sub_by, ap_sig, ap_conditions, hb{by,at,sig,checks,notes}, so_sig}` (signatures are data URLs).
- Visitors:
  - `GET cbs-visit-data`; `POST cbs-visit-act {action:'in'|'out', job_no, …}` → upsert `cbs_visitors` keyed on `vkey` (24-character random).
  - CDM jobs only. Duplicate sign-in on the same day returns the existing visit.
  - `inducted` = "Yes (on record)" when the name is in `cbs_signons`, otherwise "Yes (says so)" or "No". Notify `visitor_needs_induction`.
- H&S policy and manual:
  - `POST cbs-company-doc {kind: policy|manual, data(PDF), version}` → `CBS System/H&S/Policies/` and `cbs_hs_policy` upsert on (doc, version).
  - `GET cbs-hs-data`.
  - `POST cbs-hs-act {action: draft|issue, version, effective_on, review_due, state{paragraphs[]…}}`. Issuing builds a PDF to H&S/Policies. Only a hard-coded list of issuers may issue. An issue name cannot be re-issued. Notify `hs_policy_issued`.
  - `POST cbs-hs-accept` → inserts a `cbs_signons` row (someone signed the manual). Notify `manual_accepted`.
  - `cbs_hs_policy.state_json` = `{paragraphs[], …}`.
- Pre-construction information:
  - `GET cbs-pci-data`.
  - `POST cbs-pci-upload {job_no, category, title, file_name, data}` → `CBS System/H&S/Pre-Construction Info/<job>/<file>` (rename) and a `cbs_pci` insert. Limit 25 MB.
  - `POST cbs-pci-act {op: insert (link existing docs) | delete}`.
- Notifications:
  - `POST cbs-notify {event, job_no, message, link, pdf, sign}` replies straight away.
  - The rule comes from `cbs_notify_rules` (event, post_note Yes/No, tags). With `post_note=No` nothing happens.
  - With a job number: ServiceM8 `GET job.json?$filter=generated_job_id eq 'N'` → compose → `POST note.json` on the job → after 20 s `cbs-sm8-attach` attaches the PDF.
  - The note text is the message plus **one** crew-portal link `cbs-crew?t=<job>.<hash>&go=<item>` (rams-/cphsp-/prestart-/toolbox-/ptm-/prog-/snags) plus `@tags`. Office pages are never linked.
  - Without a job number: inserts a `cbs_hub_notices` row `{title (first sentence), message, event, link, pdf, sign, created_at, status:'Open'}`, shown on the Actions board.
- Other: `GET cbs-sm8-staff` → ServiceM8 `staff.json` list.
- Disabled hooks (drop or rebuild elsewhere): `cbs-po-save`, `cbs-po-receive` (stock), `cbs-ptm-loaded`, `cbs-incident-record`. They covered PO PDF to Operations/Purchase Orders, stock moves, and the incident PDF to H&S/Incidents.
- Tables written: the 7 builder tables, `cbs_jobs`, `cbs_permits`, `cbs_visitors`, `cbs_hs_policy`, `cbs_signons`, `cbs_pci`, `cbs_purchase_orders` (disabled path), `cbs_hub_notices` (via backend) and `cbs_cache` dirty flags. Reads `cbs_notify_rules`.
- JSON columns passed through from the builders (shape owned by the builder pages, not visible here): `cbs_rams.job_json`; `cbs_cphsp.state_json` (includes `insp:[[name,freq,…]]`, `comms:[[name,freq]]`); `cbs_prestarts.docs_json` / `state_json`; `cbs_inspections.state_json`; `cbs_toolbox.job_json`.
  - `cbs_ptm_sheets.items_json` = `{date, job_no, site, client, desc, crew[], vehicle, plant[], plantExtra, custom:[{kind,name,qty,unit,order,reviewed}], mats:[{id,qty}], ppe[], notes, prepared_by, status, due_back, loaded_by, loaded_at}`.
  - `cbs_ptm_sheets.loaded_json` = `{plant[], extra[], mats[], by, note}`.

### CBS - Drawings (`drawings.json`, active yes)
- Purpose: the drawings register per job (like Fieldwire).
  - Upload PDFs. A multi-page PDF is split into sheets, and the title block is read by AI.
  - Revisions and supersede. Tiles or list view, quick view. Pins (snags, RFIs, programme tasks, job tasks).
  - Markups and take-off (scale, length, area, count). Compare and export. Read-only share links for subcontractors.
- Endpoints:
  - `GET cbs-drawings?job=N[&d=ID]` → HTML. `GET cbs-drawings-data?job=N` → JSON.
  - `POST cbs-drawings-up` → SharePoint upload and a register row. `POST cbs-drawings-act {a: …}` (actions listed below).
  - `POST cbs-drw-db {k, op: list|insert|update|delete|delpins}` (internal CRUD, internal key in the body).
  - `GET cbs-drawings-view?j=JOB&t=TOKEN` and `GET cbs-drawings-view-data` → read-only subcontractor view.
  - `POST cbs-drawings-read` → AI title-block read.
- Tables: `cbs_drawings`. One table holds every kind of row: `kind` = drawing | pin | markup | scale | share. Columns: number, title, discipline, rev, status, file_url, drawing_id, supersedes, ref_type (snag/rfi/prog/jt…), ref_id, page, x, y, label, geo (JSON), tags, rot, history, doc_type.
- Integrations:
  - SharePoint `CBS System/Operations/Jobs/Job N/Drawings/<file>`.
  - OpenRouter chat completions, model `anthropic/claude-haiku-4.5`. The page sends crops of the title block and nearby PDF text; the model returns sheet number, title, revision, discipline and scale.
  - Client-side: pdf.js 3.11.174 (render), pdf-lib (split pages), jsPDF (export).
- Business rules:
  - Uploading a number that already exists offers "Add as new version" (supersedes and can copy pins).
  - Rotate only when the drawing has no pins or markups. Markups can be marked private.
  - Share link: Active / revoked, optional expiry (stored in `notes`), filtered by discipline / doc type, views logged in `history`, shows current revisions only.
- JSON: `geo` = markup geometry (array of points / shapes). `history` = text log.
- Actions (`cbs-drawings-act`): pin_add/move/del, dwg_edit/del/batch/del_many, scale_set/scale_many, share_add/revoke, mk_add/edit/del.

### CBS - Enquiry Prep (`enquiry-prep.json`, active yes)
- Purpose: the Jobs list (every ServiceM8 folder as a tile, search) and the enquiry checklist for a job (surveys, RFIs, documentation, quotes, estimate, programme). It also covers the stage moves Estimated / Approved / folder / status. It is embedded in the job page Enquiry tab (`embed=job`).
- Endpoints:
  - `GET cbs-pipeline[?chase=N&fresh=1]` → JSON for the Jobs list: `{ok, jobs[], others[], estimated[], fmap{job:folder}, sm8{job:status}, …}`. Each row has chips, `mode`, `enq` and move flags.
  - `GET cbs-jobs` → Jobs list page; `?job=N` redirects to the job page.
  - `GET cbs-enquiry` → old link, kept as an alias. `GET cbs-enquiry-addon` → old add-on link, redirects to `cbs-addon`.
  - `GET cbs-enquiry-lists` → people, subcontractors, suppliers. `GET cbs-enquiry-photos?job=N` → ServiceM8 photos with tags and programme phases.
  - `POST cbs-enquiry-save {job, enq{…}, newreg[]}` → upserts `cbs_jobs.enq_json`. New companies typed in are added to `cbs_subcontractors` as Supplier or Subcontractor.
  - `POST cbs-enquiry-upload {job, kind, filename, data}` → SharePoint `CBS System/Operations/Enquiries/Job N/Job N - <kind> - <name> <stamp>.<ext>` (any type, max 10 MB), then `cbs-sm8-attach`.
  - `POST cbs-enquiry-complete {job}` → Enquiry folder → Estimated.
  - `POST cbs-enquiry-approve {job, jobtype, by}` → Approved folder + Work Order, and creates the Job File.
  - `POST cbs-enquiry-move {job, action, note, by, folder?, status?}`.
- Tables: `cbs_jobs` (read; upsert `enq_json`, `moves_json`); `cbs_surveys` (read); `cbs_workers`, `cbs_subcontractors` (read / insert), `cbs_suppliers`; `cbs_photo_tags`; `cbs_page_parts` (`_pipe_bust` row, cache stamp).
- Integrations:
  - ServiceM8 `job.json` (by `generated_job_id`), `queue.json`, `company.json`, `attachment.json`, `POST job/{uuid}.json` (`queue_uuid`, `queue_expiry_date` = today + 14 days 17:00, status), `POST note.json`.
  - SharePoint upload. `cbs-cdm-set`, `cbs-programme-data`.
- Business rules:
  - **Complete enquiry stage**: only from the Enquiry folder. Every ticked requirement must be finished: survey Completed, RFIs (drawings) Complete, docs Complete, estimate Complete, programme Draft ready, supplier and subcontractor quotes All received. Then the job moves to Estimated.
  - **Approve**: allowed from Enquiry, Estimated, Approved or Part Approved. It sets the Approved folder and Work Order, and creates the Job File (`cbs-cdm-set create`) using the job's current type (Project unless CDM). It logs `moves_json {t:'approved', src:'hub'}`.
  - **Move** actions:
    - `complete`: Completed + Works completed folder (used by Close-out).
    - `setstatus`: Quote / Work Order / Completed / Unsuccessful, any to any, optional note.
    - `folder`: any folder, status unchanged.
    - `reopen`: Work Order + Approved, reason required.
    - `keep_back` / `undo approval`: back to Quote, out of Approved into Estimated, reason required, logged in `moves_json`.
    - Every move posts a ServiceM8 note "… – <by> via CBS Operations Hub".
  - **Move flags**: `back` = the job has a Job File but is now an enquiry or Quote. `approved` = ServiceM8 shows it approved but there is no Job File. Both prompt the person who opens the job.
  - The Jobs list caches the pipeline for 5 minutes (stamp = hub jobs and surveys count / last update + `_pipe_bust` + chase). Background refresh when older than 90 s.
  - Default folders switched on: Enquiry, Reactive (Call-Out), Maintenance, Approved (remembered per device, `cbs_jobs_sel`). No default requirements on enquiries.
- JSON:
  - `cbs_jobs.enq_json` = see Cross-cutting › enq_json.
  - `cbs_jobs.moves_json` = `[{t:'approved'|'back'|'approved_undone', src:'hub'|'sm8', by, at, note?}]` (last 30).

### CBS - Excel to ServiceM8 (Create Job) (`excel-to-servicem8-create-job.json`, active yes)
- Purpose: every 10 minutes, reads the client job workbook in SharePoint. Tabs: ZZ Client A, ZZ Client B, ZZ Client C, ZZ Client D, Others. Rows flagged "Create Job" in the column still labelled "Add to Fergus?" become ServiceM8 jobs, and the result is written back to the sheet.
- Endpoints: none (schedule).
- Tables: none.
- Integrations:
  - Graph Excel `workbook/worksheets('<tab>')/usedRange` (read) and `range(address=…)` PATCH (write back Status, ServiceM8 Job No, and a `=HYPERLINK("https://go.servicem8.com/openjob/<uuid>", "<no>")`).
  - ServiceM8 node: create job (`job_description`, `company_uuid`, `job_address`, `purchase_order_number` = the client's job number), read the job back, add a contact note.
- Business rules:
  - Headers are matched by alias per tab ("Job Number" / "Reference", "Site" / "Client", Area, Description, Originator).
  - Site → ServiceM8 client uuid, address and site contact come from a hard-coded MAP (tab||site), with tab defaults (ZZ Client C).
  - A blocked row gets "Missing info: …" or "Not mapped yet: …" written back.
- Rebuild note: this is how CBS client facility jobs enter ServiceM8, so it is still a ServiceM8-first flow. Keep it in n8n, or move the map to a table.

### CBS - Feature Probe (temp) (`feature-probe-temp.json`, active no)
- Temp test harness. It timed and fetched lists of hub webhooks. **Drop.**

### CBS - File Alerts (`file-alerts.json`, active yes)
- Purpose: when a file lands in a job's SharePoint folder that matches an open task (for example a survey report in Site Surveys), the task shows a "New file" badge. Nothing completes itself.
- Endpoints:
  - Schedule every 15 minutes, plus `POST cbs-file-alerts-scan` (runs a scan).
  - `GET cbs-file-alerts[?job=N]` → `{alerts:[{id,job,req,title,folder,n,u,at}]}`.
  - `POST cbs-file-alerts-act {a:'dismiss', ids[], by}`.
  - `GET cbs-file-alerts-ui` → JavaScript (badge and drawer note).
- Tables: `cbs_file_alerts` (read / insert / update status `open|seen|dismissed|cleared`).
- Integrations: `GET cbs-tasks-data` and `GET cbs-job-files?job=N` (SharePoint listing in another workflow).
- Business rules:
  - Folder → requirement map:
    - Site Surveys / Surveys → survey; Estimate → estimate; Quotes → supq, subq; Documents / Documentation → docs; RFIs / Drawings → drawings.
    - RAMS → rams, subrams; Subcontractor RAMS → subrams; Purchase Orders → pos, subpos, hire; Inspections → inspection, scaffold.
    - Permits → permits; CDM → cphsp, pci; Inductions → inductions; Toolbox Talks → toolbox; Programme → programme.
  - Only files uploaded in the last 14 days while the task is open raise an alert. Every other file is logged as seen. An alert clears when its task is done.

### CBS - Files (`files.json`, active yes)
- Purpose: the SharePoint file service: stream, preview, zip, delete, move and rename job files, plus a few register uploads.
- Endpoints:
  - `GET cbs-file?u=<sharepoint url>`: streams the file. When the browser asks for an image (`sec-fetch-dest: image`), it returns the 1600 px thumbnail instead.
  - `POST cbs-docs-zip {d:{job,label,files[{u,n,f}],gen[]…}}` → zip with generated index PDFs. The Combined PDF script turns this into one merged PDF.
  - `POST cbs-job-file-del {job, files[], by}`: deleted files go to the SharePoint recycle bin.
  - `POST cbs-job-file-move {job, files[], ids[], folder, by}`: moves into `Jobs/Job N/<folder>`, creating the folders; a name clash is renamed.
  - `POST cbs-job-file-rename {job, file, id, name, by}`: keeps the extension; 409 when the name is already used.
  - `POST cbs-vehicle-receipt` → `CBS System/Fleet/<REG>/Service History/<date> - Service - <workshop>.<ext>`.
  - `POST cbs-vehicle-folders` (no-op reply).
  - `POST cbs-training-upload` → `CBS System/H&S/Training/<person>/<qual - file>`.
  - `POST cbs-accreditation-upload` → `CBS System/Operations/Accreditations/<accreditation>/<date - file>`.
- Tables: none.
- Integrations: Microsoft Graph only (`shares/u!{base64url}/driveItem`, `drives/{id}/items/{id}`, PUT content, PATCH parentReference / name, DELETE).
- Business rules: delete, move and rename only work on items that Graph confirms sit under `CBS System/Operations/Jobs/Job N/…` or `…/Enquiries/Job N/…`. Only `chelmsfordbuildingservices(-my).sharepoint.com` links are accepted.

### CBS - Forms (`forms.json`, active yes)
- Purpose: crew forms opened from the ServiceM8 add-ons: plant pre-use checks and subcontractor H&S audits. The office has a records page and a template builder.
- Endpoints:
  - `GET cbs-forms?job=N[&f=<tkey>]` → crew page (no sign-in, no hub links).
  - `GET cbs-forms-data?job=N` → active templates, plant register (the job's load-up plant first), people, subcontractors, job info, recent records.
  - `POST cbs-forms-save {tkey, sid, pdf, checked_by, job_no, site, asset_id, asset_name, sub_company, outcome, fail_count, answers[], header{}, reported_to, notes}`.
  - `GET cbs-forms-records?job=N` → office page.
  - `POST cbs-forms-act {a:'release', id, by, note}`.
  - `GET cbs-form-templates` → builder page. `POST cbs-form-templates-save {t, by, note}`.
- Tables: `cbs_form_templates` (read / insert / update); `cbs_form_records` (read / insert / update); `cbs_page_parts` (`page:cbs-logo`).
- Integrations:
  - The PDF is built in the browser with jsPDF 4.2.1.
  - SharePoint: `CBS System/Operations/Jobs/Job N/Pre-use checks|Subcontractor audits/<date time> - <ref title> - <what> - <Pass|FAIL|n actions>.pdf`. Without a job it goes to `CBS System/Operations/<folder>/`. Rename on conflict.
  - Then `cbs-sm8-attach` (quiet), `cbs-notify`, `cbs-tasks-act` and `cbs-admin-save` (assets).
- Business rules:
  - Double-save guard: a submission id `sid` is stored in `history`; a repeat returns "Already saved".
  - A failed pre-use check sets the asset to "Needs repair" (note appended), sends notify `plant_faulty`, and creates an H&S task "Pre-use check failed: X – repair and release" with a checklist of the failed items plus "Released by a competent person" and "New pre-use check completed".
  - Release (competent person, note required, failed pre-use checks only) → asset back to "In service", notify `plant_found`.
  - An audit with failures creates a task "Sub-contractor audit: X – n actions" and sends notify `sub_audit`.
  - Template save: the name is required. The version goes x.y → x.(y+1) when the checks, header, intro or footer change. `tkey` comes from the title. Templates are retired, not deleted.
- JSON:
  - `header_json` (template) = `[{k,l,t: text|date|select|asset|sub, o[]?, req?, allow_hire?}]`.
  - `items_json` = `[{id,text,section?,show_if{field:[values]}}]`.
  - Template `history` = `[{at,by,v,note}]` (last 50).
  - Record `answers_json` = `[{id,text,section,v: y|n|na, why, photos}]`.
  - Record `header_json` = `{field: value, reported_to?, notes?}`.
  - `photos_json` = `{count}`.
  - Record `history` = `[{at,by,what,sid}]`.

### CBS - Hub Data (`hub-data.json`, active yes) — generic register read
- Purpose: one read endpoint for all the hub registers.
- Endpoints: `GET cbs-admin-data[?t=key1,key2]` → JSON `{key: rows[]}`. With no `t`, every register is returned. Unrequested tables are skipped with an `id < 0` filter trick.
- Tables (key → table):
  - workers→cbs_workers, incidents, toolbox (+ alias hsmeet), training, substances, rams, subbies→cbs_subcontractors, subdocs→cbs_sub_docs, insurance.
  - vehicles, checks→cbs_vehicle_checks, crashes→cbs_vehicle_accidents, assets, services→cbs_asset_services, requests, leave→cbs_time_off, vservices→cbs_vehicle_services.
  - taskstat→cbs_task_status, hazards, increports→cbs_incident_reports, materials, stockmoves, ptmsheets, claims, covertasks, companycerts, subjobs→cbs_sub_jobdocs.
  - cphsp, prestarts, hspolicy, notifyrules, suppliers, pos→cbs_purchase_orders, signatures, signons, notices→cbs_hub_notices, scaffinsp, tbtopics, ramstypes, cphspwording.
- Business rules:
  - `signons.signature` is stripped and replaced with `has_signature`.
  - **Signatures** are built from `cbs_workers.signature` (Team record, PNG data URL) for current staff. `cbs_signatures` is a backup only.
  - `workers.signature` is only included when `signatures` is also requested.
- Rebuild: Supabase queries per register. **No auth on this endpoint in the old hub.**

### CBS - Hub Inspect (temp) (`hub-inspect-temp.json`, active no)
- Temp maintenance tool. It baked CSS and JS patches into `cbs_page_parts` pages (with backups) and peeked at ServiceM8 data. **Drop.**

### CBS - Job Costing (`job-costing.json`, active yes)
- Purpose: job costing per job. Income (contract value + approved variations) against costs (uploaded bills, manual entries, QuickBooks) and committed spend (open POs not yet billed). Totals by category. AI reads uploaded bills.
- Endpoints:
  - `GET cbs-costs?job=N` → HTML. `GET cbs-costs-data?job=N` → JSON.
  - `POST cbs-cost-act {a: save|delete|opt, job, by, …}`.
  - `POST cbs-cost-read {data, mime}` → AI extraction of supplier, date, ref, net, VAT, gross and lines.
  - `POST cbs-cost-qbo-sync` → calls `cbs-qbo-run`.
- Tables (via `cbs-admin-save`, internal key): `cbs_job_costs`, `cbs_select_options` (reg=jobcosts, field=category / qbo_sync), plus reads of jobrows, variations and POs.
- Integrations:
  - SharePoint `CBS System/Operations/Jobs/Job N/Costs/<date supplier ref>.<ext>`.
  - OpenRouter `anthropic/claude-haiku-4.5`.
  - QuickBooks: sync via the `cbs-qbo-run` workflow (not connected yet; the result is stored as JSON in `selectopts` qbo_sync `{at, ok, message}`).
  - jsPDF export.
- Business rules:
  - Net amount, date and supplier-or-description are required. Money is rounded to pence.
  - Default categories: Materials, Plant hire, Subcontractors, Labour, Other.
  - QuickBooks rows (source=QuickBooks): only category, PO number and notes can be edited, and they cannot be deleted.
  - `qbo_po_id` on POs prevents double counting.
  - `history` is text lines.

### CBS - Job File (`job-file.json`, active yes) — the job page
- Purpose: **the one page per job** (`cbs-job-file?job=N`). It holds:
  - Header: title, address, client, folder pill, status pill, Project/CDM line with Convert, Open in ServiceM8, Copy crew link, Download all.
  - Stage strip (Estimate / Approved / Completed).
  - Notes (synced from ServiceM8 into the hub), Files card (SharePoint), job photos (ServiceM8, sorter / labels), Tasks panel (shared task drawer), "+ New task" picker.
  - Job records summary (lines per menu page, with status), close-out, dashboard preview, plant booking.
- Endpoints:
  - `GET cbs-job-file?job=N[&fresh=1][&embed=mini]` → HTML. Served from the `cbs_cache` copy when one exists; `fresh=1` rebuilds.
  - `GET cbs-job-file-fresh?job=N&at=T` → `{changed:[registers], at, v}` (the freshness check).
  - `GET cbs-job-photo?u=<attachment uuid>` → ServiceM8 `Attachment/{uuid}.file`.
  - `POST cbs-job-reqs {job, on[]}` → upserts `cbs_jobs.reqs_json`.
  - `POST cbs-job-reqs-data {fresh?, warm?}` → **the requirements feed** for all jobs: `{items[], links[], …}`. Read by the Actions board, TV, Tasks and File Alerts.
  - `POST cbs-job-upload {job, folder, filename, data, mime}` → SharePoint `CBS System/Operations/Jobs/Job N/<folder>/Job N - <folder> - <name> <yyyymmdd-hhmm>.<ext>` (any type, max 10 MB). Used by the Inspections and Toolbox pages.
  - `POST cbs-job-plant {job, action: book|return, ids[], by, out_with, due_back}` → updates `cbs_assets` yard fields. The Operations Backend then syncs the `cbs_job_plant` log.
  - `POST cbs-job-notes {job, notes}` → upserts `cbs_jobs.notes`.
  - `POST cbs-cphsp-freq {id, push[{k,n,f}]}` → merges inspection and toolbox frequencies into the CPHSP `state_json.insp` / `.comms`.
  - Schedule "JR Warm": cron `*/2 6-19 * * 1-6` → `POST cbs-job-reqs-data {fresh:1, warm:1}`.
- Tables:
  - Read: `cbs_jobs`, `cbs_inspections`, `cbs_permits`, `cbs_visitors`, `cbs_pci`, `cbs_job_plant`, `cbs_photo_tags`, `cbs_job_tasks`, `cbs_task_status` (Dismissed), `cbs_scope`, `cbs_job_coshh`, `cbs_snags`, `cbs_form_records`, `cbs_diary`, `cbs_job_costs`, `cbs_variations`, `cbs_incidents`, `cbs_service_sheets`.
  - Write: `cbs_jobs` (`reqs_json`, `notes`, `sm8_desc`), `cbs_cache` (jobreqs, `page:N`, `pagev:N`, `dirty:jobrows@N`), `cbs_load_log`.
- Integrations:
  - ServiceM8:
    - `job.json?$filter=generated_job_id eq 'N'` (the active job, or a deleted one when it is the only match).
    - Per job: `jobactivity.json` (job_uuid), `staff.json`, `attachment.json` (related_object_uuid, active).
    - For the feed: `jobactivity.json` (start_date > yesterday), `job.json` (status Work Order), `staff.json`.
    - AVIF / HEIF photos are relabelled `.jpg` for the filters.
  - SharePoint (upload). Many hub webhooks: `cbs-cdm`, `cbs-job-regs`, `cbs-programme-data`, `cbs-snags-data`, `cbs-diary-data?due=1`, `cbs-admin-save?a=list` (rfis, programmes, variations), `cbs-tasks-data`, `cbs-tasks-act`, `cbs-pipeline`, `cbs-enquiry-*`, `cbs-cdm-set`, `cbs-jobtask-done`, `cbs-site-task`, `cbs-crew-link`, `cbs-viewer`, `cbs-tasks-ui`.
- Business rules:
  - **Stage / mode**:
    - The stage strip follows the ServiceM8 status: Quote = Estimate (amber), Work Order = Approved (green), Completed or closed out in the hub = Completed (blue), Unsuccessful (red).
    - `cbs_jobs.mode` is '' (enquiry, no Job File), project, cdm or closed. A job with no type yet is shown as Project.
    - Convert to CDM / back to Project at any time uses `cbs-cdm-set`. Closed jobs show "Reopen as enquiry" (`mode enquiry`).
  - **Folder and status (from 22/10/2026)**: any folder from any folder, and any status (Estimate / Approved / Completed / Unsuccessful) from any status. An optional note goes through `cbs-enquiry-move` `folder` / `setstatus`. Setting a closed-out job back to Estimate or Approved reopens it in the hub.
  - **Estimate lock-out**: while the status pill shows Estimate, these are locked with a padlock and an "unlocks after approval" box:
    - Safety pages, Site pages, the Money and close pages, and the RAMS records line / RAMS actions.
    - Job-type tiles in "+ New task".
    - Not locked: Scope, Programme, Drawings, Pre-con info, RFIs and Variations (Plan group), and Job.
  - CDM-only: CPHSP, Permits, Site inductions, Visitors log, Daily diary, Site inspections. These are locked on Project jobs. Project jobs hide the permits and site inspection tiles unless records already exist.
  - **Requirements (reqs)**: `cbs_jobs.reqs_json = {"on":[keys]}`. Nothing is on by default and nothing is locked on ("Tick the usual" was removed).
    - Requirement tasks are keyed `jobreq:<job>:<key>`; enquiry ones `jobreq:<job>:enq_<key>`.
    - Inspections and toolbox talks are "scheduled" items, run from their own pages. They count as on only when something is scheduled. Due and overdue ones become tasks automatically. Frequencies can come from the CPHSP.
    - Dismissed roll-up tasks (`cbs_task_status` status Dismissed, note = reminder text) stay hidden until the text changes.
    - Generic jobs 10871 and 10885 are skipped.
  - **+ New task picker**:
    - Office tasks / On site tasks toggle; Other (one-off) at the top.
    - Groups: Estimate / Approved: Planning / Approved: on site / Completed, with the current stage marked "Now" (see the catalogue).
    - Multi-pick, then "Add N tasks". Enquiry types are saved with `POST cbs-jobtask-done {kind:'enqreqs'}`; job types with `POST cbs-job-reqs`; the task is then created via `cbs-tasks-act create`.
    - Planning extras: Reactive Estimate, Order Materials, Client PO (plain tasks).
    - On site types (Survey, Additional survey, Permits to work, Site inspection, Sub-contractor audit, Pre-use checks) create `cbs_job_tasks` with `data_json.onsite/form` via `POST cbs-site-task`.
  - Removing requirements is queued so that quick removals do not undo each other.
  - Saving a record never completes a task.
  - Notes: one-way sync from ServiceM8. Line 1 of the ServiceM8 description is the title. The rest goes into `cbs_jobs.notes`:
    - empty → copied in;
    - first time → added at the top as "From ServiceM8:";
    - changed → "Updated from ServiceM8 dd/mm/yyyy:" at the top.
    - `sm8_desc` holds the last copied text.
  - Task panel: three statuses (To do / In progress / Done). In hand = In progress with a note. One Save. The drawer is locked while saving.
  - Plant booking skips assets that are retired, lost, sold or disposed.
  - Files card: any file up to 10 MB. Move, rename and delete (recycle bin, in-app confirm). Download as zip or one PDF. "New file" badges from File Alerts.
  - Photos stay in ServiceM8. Labels go to `cbs_photo_tags` (phase from the programme by date taken, categories, caption).
- Requirements feed caching:
  - The result is kept in `cbs_cache` key `jobreqs` (`data` JSON, `at`, `busy_at`). Younger than 10 minutes → returned straight away.
  - A rebuild running (busy younger than 4 minutes) → the last result is returned.
  - A run claims the rebuild by writing `busy_at=time.execId`, waits 1.5 s, and only the token that is still there rebuilds.
  - Warmed every 2 minutes Mon–Sat 06:00–19:59.
- JSON:
  - `reqs_json` = `{on:[keys]}`.
  - Feed `items[]` = `{job, cdm, site, k, l, st: todo|done|wait|…, note, urg, link, al}`.
  - Feed `links[]` = `{job, req, id, hist?, rec{…}}`.
  - `cbs_job_tasks.data_json` = `{checklist:[{t,done,by?,at?}], checklist_old[], onsite?, form?, rec_id?}`.
  - `files_json` = `[{n,u,at,by}]`.
  - CPHSP `state_json.insp` = `[[name, freq, …]]`; `.comms` = `[[name, freq]]`.

### CBS - Job Inspections (`job-inspections.json`, active yes)
- Purpose: one page used twice. **Inspections** (req `scaffold`: scaffold, LOLER, excavation, temporary works, MEWP, hoist, fire, electrical, PAT, asbestos re-inspection, other) and **Toolbox talks** (req `toolbox`) for a job. Plan items with a frequency, upload the report or record, and the next due date rolls on.
- Endpoints:
  - `GET cbs-job-inspections?job=N` and `GET cbs-job-toolbox?job=N` → HTML.
  - `GET cbs-job-sched-data?job=N&k=scaffold|toolbox` → `{items, people, held, site}`.
- Tables: read `cbs_job_tasks` (job_no, req), `cbs_jobs`, `cbs_subcontractors`, `cbs_workers`, `cbs_toolbox`. Writes go through `cbs-admin-save t=jobtasks` and `cbs-job-upload`.
- Integrations: SharePoint via `cbs-job-upload` (folders "Inspections" / "Toolbox talks").
- Business rules:
  - CBS does not carry out inspections: the contractor does and sends a report.
  - Frequencies: One-off, Daily, Weekly, Fortnightly, Monthly, or every N days.
  - Inspection statuses: Not booked / Booked / Inspected / Re-inspection needed. Toolbox talk statuses: Not held / Booked / Held.
  - An upload marks the item done (`last_done` = today, `done_by`). The next due date follows the frequency.
  - "Carried out by" lists subcontractors; "Given by" lists workers.
  - Toolbox topics: a fixed list plus Other.
- JSON: `cbs_job_tasks.files_json` = `[{n,u,at,by}]`.

### CBS - Job Regs (`job-regs.json`, active yes)
- Purpose: the same output as `cbs-admin-data`, but only for one job's registers (plus the lookups). Keeps the Job File load small.
- Endpoints: `GET cbs-job-regs?job=N` → JSON `{rams, cphsp, prestarts, toolbox, hsmeet, signons, incidents, subjobs, pos, ptmsheets, scaffinsp, subbies, subdocs, assets, materials, suppliers, workers, stockmoves}`.
- Tables: read only. A loose `ilike '%job%'` filter is applied on the job registers; callers then match exactly.
- Rule: sign-on signatures are stripped.

### CBS - Job Safety Pages (`job-safety-pages.json`, active yes)
- Purpose: the job menu record pages, one shared layout. Each page lists the job's records with a status chip (r/a/g) and PDF buttons; the buttons open the existing builders with the job filled in.
  - Safety: RAMS (CBS + subcontractor), Pre-con info, CPHSP, Permits, Pre-starts, Sign-ons, Visitors, Incidents.
  - Site: Purchase orders, Plant, Materials.
- Endpoints:
  - `GET cbs-job-rams | cbs-job-permits | cbs-job-prestarts | cbs-job-signons | cbs-job-visitors | cbs-job-incidents | cbs-job-pos | cbs-job-plantlist | cbs-job-materials | cbs-job-pci | cbs-job-cphsp | cbs-job-cdm (legacy combined) ?job=N` → HTML.
  - `GET cbs-job-reg-data?job=N&k=<page>` → `{sections:[{title, empty, items:[{t, m[], st, c, pdfs[{n,u}]}]}]}`.
  - `k=summary` → one status line per menu page for the Job records card, plus `cdm`.
  - `k=plantlist` → also yard assets and the return ids.
- Tables: read `cbs_jobs`, `cbs_rams`, `cbs_sub_jobdocs`, `cbs_permits`, `cbs_prestarts`, `cbs_signons`, `cbs_visitors`, `cbs_incidents` (by `sm8_job`), `cbs_incident_reports`, `cbs_purchase_orders`, `cbs_job_plant`, `cbs_stock_moves`, `cbs_ptm_sheets`, `cbs_cphsp`, `cbs_pci`, `cbs_diary`, `cbs_rfis`, `cbs_drawings`, `cbs_variations`, `cbs_job_costs`, `cbs_assets`.
- Integrations: none (reads only). Plant booking from the Plant page posts `cbs-job-plant` (Job File).
- Business rules:
  - Colour: green for approved, live, complete, signed, issued, received, closed, held, returned, loaded, off-hired, delivered…; red for rejected, expired, overdue, missing, open, short…; amber otherwise.
  - PO type: `po_type` sub → Subcontractor, hire → Plant.

### CBS - Job Task Done (`job-task-done.json`, active yes)
- Purpose: a small action endpoint used by the Actions board and the job page to tick tasks and to save enquiry requirement choices and statuses.
- Endpoints: `POST cbs-jobtask-done {kind, …}`:
  - `new {label, notes, due, by}` → `cbs_job_tasks` row (req custom).
  - `jobtask {id, undo}` → status Done or blank, `done_by`, `done_at`.
  - `enq {job, tx, st: Done|Open|In hand, undo}` → updates `enq_json.tasks[].st`.
  - `enqreqs {job, reqs[]}` → `enq_json.reqs`. Allowed: survey, estimate, drawings, supq, subq, docs, programme.
  - `enqst {job, k: estimate|programme, val}` → `enq_json.st[k]`. Estimate: Not started / In progress / Ready for review / Complete. Programme: Not started / Draft in progress / Draft ready.
  - `clearenq {jobs[]}` → moves `enq_json.tasks` into `tasks_old`, after migration to task rows.
- Tables: `cbs_jobs` (read latest row by ref; update `enq_json`); `cbs_job_tasks` via `cbs-admin-save` (internal key).

### CBS - Look-ahead (`look-ahead.json`, active yes)
- Purpose: a browser script that adds a "Look-ahead" button to the Programme page. It builds an N-week look-ahead (from the Monday, optionally including weekends) from the page's programme data (`window.D.p.phases → tasks → subs`) and saves it as a PDF with jsPDF.
- Endpoints: `GET cbs-lookahead-ui` → JavaScript.
- Tables / integrations: none.

### CBS - Nav (`nav.json`, active yes) — left menu, sign-in, layout
- Purpose: the shared client-side shell, loaded on every page via `cbs-guard`:
  - the job left menu and the hub menu restyle;
  - header buttons, document viewer, one-scroll rule, global search placement;
  - the sign-in service and page, the people-picker service;
  - the job summary page, the logo, and the "new layout" script store.
- Endpoints:
  - `GET cbs-nav` → JavaScript (`cbsNav` job menu + `cbsUI` hub menu, then about 20 patch steps; see Cross-cutting › Job menu).
  - `GET cbs-auth-js` → JavaScript: sign-in guard and British-English spell check on text inputs.
  - `GET cbs-signin[?next=&switch=1&manage=1&out=1]` → sign-in page (pick name, then 4-digit PIN).
  - `POST cbs-signin-act {a: names|login|check|logout|manage|kill|resetpin}`.
  - `GET cbs-people-svc` → JavaScript `CBSPeople` (which names appear in each picker, from Team "Appears in" ticks).
  - `GET cbs-layout-js` → the new-layout script kept in workflow static data. `POST cbs-layout-patch {key, patches[{find,replace}], seed?, get?}` (internal key).
  - `GET cbs-hub-logo` → PNG. Scraped once a day from `img#cbsLogo` in the `cbs-admin` page and kept in static data.
  - `GET cbs-job-summary?job=N` → read-only summary page. `GET cbs-job-summary-data?job=N` → JSON, cached 2 minutes per job in static data.
- Tables: `cbs_signin` and `cbs_workers` via `cbs-admin-save` (internal key).
- Integrations (summary): ServiceM8 `job.json` (generated_job_id), `jobactivity.json` (job_uuid, active), `queue.json`; hub feeds `cbs-tasks-data`, `cbs-programme-data`, `cbs-job-reqs-data`, `cbs-job-files`.
- Business rules (sign-in):
  - Names offered: active Team members with `hub_signin` ticked. If nobody is ticked, everyone active.
  - The first sign-in sets the PIN (entered twice). PINs are stored only as SHA-256 of a fixed prefix + lower-case name + PIN.
  - A wrong PIN waits 900 ms. Sessions are 30 days with a random 40-character token. `last_seen` is updated at most hourly.
  - Signed-in people can see live sessions, kill a session, and reset someone's PIN (which also kills their sessions).
  - Browser: `localStorage.cbs_session = {token, name, at, chk}`, re-checked with the server at most every 10 minutes. Office pages redirect to sign-in when there is no session.
  - Inside a frame (ServiceM8 add-on) or with `?embed=` there is no sign-in.
  - Crew pages never ask: sign-on, yard, forms, crew snags / scope, task checklists, load-ups, team, visitors, TV.
  - `localStorage` reads of `cbs_me` / `cbs_name` are overridden to return the signed-in name, so every save is stamped with it.
  - The name chip sits top right with Switch user, Manage sign-ins and Sign out.
- JSON: `cbs_signin` rows are `kind` `pin` (name, pin_hash) or `session` (name, token, device, created_at, last_seen), with `active` '1' or '0'.

### CBS - Nearest Hospital (`nearest-hospital.json`, active yes)
- Purpose: finds the nearest A&E hospitals to a site address (for RAMS, CPHSP and pre-start).
- Endpoints: `GET cbs-nearest-hospital?q=<address>` → JSON list (name, miles, address, directions link).
- Integrations:
  - postcodes.io (postcode, then outcode), then Nominatim (OSM) as a fallback.
  - Overpass API: `amenity=hospital` and `emergency=yes` within a radius, with 4 mirror URLs.
  - Haversine distance in miles. Google Maps directions link.
- Tables: none.

### CBS - Notify Test (temp) (`notify-test-temp.json`, active no)
- Temp: posted a test `cbs-notify` (with and without a job). **Drop.**

### CBS - Operations Backend (`operations-backend.json`, active yes) — generic register CRUD
- Purpose: the single write path (and a list path) for every register.
- Endpoints: `POST cbs-admin-save?a=list|save|del&t=<key>&id=N[&partial=1][&k=internal]`, body = the row. Replies: list → rows[]; save → saved row; del → ok.
- Tables: the Hub Data keys plus photos, jobplant, selectopts, snags, programmes, progitems, phototags, jobtasks, support, variations, rfis, jobrows (`cbs_jobs`), jobcosts, scope, surveys, signin, tbtopics, ramstypes, cphspwording. Every save also writes `cbs_cache` `dirty:<t>[@job]`.
- Business rules (permissions without the internal key):
  - `signin` is private.
  - Not saveable here: `taskstat`, `increports` ("own builder"); new `signons` and new `notices`.
  - Changes only via their own workflows: `jobplant`, `snags`, `programmes` / `progitems`, `support`, `variations`, `rfis`, `jobrows`, `jobcosts`, `scope`.
  - `surveys` are never written here.
  - `cphspwording` rows can be edited but not added or deleted.
- Column whitelists:
  - `Clean Row` has a COLS list per table. Boolean fields are coerced.
  - `Internal Fields` adds extra columns (some only with the key). Number columns are coerced; blank becomes null.
  - `partial=1` writes only the keys that are sent.
- Side effects:
  - Saving an asset syncs `cbs_job_plant`: closes open log rows when the job changes, and opens a row when `out_job` is set.
  - Deleting a sign-on calls `cbs-sign-restamp` (re-stamps the signed PDF).
  - A new stock move fills `job_no` and `location`.
  - `cbs_workers` gets flags `site_lead`, `hub_signin`, `in_*` ("Appears in" pickers: crew, tasks, rams, coshh, cphsp, checks, toolbox, permits, incidents, po, survey, diary, docs, director, sm8, service) and `signature` (PNG/JPEG data URL under 400 KB).
- JSON columns accepted (shape owned by each feature):
  - `cbs_scope.scope_json` / `history`.
  - `cbs_snags.before_json` / `after_json` / `history`.
  - `cbs_programmes.undo_json` / `history`; `cbs_prog_items.checklist_json`.
  - `cbs_job_tasks.files_json` / `data_json`.
  - `cbs_variations` / `cbs_rfis` / `cbs_job_costs` `files_json`, `history`.
  - `cbs_incident_reports.report_json`; `cbs_ptm_sheets.loaded_json`.
  - `cbs_insurance.cover_json`; `docs_json` on training, company certs and sub job docs.
  - `cbs_rams_types.tpl` = `{activity, taskShort, scope, plant, materials, hazards, ppe, permits, steps, openIdx, ct}`.

### CBS - Page Patch (temp) (`page-patch-temp.json`, active no)
- Temp: find/replace patcher for pages stored in `cbs_page_parts`, with a backup row and a dry run. **Drop.**

---

## Cross-cutting

### Sign-in / session design (old)
- Name + 4-digit PIN for office pages only. State is in `cbs_signin` (pin and session rows) behind the internal key. The 30-day token is in browser `localStorage`, re-checked at most every 10 minutes.
- Names come from `cbs_workers.hub_signin`. The name is stamped on saves by overriding the `cbs_me` / `cbs_name` localStorage reads.
- No sign-in in frames (ServiceM8 add-on) or on crew pages.
- Rebuild:
  - Keep the PIN hash (use a per-user salt, a slow hash and rate limiting).
  - Use an httpOnly cookie instead of localStorage, and stamp `by` server-side.
  - The old API had **no server-side auth**: `cbs-admin-data` and `cbs-admin-save` are open apart from the internal-key checks.
- Crew links use a deterministic token `<job>.<sha256(salt:job)[:20]>` (see Secrets).

### ServiceM8 job data flow
- **Webhooks** (Auto Job Files, n8n ServiceM8 Trigger): job.created / updated / queued / status_changed / completed and company.created / updated. Used to restore folders, create Job Files and mark `dirty:sm8@job`.
- **Polling / live reads** (most pages read ServiceM8 at request time):
  - `job.json` filtered by `generated_job_id` (the hub job number), by status Work Order, or by active.
  - `queue.json` (folder names).
  - `jobactivity.json` (schedule: who / when, `start_date`, `end_date`, `staff_uuid`, `activity_was_scheduled`).
  - `staff.json` (`first`, `last`).
  - `attachment.json` + `Attachment/{uuid}.file` (photos).
  - `company.json` / `companycontact.json` (clients).
- Job fields used: `uuid`, `generated_job_id`, `status` (Quote / Work Order / Completed / Unsuccessful), `queue_uuid`, `queue_expiry_date`, `job_description` (line 1 = title), `job_address` (first line = site), `company_uuid`, `job_is_scheduled_until_stamp` (booked), `purchase_order_number`, `total_invoice_amount`, `billing_address`, `active`.
- Writes:
  - `POST job/{uuid}.json` (`status`, `queue_uuid`, `queue_expiry_date`).
  - `POST note.json` (notes and notifications).
  - `cbs-sm8-attach` (another workflow) attaches SharePoint PDFs to the job.
- Folder names relied on: Enquiry, Estimated, Approved, Part Approved, Reactive (Call-Out), Maintenance, Awaiting client, Works completed, Part invoiced, On hold, SS RSD INV QB.
- Generic or general jobs to ignore: 10871, 10885. The test job is 99901.

### SharePoint folder layout (drive "CBS System", tenant chelmsfordbuildingservices)
- `CBS System/Operations/Jobs/Job N/<category>/`. Categories seen: Site Surveys, Estimate, Quotes, Documents / Documentation, RFIs, Drawings, RAMS, Subcontractor RAMS, Purchase Orders, Inspections, Toolbox talks, Permits, CDM, Inductions, Programme, Costs, Close-out, Pre-use checks, Subcontractor audits.
- `CBS System/Operations/Enquiries/Job N/` (enquiry uploads), `…/Operations/PTM Sheets`, `…/Operations/Purchase Orders`, `…/Operations/Accreditations/<name>`, `…/Operations/Pre-use checks|Subcontractor audits` (no-job forms).
- `CBS System/H&S/`: RAMS, Construction Phase Plans, Pre-starts, Site Inspections, Toolbox Talks, Team Meetings, Permits to Work, Policies, Incidents, `Pre-Construction Info/<job>`, `COSHH/<product>[/SDS]`, `Training/<person>`.
- `CBS System/Fleet/<REG>/Service History`.
- Naming: `Job N - <folder> - <original> <yyyymmdd-hhmm>.<ext>` for uploads. Builder PDFs overwrite their own file (conflictBehavior=replace). Other uploads use `rename`.
- The CDM site file is a virtual 13-section index (`N.0 <name>`) built from the registers, not real folders.
- Graph uses delegated `microsoftOAuth2Api` credentials. Files show "created by" the account that uploads (ZZ Person A), so the uploader name is not shown.

### House PDF format (as built today, client-side jsPDF 2.5.1)
- A4 portrait, mm units, 14 mm margins.
- Orange (#F47920 / rgb 244,121,32) bar 3 mm high across the top. Logo top-left at 13 mm high (max 48 mm wide), from `cbs-programme-logo`.
- Title in Helvetica bold 15 pt, "<Doc> – Job N". Sub-line grey 9 pt "site | client".
- Section headings 12.5 pt bold with an orange 0.6 mm underline. Tables have an orange header row with white 8.5 pt bold text, then 8.5 pt rows.
- Footer 7.5 pt grey: "Chelmsford Building Services Ltd | Job N <doc>" on the left, "Page i of n" on the right.
- Used by Close-out, Daily diary, Job costing, Look-ahead and Forms (jsPDF 4.2.1).
- Exceptions:
  - Permits and H&S policy are built server-side as hand-written raw PDF (Helvetica, orange top rule, footer).
  - CoSHH uses html2canvas + pdf-lib.
  - Zips and combined PDFs use pdf-lib.
- Rebuild: one shared server-side house PDF module.

### Notifications
- One entry point: `POST cbs-notify {event, job_no, message, link, pdf, sign}`. Rules are in `cbs_notify_rules` (event, label, post_note Yes/No, tags = ServiceM8 staff to @mention).
- With a job: a ServiceM8 job note for the crew, with one crew-portal deep link and the PDF attached.
- Without a job: a `cbs_hub_notices` card on the Actions board.
- Events seen: permit_raised, permit_submitted, permit_approved, permit_rejected, permit_handed_back, permit_closed, permit_cancelled; job_project, cdm_on, cdm_off, job_closed, job_reopened; visitor_needs_induction; hs_policy_issued; manual_accepted; po_issued; po_received; ptm_ready; ptm_loaded; incident_reported; plant_faulty; plant_found; sub_audit; rams_saved; cphsp_saved; test_notification.
- No email or SMS anywhere.

### Caching
- **`cbs_cache`** (columns key, data, at, v, busy_at):
  - `jobreqs`: requirements feed result + rebuild lock.
  - `page:<job>`: finished job page HTML. `pagev:<job>`: save time + fingerprint. Rows starting `page` and older than 3 days are pruned.
  - `dirty:<register>[@<job>]`: change stamps written by Operations Backend, Document Saves, Job File and Auto Job Files.
  - The job page is served from `page:N` straight away. A CBSFRESH script then calls `cbs-job-file-fresh?at=` and rebuilds in the background (`fresh=1`) if a relevant register changed. Ignored registers: signin, support, notices, leave, requests, crashes, checks, vservices, covertasks, claims, tbtopics, ramstypes, cphspwording, selectopts.
- **`cbs_load_log`** (at, job, mode = cache | build | rebuild, ms): timing per job page load.
- Workflow static data was also used as a cache: the pipeline (5 minutes), job summary (2 minutes), the logo (1 day), the layout script, and the folder map.
- Rebuild: mostly unnecessary with Postgres. Keep a short-lived cache only for ServiceM8 reads.

### Job menu (left menu inside a job, final state after patches)
- Job · Summary.
- **Plan**: Scope of works, Programme, Drawings, Pre-con info, RFIs, Variations.
- **Safety**: RAMS, CPHSP, Permits, Pre-starts, Inspections, Toolbox talks, Sign-ons, Visitors, Incidents, CoSHH.
- **Site**: Daily diary, Purchase orders, Plant, Materials, Load-up, Snagging.
- **Money and close**: Job costing, Service sheets, Close-out.
- Locked at Estimate (padlock, "opens once the job is Approved"): diary, variations, RFIs, costs, snags, CoSHH, close-out, inspections, toolbox, RAMS, CPHSP, permits, pre-starts, sign-ons, visitors, incidents, POs, plant, materials, load-up, service sheets.
  - Note the old code locks RFIs and Variations, although the Plan group otherwise stays open.
- The stage comes from the page's status pill, or `cbs-tasks-data` jobs[job].stage.
- Builders opened with `?job=N` keep the menu and highlight their item.
- Layout: 250 px fixed menu at ≥1200 px. Below that, an orange edge tab or swipe opens a drawer.
- The hub menu sections are Jobs, Health and safety, Safety documents, Assets, People and companies, Settings.
- Global search is in the layout script (`cbs-layout-js`, kept in static data, so it is not in the export). Results show in `#cbsGR` under the search box.

### Requirements catalogue (keys)
Stage groups below are from the "+ New task" picker. **e:** = enquiry requirement (saved in `enq_json.reqs`); **j:** = job requirement (saved in `reqs_json.on`).

| key | label | where | stage | notes |
|---|---|---|---|---|
| survey | Site survey (e) / Additional surveys (j) | e + j | Estimate (e) / Approved: Planning (j) | items: survey types; statuses Not booked → Booked → Completed |
| pci | Pre-construction information | j | Estimate | every job, gathered at enquiry; not locked at Estimate |
| drawings | RFIs (info from client) | e + j | Estimate | statuses Not sent / Sent / (Chased) / Answered |
| docs | Documentation (we supply) | e + j | Estimate | types Plans / Design / Method statement / Other; Not started / In progress / Issued to client |
| supq | Supplier quotes | e | Estimate | Requested / Part received / All received |
| subq | Subcontractor quotes | e | Estimate | as supq |
| estimate | Estimate | e | Estimate | Not started / In progress / Ready for review / Complete |
| programme | Programme | e + j | Estimate | Not started / Draft in progress / Draft ready |
| po (e) / clientpo (j) | Client PO | e / plain task | Estimate / Planning | clientpo is a Planning extra |
| rmest, ordermat | Reactive Estimate, Order Materials | plain tasks | Approved: Planning | Planning extras |
| scope | Scope of works | j | Approved: Planning | done when a scope is written |
| cphsp | Construction phase plan | j | Planning | CDM only |
| rams | CBS RAMS | j | Planning | locked until Approved |
| subrams | Subcontractor RAMS | j | Planning | Not requested → Requested → Received → Approved / Rejected |
| coshh | CoSHH | j | Planning | done when a CoSHH is linked to the job |
| pos | Supplier POs | j | Planning | QuickBooks PO upload |
| subpos | Subcontractor POs | j | Planning | |
| hire | Hire plant | j | Planning | Not booked / Booked / On hire / Off hired |
| ptm (alias plant) | Load-up (plant & materials) | j | Planning | load-up sheets |
| toolbox | Toolbox talks | j (scheduled) | Approved: on site | frequency-driven |
| meetings | Site meetings | j | on site | meeting in the last 7 days |
| scaffold | Inspections | j (scheduled) | on site | any inspection type; frequency-driven |
| inspection | Site inspection | j | on site | CDM (CPHSP frequency) |
| permits | Permits to work | j | on site | CDM only |
| inductions | Site inductions | j | on site | CDM only |
| prestart | Daily pre-start | j | (not mapped in the picker → "More") | daily; no longer locked on |
| preuse | Plant pre-use checks | j | on site | check in the last 7 days and the latest passed |
| audit | Subcontractor H&S audit | j | on site | |
| diary | Daily diary | j | on site | CDM only; today's entry on weekdays |
| visitors | Visitors log | j | on site | CDM only |
| snagging | Snagging | j | Completed | N of M signed off |
| costing | Job costing | j | Completed | bills logged |
| service | Service sheet | j | Completed | service sheet PDF saved |
| closeout | Close-out | j | Completed | open until closed out |
| (auto) incidents, variations | – | automatic on every job | – | open incidents; variations not agreed |

Task keys: `jobreq:<job>:<key>` and `jobreq:<job>:enq_<key>`. Item rows live in `cbs_job_tasks` (`req` = key, `kind` item|custom).

### enq_json shape (`cbs_jobs.enq_json`)
`{reqs:[survey|drawings|docs|estimate|supq|subq|programme], jobtype:'Project'|'CDM'|'', st:{estimate, programme}, surveys:[{d, src:'CBS'|'Specialist contractor', who, due, st:'Not booked'|'Booked'|'Completed', files:[{n,u,i}], rid}], dwg:[{d, src:'Client'|'CBS'|'Third party', st:'Not sent'|'Sent'|'Answered', date, due, nt, files, who, rid}], docs:[{tp, d, who, due, st, files, rid}], estimate:{by, due, files}, quotes:[{supplier, who, due, rid, for, requested_on, received_on, amount, status:'Accepted'|'Declined'|'', files}], subquotes:[{company, …same}], tasks:[{tx, st:'Open'|'In hand'|'Done'}], tasks_old:[…], next, notes, updated_at}`.
- `files[].i` is the SharePoint item id. `rid` is a permanent row id.
- Legacy single `survey` / `drawings` objects are upgraded on read.

---

## Secrets found (values not copied)
- **Shared internal key** (`cbs-int-…`, the `k=` for `cbs-admin-save`, `cbs-drw-db` and `cbs-layout-patch`), hard-coded in Code nodes:
  - close-out.json: Close-out Data, Close-out Act, Store Report Link.
  - daily-diary.json: Diary Data, Diary Opt.
  - document-saves.json: Plan N, Stock Calc.
  - drawings.json: Drawings Data, Drawing Record, Drawings Act, DB Check, View Data.
  - job-costing.json: Cost Prep, Cost Save, QBO Sync.
  - job-file.json: Plant Save.
  - job-task-done.json: Apply.
  - nav.json: Signin Act, Layout Patch.
  - operations-backend.json: Route (the check itself), Plant Log Sync.
- **Crew-link token salt** (fixed string hashed with the job number to make `cbs-crew?t=` links): document-saves.json › Compose N.
- **PIN hash prefix / salt** (fixed string in the PIN SHA-256): nav.json › Signin Act.
- No API keys or passwords appear in parameters. ServiceM8, Microsoft Graph and OpenRouter use n8n stored credentials (`serviceM8CredentialsApi`, `microsoftOAuth2Api`, `openRouterApi`).
- Not secret, but hard-coded identifiers worth moving to config:
  - the SharePoint drive id (in every Graph URL) and the Excel workbook item id (Excel to ServiceM8);
  - ServiceM8 client uuids (Excel to ServiceM8 MAP);
  - the H&S policy issuer name list (Document Saves › HS Act).
