-- Registers: team requests (from the old cbs_requests), made in the team app or by the office.
-- docs/plan.md section 3.3 "requests"; owned by Registers since 28/10/2026 (docs/parallel-work.md).
-- Plan columns plus: requested_by_id (the person, when the name matches People), source (team app or
-- office), closed_by. Urgency and status are fixed lists; category is a dropdown the office can add to.

create table requests (
  id bigint generated always as identity primary key,
  requested_by text not null,                 -- name picked in the team app (or by the office)
  requested_by_id bigint references people(id) on delete set null,
  category text not null,
  urgency text not null default 'this_week' check (urgency in ('today', 'this_week', 'no_rush')),
  details text not null,
  status text not null default 'new' check (status in ('new', 'in_progress', 'done', 'declined')),
  response text,                              -- the office's reply
  requested_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by text,
  source text not null default 'office' check (source in ('office', 'team')),
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index requests_open on requests (status, requested_at desc);
create trigger requests_updated_at before update on requests for each row execute function set_updated_at();

alter table requests enable row level security;
