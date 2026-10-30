# Legacy page parts (cbs_page_parts)

**Refreshed 30/10/2026:** every page below (and `cbs-yard.html`) was fetched again from its live URL on the old hub (GET only), secrets redacted, then run through the faking map (`private/fake-legacy.py`). Live pages are served with the sign-in guard line at the top. `cbs-job-file` now redirects to the Jobs list, so `cbs-job-file.html` is still the 27/10 copy. The table, sizes and dates below describe the 27/10 capture.

Archived from the n8n data table `cbs_page_parts` (id `HOHWTBOJHrHF0TvB`). It holds the page bodies that the old CBS Operations Hub served from n8n webhooks, mainly through **CBS - Pages** (`9Y8IYjM8jsKTtQTH`, node `Get Page`) at `/webhook/cbs-*`.

**Source for every file below:** workflow **CBS - Page Read (temp)** (`i3WbYiE5vjQhWp1h`), execution **1308994** (2026-10-27 16:19 UTC, its most recent run), node `Get Pages`, which returns every row of the table. It was read with the n8n MCP `get_execution` tool, and nothing was written to n8n.

Notes:
- Most rows store `content` as a JSON wrapper `{"t": <content-type>, "b": <body>}`. Each file holds the unwrapped body `b`, and its extension follows `t` (`text/html` gives .html, `application/javascript` gives .js). The two `_build_*` rows are plain JSON and are saved unchanged as .json.
- Rows named `_bak_<tag>_page:<page>` are backups that the page-patch helpers took before edits. They are saved in `_bak/<tag>__<page>.html`.
- `page:cbs-logo` is an `<img>` tag with an inline base64 PNG, kept unchanged.
- `size` is the saved file's size in bytes. `updated` is the row's `updatedAt` in n8n.

