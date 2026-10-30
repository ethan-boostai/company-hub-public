# /legacy: the old n8n hub (reference only)

Snapshot of the original CBS Operations Hub as it ran on n8n (https://old-hub.example), taken on 28/10/2026. **Read it, never run it.** Nothing in here is used by the new app; it is excluded from lint and typecheck.

Production n8n workflows are not changed from this repo (see `CLAUDE.md`).

## Contents

| Folder | What | How it was captured |
|---|---|---|
| `workflows/` | All 64 "CBS - …" workflows as n8n JSON (nodes, code, connections). File name = workflow name without "CBS - ", e.g. `job-file.json`. | n8n MCP `get_workflow_details` (read-only). |
| `workflows/_index_batch1.tsv`, `_index_batch2.tsv` | One line per workflow: id, name, active, file, webhook paths, data tables (by n8n id), external hosts (HTTP Request nodes only, so incomplete). | Script over the JSON. |
| `workflows/_notes_batch1.md`, `_notes_batch2.md` | Plain-English notes per workflow: purpose, endpoints, tables, integrations, business rules, shapes of the JSON columns. | Written from reading the workflow code. |
| `pages/` | Page HTML/JS that the old hub stored in the `cbs_page_parts` data table (served by "CBS - Pages", "CBS - Nav" and others). `_index.md` lists each part and where it came from. Pages built inside Code nodes are in the workflow JSON instead. | Read from recent n8n execution data. |
| `tables/` | One file per `cbs_` data table: columns and up to 3 sample rows. `_all_tables.json` lists all 74 tables with their n8n ids and columns. | Read-only runs of "CBS - Hub Data" and the "list" action of "CBS - Operations Backend", plus past execution data. |

## Redactions

- Signatures, images, PIN hashes and tokens in sample rows are replaced with `[redacted]`; `data:` URIs with `[data-uri redacted]`.
- Hard-coded secrets are replaced: the internal shared key (`[redacted-internal-key]`), the TV link token and crew-link salt (`[redacted-secret]`), and the PIN-hash prefix (`[redacted-salt]`).
- No n8n credentials are included (the export does not contain them).
- Real contact details are replaced with fake ones everywhere in `/legacy`: emails become `contactN@example.com`, phone numbers use Ofcom's fictional ranges (`07700 900nnn`, `0117 496 0nnn`), postcodes become `ZZ99 nZZ`, and street names become "Sample …". The same real value always maps to the same fake value. Names of people and companies are kept in `workflows/` and `pages/`.
- **`tables/` sample rows are fully faked** (30/10/2026, Ethan): people (`ZZ Person A`…, client contacts `ZZ Client Contact A`…), clients and sites (`ZZ Client A - Site 1`…), subcontractors, suppliers and insurers (`ZZ Barriers`, `ZZ Insurer A`…), towns (`Sampletown A`…), policy, licence, certificate, order and invoice numbers (`ZZ-POL-0001`, `ZZ-LIC-0003`…), van registrations (`ZZ01ZZA`…), SharePoint links (`https://example.sharepoint.com/Shared%20Documents/ZZ%20Test/file-N.<ext>`) and SharePoint item ids (`01ZZZZZZ…`). Columns, row counts and the shape of JSON-in-text columns are unchanged. CBS's own name and product brands (Sika, Zinsser and so on) are kept.
- Public helplines and public offices are left real on purpose, because they appear in safety documents: HSE RIDDOR line and HSE London office, NHS 111, gas emergency, Environment Agency hotline, FRANK, the Lighthouse charity, and the hospital A&E address used by the nearest-hospital helper.

## Where to start

- `docs/inventory.md`: what the old hub does, area by area.
- `docs/plan.md`: the rebuild plan and the new Supabase schema (with a table showing where every old table goes).
