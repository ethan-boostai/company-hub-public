-- Registers: Time off (plan approved by Ethan 30/10/2026). Additive only.
-- One record per request. Only people with the Time off tick on People (the 'time_off' entry in
-- people.lists) may see these records, their notes and their files: the app checks it on the page
-- and on every route that returns them (canSeeTimeOff). Sick notes are personal health information.

create table time_off (
  id bigint generated always as identity primary key,
  person_id bigint not null references people(id) on delete restrict,
  kind text not null,                    -- Annual leave, Sick leave, ... (dropdown, office can add)
  from_date date not null,
  to_date date not null,
  part_day text not null default 'full' check (part_day in ('full', 'morning', 'afternoon')),
  days numeric(5,1) not null check (days >= 0),
  days_overridden boolean not null default false, -- true when the office typed the count
  notes text,                            -- from the team member
  status text not null default 'pending' check (status in ('pending', 'under_review', 'approved', 'declined')),
  response text,                         -- from the office
  requested_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  source text not null default 'office' check (source in ('office', 'team')),
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint time_off_dates check (to_date >= from_date),
  constraint time_off_part_day check (part_day = 'full' or from_date = to_date)
);
create index time_off_person on time_off (person_id, from_date);
create index time_off_dates on time_off (from_date, to_date);
create trigger time_off_updated_at before update on time_off for each row execute function set_updated_at();

alter table time_off enable row level security;

-- Per-record folder (path approved by Ethan 30/10/2026): HR, not Operations.
create function upload_folder_time_off(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/HR/Time Off/' || coalesce(registers_folder_name(p.name), 'Person ' || p.id)
  from time_off t join people p on p.id = t.person_id where t.id = p_id
$$;
