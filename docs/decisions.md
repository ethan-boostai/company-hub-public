# Decisions log

Ethan's decisions that change the plan, newest first. The full detail sits in `docs/plan.md` (sections 3.5 and 3.6); this log says what changed and when.

## 29/10/2026 (Phase 1 test round)

- **No custom requirement types.** Requirement types are built in only, defined in `src/lib/requirements.ts`. The Requirement types settings page, its menu item and the `requirement_types` table are removed (migration `20261029150000_drop_custom_requirement_types.sql`). Replaces plan 3.5 point 1 ("both"). Plan 3.6 point 13.
- **Site survey** is offered under Office tasks as well as On site tasks in + New task. Plan 3.6 point 14.
- **Search shows results as you type** in a list under the box; click a result to open it. Global search finds jobs (number, description, client), tasks and people; the Jobs page search works the same way for jobs. Plan 3.6 point 15.
- **Task drawer stays as in the old hub:** every task opens in the one task panel, a 560px drawer from the right, full height (the old `#ctd`), never a centred panel. The same drawer is used everywhere a task opens: Actions board, the job Tasks panel, search results and Home. The page behind it never scrolls.
- **Header + New task** opens the generic task form (Link to Nothing or a job; the job pre-set on a job's pages), as the old hub's header button did. The requirement picker is the job Tasks panel's own + New task.
- **Job page:** the Tasks panel sits down the right (380px), as in the old Job File; on narrower screens it sits behind a Tasks button and opens full screen.
