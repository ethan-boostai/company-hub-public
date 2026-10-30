# /legacy: the old n8n hub (reference only)

Snapshot of the original CBS Operations Hub as it ran on n8n (https://old-hub.example), taken on 28/10/2026 and refreshed from live on 30/10/2026 (workflows, pages, table columns). **Read it, never run it.** Nothing in here is used by the new app; it is excluded from lint and typecheck.

Production n8n workflows are not changed from this repo (see `CLAUDE.md`).

## Contents

| Folder | What | How it was captured |
|---|---|---|
| `workflows/` | All 67 "CBS - …" workflows (refreshed 30/10) as n8n JSON (nodes, code, connections). File name = workflow name without "CBS - ", e.g. `job-file.json`. | n8n MCP `get_workflow_details` (read-only). |
| `workflows/_index_batch1.tsv`, `_index_batch2.tsv` | One line per workflow: id, name, active, file, webhook paths, data tables (by n8n id), external hosts (HTTP Request nodes only, so incomplete). | Script over the JSON. |
| `workflows/_notes_batch1.md`, `_notes_batch2.md` | Plain-English notes per workflow: purpose, endpoints, tables, integrations, business rules, shapes of the JSON columns. | Written from reading the workflow code. |
| `pages/` | Page HTML/JS that the old hub stored in the `cbs_page_parts` data table (served by "CBS - Pages", "CBS - Yard" and others). `_index.md` lists each part and where it came from. Pages built inside Code nodes are in the workflow JSON instead. | 30/10: fetched from the live page URLs (GET only), then the faking map. Before that: n8n execution data. |
| `tables/` | One file per `cbs_` data table: columns and up to 3 sample rows. `_all_tables.json` lists all 75 tables with their n8n ids and columns. Columns refreshed 30/10 (no new rows read; the faked sample rows are from 28/10). | Read-only runs of "CBS - Hub Data" and the "list" action of "CBS - Operations Backend", plus past execution data. |

## Redactions

- Signatures, images, PIN hashes and tokens in sample rows are replaced with `[redacted]`; `data:` URIs with `[data-uri redacted]`.
- Hard-coded secrets are replaced: the internal shared key (`[redacted-internal-key]`), the TV link token and crew-link salt (`[redacted-secret]`), and the PIN-hash prefix (`[redacted-salt]`).
- The 30/10 refresh redacted the same hard-coded secrets wherever they appear (pages included), plus one hard-coded token in the Page Patcher workflow.
- No n8n credentials are included (the export does not contain them).
- Real contact details are replaced with fake ones everywhere in `/legacy`: emails become `contactN@example.com`, phone numbers use Ofcom's fictional ranges (`07700 900nnn`, `0117 496 0nnn`), postcodes become `ZZ99 nZZ`, and street names become "Sample …". The same real value always maps to the same fake value.
- **Everything in `/legacy` uses fake people, clients and companies** (30/10/2026, before the repo went public): staff `ZZ Person A`…, client contacts `ZZ Client Contact A`…, the H&S adviser's contact `ZZ Adviser Contact`, clients and sites `ZZ Client A - Site 1`…, the hard-coded subcontractor and supplier lists `ZZ Subcontractor N` / `ZZ Supplier N`, van registrations `ZZ01ZZA`…, and the SharePoint drive id `b!ZZ-example-drive-id`. The old hub's n8n address is `https://old-hub.example`. Product brands, public suppliers named in examples (e.g. Jewson), the H&S adviser firm and CBS's own name are kept.
- **`tables/` sample rows** (30/10/2026): people (`ZZ Person A`…, client contacts `ZZ Client Contact A`…), clients and sites (`ZZ Client A - Site 1`…), subcontractors, suppliers and insurers (`ZZ Barriers`, `ZZ Insurer A`…), towns (`Sampletown A`…), policy, licence, certificate, order and invoice numbers (`ZZ-POL-0001`, `ZZ-LIC-0003`…), van registrations (`ZZ01ZZA`…), SharePoint links (`https://example.sharepoint.com/Shared%20Documents/ZZ%20Test/file-N.<ext>`) and SharePoint item ids (`01ZZZZZZ…`). Columns, row counts and the shape of JSON-in-text columns are unchanged. CBS's own name and product brands (Sika, Zinsser and so on) are kept.
- Public helplines and public offices are left real on purpose, because they appear in safety documents: HSE RIDDOR line and HSE London office, NHS 111, gas emergency, Environment Agency hotline, FRANK, the Lighthouse charity, and the hospital A&E address used by the nearest-hospital helper.

## Changes on the live hub since 27/10 (found in the 30/10 refresh)

| Where | What changed |
|---|---|
| Actions Feed (workflow) | New "Plant overdue back" auto cards: one per job (or person / van when there's no job) for plant past its due-back date and still out. Replaces the old per-item "Not back in the yard" notes. |
| Plant Return (new workflow, `POST cbs-plant-act`) | Actions for those cards: Back in yard (clears job, person and due date, status In, location warehouse), Extend (new due date), Move (to a job or a van, with a new due date). |
| Tasks (workflow: Actions drawer and crew portal) | "Plant Back UI": the plant overdue card's drawer lists the items with Back in yard / Extend / Move. "Crew PreUse": pre-use check tiles (Tower, Ladders, MEWP, Breaker and any form template of kind pre-use) on the crew portal's To do tab. "Crew Docs PDF": the crew portal's Job info opens with a Plans card (Scope of works and Programme as PDFs, built in the browser) instead of the long inline scope and 2-week programme. |
| Yard (workflow) | "Found clears job": marking plant Found at the warehouse or yard also clears the job, person and due date and sets it In. |
| Job File (workflow) | "Book in Job": a fourth Office tile under Approved: Planning in + New task (one open task, no duplicates). Small changes to the first frame, the regs cache and the TV cast button. `cbs-job-file` now redirects to the Jobs list. |
| Enquiry Prep (workflow) | Pipeline checks changed (AP check, MV check, Build pipeline). |
| Pages (workflow) | Small change to how pages are served. (The sign-in guard line now at the top of each page in `pages/` is added when a page is served; the 27/10 copies came from the stored rows without it, so it isn't new.) |
| TV Dashboard (workflow) | Board actions, dashboard data, settings page and cast bar updated. |
| CoSHH builder, Site inspection (pages) | New "Your PDF is ready / Open PDF" step for PDFs made inside the ServiceM8 app or a frame (the PDF is posted to `cbs-pdf-out` and opened in a new tab). |
| CPHSP builder (page) | Wording and contact-detail changes (adviser and office contacts). |
| Admin (page) | Header "actions" button styling, logo, restore-state tweak. |
| Other pages | No real change: only the served guard line and encoding (e.g. "&hellip;" written as "&#8230;"). |
| Yard page | Archived for the first time (`pages/cbs-yard.html`). |
| Tables | One new table, `CBS Stocktake Docs` (`tables/cbs-stocktake-docs.json`, no rows read). No column changes in the `cbs_` tables. |
| Temp workflows | "JR Refresh (temp)" and "Plant Test (temp)" (inactive test helpers). |

## Where to start

- `docs/inventory.md`: what the old hub does, area by area.
- `docs/plan.md`: the rebuild plan and the new Supabase schema (with a table showing where every old table goes).
