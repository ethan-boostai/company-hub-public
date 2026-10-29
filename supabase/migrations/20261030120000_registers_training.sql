-- Registers: Team training (plan approved by Ethan 30/10/2026). Additive only.
-- One record per ticket or qualification a person holds (the old cbs_training). A newer record for
-- the same person and ticket replaces the older one on the matrix; the older one stays as history.

create table training_records (
  id bigint generated always as identity primary key,
  person_id bigint not null references people(id) on delete restrict,
  qualification text not null,           -- CSCS card, SMSTS, ... (dropdown, office can add)
  provider text,
  reference text,                        -- certificate or licence number
  issued_on date,
  expires_on date,                       -- blank: doesn't expire
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint training_records_dates check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create index training_records_person on training_records (person_id);
create trigger training_records_updated_at before update on training_records for each row execute function set_updated_at();

alter table training_records enable row level security;

-- Per-record folder (path approved by Ethan 30/10/2026, the same as the old hub).
create function upload_folder_training_records(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/H&S/Training/' || coalesce(registers_folder_name(p.name), 'Person ' || p.id)
  from training_records t join people p on p.id = t.person_id where t.id = p_id
$$;
