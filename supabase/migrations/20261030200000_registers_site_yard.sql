-- Registers, Phase 3 Site: the yard app (plan approved by Ethan 30/10/2026). Additive only.
-- The yard tablet (/yard, opened with the team-app link key; name picked per action) can report
-- equipment as faulty, missing or found. Those become tool reports that wait for the office: the
-- equipment's status only changes when the office confirms (Ethan: "a tool report for the office to
-- confirm"). Team-app and office reports keep changing the status straight away, as before.

alter table tool_reports drop constraint tool_reports_kind_check;
alter table tool_reports add constraint tool_reports_kind_check check (kind in ('lost', 'stolen', 'damaged', 'found'));
alter table tool_reports drop constraint tool_reports_source_check;
alter table tool_reports add constraint tool_reports_source_check check (source in ('office', 'team', 'yard'));
-- The status the report asks for, waiting for the office (null once confirmed, or for reports that
-- change the status straight away).
alter table tool_reports add column pending_status text check (pending_status in ('needs_repair', 'lost', 'in_service'));
alter table tool_reports add column pending_location_place text; -- found: where it is now (the yard)
alter table tool_reports add column status_confirmed_by text;
alter table tool_reports add column status_confirmed_at timestamptz;

-- Materials returned to the yard that aren't on the register (the old hub's "Returned from job (not
-- in register)"). They show under Needs attention on Equipment and materials until the office has
-- dealt with them (e.g. added the material) and marks them done.
create table yard_returns (
  id bigint generated always as identity primary key,
  name text not null,
  unit text,
  qty numeric(12,3) not null check (qty > 0),
  job_id bigint references jobs(id) on delete set null,
  location_label text not null,         -- where it was put
  returned_by text not null,
  notes text,
  status text not null default 'new' check (status in ('new', 'done')),
  done_by text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index yard_returns_open on yard_returns (created_at) where status = 'new';
alter table yard_returns enable row level security;