| # | name | file | type | size (bytes) | updated (UTC) |
|---|---|---|---|---|---|
| 1 | `_build_table_map` | [_build_table_map.json](_build_table_map.json) | application/json | 1,483 | 2026-10-05 09:35 |
| 2 | `_build_cphsp_spec` | [_build_cphsp_spec.json](_build_cphsp_spec.json) | application/json | 2,418 | 2026-10-05 09:35 |
| 3 | `page:cbs-admin` | [cbs-admin.html](cbs-admin.html) | text/html | 450,890 | 2026-10-27 16:06 |
| 4 | `page:cbs-rams-builder` | [cbs-rams-builder.html](cbs-rams-builder.html) | text/html | 184,473 | 2026-10-24 19:51 |
| 5 | `page:cbs-cphsp-builder` | [cbs-cphsp-builder.html](cbs-cphsp-builder.html) | text/html | 181,759 | 2026-10-25 07:54 |
| 6 | `page:cbs-toolbox-builder` | [cbs-toolbox-builder.html](cbs-toolbox-builder.html) | text/html | 101,175 | 2026-10-24 14:26 |
| 7 | `page:cbs-team-meeting` | [cbs-team-meeting.html](cbs-team-meeting.html) | text/html | 49,818 | 2026-10-06 14:28 |
| 8 | `page:cbs-incident-report` | [cbs-incident-report.html](cbs-incident-report.html) | text/html | 41,354 | 2026-10-08 10:22 |
| 9 | `page:cbs-ptm-sheet` | [cbs-ptm-sheet.html](cbs-ptm-sheet.html) | text/html | 58,710 | 2026-10-21 21:29 |
| 10 | `page:cbs-ptm-crew` | [cbs-ptm-crew.html](cbs-ptm-crew.html) | text/html | 44,211 | 2026-10-20 12:59 |
| 11 | `page:cbs-prestart` | [cbs-prestart.html](cbs-prestart.html) | text/html | 38,861 | 2026-10-06 14:28 |
| 12 | `page:cbs-po` | [cbs-po.html](cbs-po.html) | text/html | 43,245 | 2026-10-09 05:57 |
| 13 | `page:cbs-sign` | [cbs-sign.html](cbs-sign.html) | text/html | 38,474 | 2026-10-17 13:39 |
| 14 | `page:cbs-job-file` | [cbs-job-file.html](cbs-job-file.html) | text/html | 23,346 | 2026-10-06 16:17 |
| 15 | `page:cbs-team` | [cbs-team.html](cbs-team.html) | text/html | 45,271 | 2026-10-21 13:07 |
| 16 | `page:cbs-subjobs-board` | [cbs-subjobs-board.html](cbs-subjobs-board.html) | text/html | 18,062 | 2026-10-06 14:28 |
| 17 | `page:cbs-site-inspection` | [cbs-site-inspection.html](cbs-site-inspection.html) | text/html | 32,178 | 2026-10-08 10:22 |
| 18 | `page:cbs-builder-kit` | [cbs-builder-kit.js](cbs-builder-kit.js) | application/javascript | 18,009 | 2026-10-06 14:28 |
| 19 | `page:cbs-hz-icons` | [cbs-hz-icons.js](cbs-hz-icons.js) | application/javascript | 16,478 | 2026-10-07 11:13 |
| 20 | `page:cbs-std` | [cbs-std.js](cbs-std.js) | application/javascript | 4,558 | 2026-10-06 14:28 |
| 21 | `page:cbs-po-board` | [cbs-po-board.html](cbs-po-board.html) | text/html | 19,667 | 2026-10-24 12:00 |
| 22 | `page:cbs-logo` | [cbs-logo.html](cbs-logo.html) | text/html | 4,941 | 2026-10-05 11:28 |
| 23 | `page:cbs-permit` | [cbs-permit.html](cbs-permit.html) | text/html | 42,902 | 2026-10-21 19:31 |
| 24 | `page:cbs-visit` | [cbs-visit.html](cbs-visit.html) | text/html | 27,938 | 2026-10-06 14:28 |
| 25 | `page:cbs-hs` | [cbs-hs.html](cbs-hs.html) | text/html | 41,356 | 2026-10-06 14:28 |
| 26 | `page:cbs-pci` | [cbs-pci.html](cbs-pci.html) | text/html | 22,835 | 2026-10-06 14:28 |
| 27 | `_bak_uk1_page:cbs-rams-builder` | [_bak/uk1__cbs-rams-builder.html](_bak/uk1__cbs-rams-builder.html) | text/html | 127,854 | 2026-10-06 09:55 |
| 28 | `_bak_uk1_page:cbs-cphsp-builder` | [_bak/uk1__cbs-cphsp-builder.html](_bak/uk1__cbs-cphsp-builder.html) | text/html | 151,266 | 2026-10-06 09:55 |
| 29 | `_bak_uk1_page:cbs-toolbox-builder` | [_bak/uk1__cbs-toolbox-builder.html](_bak/uk1__cbs-toolbox-builder.html) | text/html | 58,070 | 2026-10-06 09:55 |
| 30 | `_bak_uk1_page:cbs-team-meeting` | [_bak/uk1__cbs-team-meeting.html](_bak/uk1__cbs-team-meeting.html) | text/html | 43,226 | 2026-10-06 09:55 |
| 31 | `_bak_uk1_page:cbs-sign` | [_bak/uk1__cbs-sign.html](_bak/uk1__cbs-sign.html) | text/html | 13,142 | 2026-10-06 09:58 |
| 32 | `page:cbs-coshh-builder` | [cbs-coshh-builder.html](cbs-coshh-builder.html) | text/html | 37,503 | 2026-10-08 09:57 |
| 33 | `_bak_kitreport_page:cbs-admin` | [_bak/kitreport__cbs-admin.html](_bak/kitreport__cbs-admin.html) | text/html | 353,803 | 2026-10-06 14:43 |
| 34 | `_bak_vehloc_page:cbs-admin` | [_bak/vehloc__cbs-admin.html](_bak/vehloc__cbs-admin.html) | text/html | 374,799 | 2026-10-06 15:12 |
| 35 | `_bak_reportcontents_page:cbs-admin` | [_bak/reportcontents__cbs-admin.html](_bak/reportcontents__cbs-admin.html) | text/html | 376,453 | 2026-10-06 15:23 |
| 36 | `_bak_cbsKitReport_page:cbs-admin` | [_bak/cbsKitReport__cbs-admin.html](_bak/cbsKitReport__cbs-admin.html) | text/html | 379,251 | 2026-10-06 15:26 |
| 37 | `_bak_cbsMxPrint_page:cbs-admin` | [_bak/cbsMxPrint__cbs-admin.html](_bak/cbsMxPrint__cbs-admin.html) | text/html | 386,863 | 2026-10-06 15:31 |
| 38 | `_bak_menu1_page:cbs-admin` | [_bak/menu1__cbs-admin.html](_bak/menu1__cbs-admin.html) | text/html | 391,449 | 2026-10-06 16:17 |
| 39 | `_bak_menu1_page:cbs-ptm-sheet` | [_bak/menu1__cbs-ptm-sheet.html](_bak/menu1__cbs-ptm-sheet.html) | text/html | 50,608 | 2026-10-06 16:17 |
| 40 | `_bak_menu1_page:cbs-ptm-crew` | [_bak/menu1__cbs-ptm-crew.html](_bak/menu1__cbs-ptm-crew.html) | text/html | 27,210 | 2026-10-06 16:17 |
| 41 | `_bak_menu1_page:cbs-job-file` | [_bak/menu1__cbs-job-file.html](_bak/menu1__cbs-job-file.html) | text/html | 23,349 | 2026-10-06 16:17 |
| 42 | `_bak_actsearch_page:cbs-admin` | [_bak/actsearch__cbs-admin.html](_bak/actsearch__cbs-admin.html) | text/html | 403,627 | 2026-10-07 09:07 |
| 43 | `_bak_vehtax_page:cbs-admin` | [_bak/vehtax__cbs-admin.html](_bak/vehtax__cbs-admin.html) | text/html | 405,072 | 2026-10-07 09:12 |
| 44 | `_bak_inhand_page:cbs-admin` | [_bak/inhand__cbs-admin.html](_bak/inhand__cbs-admin.html) | text/html | 405,180 | 2026-10-07 10:01 |
| 45 | `_bak_dnd_page:cbs-admin` | [_bak/dnd__cbs-admin.html](_bak/dnd__cbs-admin.html) | text/html | 413,113 | 2026-10-07 10:07 |
| 46 | `_bak_taskv2_page:cbs-admin` | [_bak/taskv2__cbs-admin.html](_bak/taskv2__cbs-admin.html) | text/html | 420,022 | 2026-10-07 10:36 |
| 47 | `_bak_ihteam_page:cbs-admin` | [_bak/ihteam__cbs-admin.html](_bak/ihteam__cbs-admin.html) | text/html | 420,408 | 2026-10-07 12:54 |
| 48 | `_bak_pdfsharp_page:cbs-rams-builder` | [_bak/pdfsharp__cbs-rams-builder.html](_bak/pdfsharp__cbs-rams-builder.html) | text/html | 160,395 | 2026-10-08 09:57 |

