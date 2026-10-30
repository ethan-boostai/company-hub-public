-- Registers, Phase 3 Site: load-up sheets (plan approved by Ethan 30/10/2026). Additive only.
-- The old hub's "Equipment & Materials Sheet" (cbs_ptm_sheets, PTM = plant, tools, materials):
-- the office prepares what goes in which van for a job; the crew ticks what they load.
-- Loading takes the materials off stock at the location each line names (used on the job) and
-- books the equipment to the job in the sheet's van. Nothing completes the job's Load-up task.

create table load_up_sheets (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs(id) on delete cascade, -- jobs are never deleted by the hub (as RAMS)
  sheet_date date not null,
  vehicle_id bigint references vehicles(id) on delete set null,
  vehicle_label text,                    -- the van as it was when the sheet was saved
  crew_ids bigint[] not null default '{}', -- people going (pre-filled from the ServiceM8 schedule)
  prepared_by_id bigint references people(id) on delete set null,
  due_back date,                         -- equipment due back to the yard
  ppe text[] not null default '{}',
  notes text,                            -- for the crew
  status text not null default 'draft' check (status in ('draft', 'ready', 'loaded')),
  loaded_at timestamptz,
  loaded_by text,
  problems text,                         -- reported when loading or with Report a problem (dated lines)
  problems_open boolean not null default false, -- shows under Needs attention until the office marks them sorted
  problems_sorted_by text,
  problems_sorted_at timestamptz,
  pdf_file_id bigint references files(id) on delete set null,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint load_up_loaded check ((status = 'loaded') = (loaded_at is not null))
);
create index load_up_sheets_job on load_up_sheets (job_id, sheet_date desc);
create index load_up_sheets_open on load_up_sheets (sheet_date) where status <> 'loaded';
create trigger load_up_sheets_updated_at before update on load_up_sheets for each row execute function set_updated_at();
alter table load_up_sheets enable row level security;

create table load_up_lines (
  id bigint generated always as identity primary key,
  sheet_id bigint not null references load_up_sheets(id) on delete cascade,
  sort int not null default 0,
  -- equipment: a register item; material: from stock; custom_equipment / custom_material: not on
  -- the register (from the yard); buy: bought on the way.
  kind text not null check (kind in ('equipment', 'material', 'custom_equipment', 'custom_material', 'buy')),
  asset_id bigint references assets(id) on delete set null,
  material_id bigint references materials(id) on delete set null,
  name text not null,                    -- kept as history
  category text,
  unit text,
  qty numeric(12,3),
  from_place text,                       -- materials: where the stock comes from (a place ...
  from_vehicle_id bigint references vehicles(id) on delete set null, -- ... or a van that holds stock)
  buy_from text,
  buy_note text,
  -- Filled in at loading.
  outcome text check (outcome in ('loaded', 'part', 'not_loaded')),
  loaded_qty numeric(12,3),
  reason text check (reason in ('out_of_stock', 'faulty', 'cant_find', 'not_needed', 'couldnt_buy')),
  reason_note text
);
create index load_up_lines_sheet on load_up_lines (sheet_id, sort);
alter table load_up_lines enable row level security;

-- Like RAMS, a job's bookings go with the job (the hub never deletes jobs; tests re-create job 12).
alter table job_plant drop constraint job_plant_job_id_fkey;
alter table job_plant add constraint job_plant_job_id_fkey foreign key (job_id) references jobs(id) on delete cascade;

alter table job_plant add constraint job_plant_load_up_sheet foreign key (load_up_sheet_id) references load_up_sheets(id) on delete set null;
