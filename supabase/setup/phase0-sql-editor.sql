-- Phase 0 setup for the Supabase SQL Editor (use this when `npm run db:migrate` can't reach the database).
-- Supabase dashboard > SQL Editor > New query > paste this whole file.
-- STEP 1: change the name and the 4-digit PIN at the very bottom (section 2). STEP 2: press Run.
-- Safe to run once only. Section 1 is a copy of supabase/migrations/20261028000001_phase0_core.sql.

begin;

-- ===== 1. Tables (copy of 20261028000001_phase0_core.sql) =====

-- Phase 0: core tables (people, sessions, files, select options, settings, activity log)
-- Schema approved by Ethan on 28/10/2026 (docs/plan.md section 3).
-- The app talks to the database only from server code. Row Level Security is on with no
-- policies, so the public Supabase API roles can read or write nothing.

-- Keeps updated_at current on every update.
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- People: staff and anyone who appears in pick lists. Office users sign in with name + 4-digit PIN.
create table people (
  id bigint generated always as identity primary key,
  name text not null,
  role text,
  mobile text,
  email text,
  active boolean not null default true,
  can_sign_in boolean not null default false,
  pin_hash text,                      -- bcrypt
  pin_set_at timestamptz,
  legacy_pin_hash text,               -- old n8n hub hash, checked once on first sign-in, then cleared
  failed_pin_count int not null default 0,
  locked_until timestamptz,
  signature_file_id bigint,           -- foreign key added below (files is created after people)
  site_lead boolean not null default false,
  hide_from_portal boolean not null default false,
  lists text[] not null default '{}', -- pick lists the person appears in (crew, rams, coshh, ...)
  sm8_staff_uuid text,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index people_name_unique on people (lower(name));
create trigger people_updated_at before update on people for each row execute function set_updated_at();

-- Office sign-in sessions. The cookie holds a random token; only its SHA-256 hash is stored.
create table sessions (
  id bigint generated always as identity primary key,
  person_id bigint not null references people(id) on delete cascade,
  token_hash text not null unique,
  device text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create index sessions_person on sessions (person_id);

-- Files: every upload, document and photo. SharePoint is home for documents; Supabase Storage
-- holds signatures and thumbnails only. 'local' is for development without either.
create table files (
  id bigint generated always as identity primary key,
  name text not null,
  mime text,
  size_bytes bigint,
  storage text not null check (storage in ('sharepoint', 'supabase', 'local')),
  sharepoint_item_id text,
  sharepoint_url text,
  storage_path text,
  job_id bigint,                      -- foreign key to jobs is added in Phase 1
  entity_table text,
  entity_id bigint,
  role text,
  caption text,
  categories text[] not null default '{}',
  taken_at timestamptz,
  taken_by text,
  phase text,
  superseded_by bigint references files(id),
  legacy_id bigint,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index files_entity on files (entity_table, entity_id);
create index files_job on files (job_id);
create trigger files_updated_at before update on files for each row execute function set_updated_at();

alter table people add constraint people_signature_file foreign key (signature_file_id) references files(id);

-- Every dropdown reads its options here and can add new ones.
create table select_options (
  id bigint generated always as identity primary key,
  list text not null,
  value text not null,
  sort int,
  legacy_id bigint,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index select_options_unique on select_options (list, lower(value));
create trigger select_options_updated_at before update on select_options for each row execute function set_updated_at();

-- Small key/value settings (TV settings, notify rules, ...).
create table settings (
  id bigint generated always as identity primary key,
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create trigger settings_updated_at before update on settings for each row execute function set_updated_at();

-- Who changed what. Written by server code on every save.
create table activity_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  person_name text,
  table_name text not null,
  row_id bigint,
  job_id bigint,
  action text not null check (action in ('create', 'update', 'delete', 'status')),
  changes jsonb
);
create index activity_log_row on activity_log (table_name, row_id);
create index activity_log_job on activity_log (job_id);
create index activity_log_at on activity_log (at desc);

-- Double-save guard: each submit carries a one-time key. A second save with the same key is refused.
create table request_keys (
  key text primary key,
  person_id bigint references people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index request_keys_created on request_keys (created_at);

alter table people enable row level security;
alter table sessions enable row level security;
alter table files enable row level security;
alter table select_options enable row level security;
alter table settings enable row level security;
alter table activity_log enable row level security;
alter table request_keys enable row level security;

-- Record the migration so `npm run db:migrate` skips it later.
create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now());
alter table schema_migrations enable row level security;
insert into schema_migrations (name) values ('20261028000001_phase0_core.sql') on conflict do nothing;

-- ===== 2. First office user =====
-- Put your own name and a 4-digit PIN between the quotes. The PIN is stored only as a hash.
with v as (select 'Ethan Paraha'::text as name, 'CHANGE ME'::text as pin)
insert into people (name, role, can_sign_in, pin_hash, pin_set_at, created_by)
select v.name, 'Office', true, extensions.crypt(v.pin, extensions.gen_salt('bf', 10)), now(), 'setup (SQL editor)'
from v
where v.pin ~ '^[0-9]{4}$';

-- Stops everything (nothing is saved) if the PIN above wasn't changed to 4 digits.
do $$
begin
  if not exists (select 1 from people where can_sign_in and pin_hash is not null) then
    raise exception 'Set a 4-digit PIN in section 2 (replace CHANGE ME), then run again.';
  end if;
end $$;

commit;

select name, can_sign_in, pin_set_at from people;
