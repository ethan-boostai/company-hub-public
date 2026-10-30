-- Registers, Phase 3 Site: plant and materials on a job (plan approved by Ethan 30/10/2026). Additive only.
-- job_plant: equipment booked out to a job. The equipment register (assets) stays the one record
-- of each item; an item's "on job N, due back ..." comes from its open booking and is not stored
-- twice. Booking moves the item to whoever has it (a van or a person), as a normal equipment move.

create table job_plant (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs(id) on delete restrict,
  asset_id bigint references assets(id) on delete set null, -- null once the item is deleted from the register
  asset_name text not null,           -- kept as history
  asset_tag text,
  category text,
  source text not null default 'job' check (source in ('job', 'load_up', 'yard')),
  load_up_sheet_id bigint,            -- the load-up sheet that booked it (foreign key added with load-up sheets)
  out_with_label text,                -- where it went when booked ("Ford Transit - ZZ Person H (ZZ01ZZA)", "With Joe")
  booked_at timestamptz not null default now(),
  booked_by text not null,
  due_back date,
  returned_at timestamptz,
  returned_by text,
  returned_to_label text,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  updated_by text,
  constraint job_plant_returned check ((returned_at is null) = (returned_by is null))
);
create index job_plant_job on job_plant (job_id, booked_at desc);
create index job_plant_asset on job_plant (asset_id, booked_at desc);
-- An item can only be out on one job at a time.
create unique index job_plant_one_open on job_plant (asset_id) where returned_at is null and asset_id is not null;
create trigger job_plant_updated_at before update on job_plant for each row execute function set_updated_at();

alter table job_plant enable row level security;

-- Stock moves to and from a job. job_ref (the typed job number) stays as history.
alter table stock_moves add column job_id bigint references jobs(id) on delete set null;
create index stock_moves_job on stock_moves (job_id, at desc) where job_id is not null;
update stock_moves m set job_id = j.id from jobs j where m.job_id is null and m.job_ref is not null and j.job_no = m.job_ref;