## Gaps

- **Rows after id 48 were not retrieved.** The table has more rows than this. The export stops at the first 48 rows (by id) because the MCP transport fails on responses larger than about 8 MB, and rows 33 to 48 are mostly `page:cbs-admin` backups of about 400 KB each. Rows 1 to 48 include every page that **CBS - Pages** serves, so the missing rows are probably more `_bak_*` backups. They could also include pages added later.
- `page:cbs-yard` was not archived on 27/10; since 30/10 it is in [cbs-yard.html](cbs-yard.html), fetched from the live `cbs-yard` URL.
- The table `cbs_page_parts_backup_20261006` (`PsatFoq0cDpQsRzp`), a full copy of this table taken on 2026-10-06, was not archived because no workflow reads it.
- Many other hub pages are not stored in `cbs_page_parts`. Their own workflows build them inline in Code nodes, for example CBS - Nav (cbs-nav, sign-in, summary, layout), CBS - Job Inspections, CBS - Programme Page, CBS - Scope, CBS - Snagging, CBS - Service Sheets, CBS - TV Dashboard and the CBS - File Alerts UI script. Those pages are not covered here.

The workflows checked (CBS - Pages, CBS - CoSHH, CBS - Forms, CBS - Yard, CBS - Nav) reference these page names: `page:cbs-admin`, `page:cbs-rams-builder`, `page:cbs-cphsp-builder`, `page:cbs-toolbox-builder`, `page:cbs-team-meeting`, `page:cbs-incident-report`, `page:cbs-ptm-sheet`, `page:cbs-ptm-crew`, `page:cbs-prestart`, `page:cbs-po`, `page:cbs-sign`, `page:cbs-team`, `page:cbs-subjobs-board`, `page:cbs-site-inspection`, `page:cbs-builder-kit`, `page:cbs-hz-icons`, `page:cbs-std`, `page:cbs-po-board`, `page:cbs-logo`, `page:cbs-permit`, `page:cbs-visit`, `page:cbs-hs`, `page:cbs-pci`, `page:cbs-coshh-builder` and `page:cbs-yard`. All of them were found except `page:cbs-yard`. `page:cbs-job-file` is in the table, but CBS - Pages has no webhook that serves it.

## Note (28/10/2026)

The 22 backup rows (`_bak/…`, about 5 MB, mostly old copies of the admin page) were not kept in the repo. They can be re-read from n8n if ever needed.
