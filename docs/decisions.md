# Decisions log

Ethan's decisions that change the plan, newest first. The full detail sits in `docs/plan.md` (sections 3.5 and 3.6); this log says what changed and when.

## 29/10/2026 (Phase 1 test round)

- **No custom requirement types.** Requirement types are built in only, defined in `src/lib/requirements.ts`. The Requirement types settings page, its menu item and the `requirement_types` table are removed (migration `20261029120000_drop_custom_requirement_types.sql`). Replaces plan 3.5 point 1 ("both"). Plan 3.6 point 13.
- **Site survey** is offered under Office tasks as well as On site tasks in + New task. Plan 3.6 point 14.
- **Search shows results as you type** in a list under the box; click a result to open it. Global search finds jobs (number, description, client), tasks and people; the Jobs page search works the same way for jobs. Plan 3.6 point 15.
