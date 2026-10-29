-- Registers: Equipment and materials (plan approved by Ethan 29/10/2026). Additive only.
-- One view of equipment and materials, filterable by location: a place (CBS Warehouse, CBS Office
-- or any place the office adds), a vehicle that holds stock, or (equipment only) a person.
-- Materials are one record each, with stock held per location (material_stock); every change to a
-- quantity is a stock move with a reason. Stocktakes are materials only and need office approval.
-- Lost, stolen or damaged tool reports have their own register and can raise a Team request.
-- Plant booked to jobs (job_plant) is Site work and not in this migration.

-- Equipment (the old cbs_assets).
create table assets (
  id bigint generated always as identity primary key,
  asset_tag text,
  name text not null,
  category text,
  make_model text,
  serial_no text,
  status text not null default 'in_service'
    check (status in ('in_service', 'needs_repair', 'out_for_service', 'lost', 'retired')),
  location_place text,
  location_vehicle_id bigint references vehicles(id) on delete restrict,
  location_person_id bigint references people(id) on delete set null,
  purchased_on date,
  service_interval_months int check (service_interval_months between 1 and 120),
  last_service_on date,
  next_service_on date,
  test_tag_due date,                    -- PAT test / test and tag
  hav_magnitude numeric(6,2),           -- hand-arm vibration, m/s²
  hav_trigger_mins int,
  hav_ref text,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint assets_one_location check (num_nonnulls(location_place, location_vehicle_id, location_person_id) <= 1)
);
create unique index assets_tag_unique on assets (lower(asset_tag)) where asset_tag is not null;
create index assets_vehicle on assets (location_vehicle_id);
create trigger assets_updated_at before update on assets for each row execute function set_updated_at();

create table asset_services (
  id bigint generated always as identity primary key,
  asset_id bigint not null references assets(id) on delete cascade,
  serviced_on date not null,
  serviced_by text,
  work_done text,
  cost numeric(12,2),
  next_due date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index asset_services_asset on asset_services (asset_id);
create trigger asset_services_updated_at before update on asset_services for each row execute function set_updated_at();

-- Materials: one record per item; stock per location is in material_stock.
create table materials (
  id bigint generated always as identity primary key,
  name text not null,
  category text,
  unit text not null default 'each',
  supplier_id bigint references suppliers(id) on delete set null,
  supplier_code text,
  cost numeric(12,2),
  min_level numeric(12,3),
  reorder_qty numeric(12,3),
  sm8_uuid text,
  status text not null default 'active' check (status in ('active', 'discontinued')),
  last_counted_on date,
  last_counted_by text,
  notes text,
  legacy_ids bigint[] not null default '{}',  -- old rows merged into this one (one per old location)
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index materials_name_unit_unique on materials (lower(name), lower(unit));
create trigger materials_updated_at before update on materials for each row execute function set_updated_at();

create table material_stock (
  id bigint generated always as identity primary key,
  material_id bigint not null references materials(id) on delete cascade,
  location_place text,
  location_vehicle_id bigint references vehicles(id) on delete restrict,
  qty numeric(12,3) not null default 0 check (qty >= 0),
  updated_at timestamptz,
  constraint material_stock_one_location check (num_nonnulls(location_place, location_vehicle_id) = 1)
);
create unique index material_stock_unique on material_stock (material_id, coalesce(lower(location_place), ''), coalesce(location_vehicle_id, 0));
create index material_stock_vehicle on material_stock (location_vehicle_id);
create trigger material_stock_updated_at before update on material_stock for each row execute function set_updated_at();

-- Every change of stock at a location (a move is two rows sharing move_group), and every
-- equipment move. Kept as history: location labels are copied so they still read after a change.
create table stock_moves (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by text,
  material_id bigint references materials(id) on delete cascade,
  asset_id bigint references assets(id) on delete cascade,
  location_label text not null,
  location_place text,
  location_vehicle_id bigint references vehicles(id) on delete set null,
  change numeric(12,3),        -- materials: + added, - taken away
  qty_after numeric(12,3),     -- materials: stock at this location afterwards
  reason text not null,
  job_ref text,
  move_group uuid,
  stocktake_id bigint,
  notes text,
  legacy_id bigint unique,
  constraint stock_moves_one_item check (num_nonnulls(material_id, asset_id) = 1)
);
create index stock_moves_material on stock_moves (material_id, at desc);
create index stock_moves_asset on stock_moves (asset_id, at desc);

-- Stocktakes: materials at one location, counted, then approved or rejected by the office.
create table stocktakes (
  id bigint generated always as identity primary key,
  location_label text not null,
  location_place text,
  location_vehicle_id bigint references vehicles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  counted_by text not null,
  counted_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz,
  notes text,
  decision_notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text
);
create table stocktake_lines (
  id bigint generated always as identity primary key,
  stocktake_id bigint not null references stocktakes(id) on delete cascade,
  material_id bigint not null references materials(id) on delete cascade,
  expected numeric(12,3) not null,   -- stock the hub showed when the count was entered
  counted numeric(12,3) not null check (counted >= 0),
  applied boolean not null default true,
  new_qty numeric(12,3)              -- set when approved
);
create index stocktake_lines_stocktake on stocktake_lines (stocktake_id);
alter table stock_moves add constraint stock_moves_stocktake foreign key (stocktake_id) references stocktakes(id) on delete set null;

-- "Report a lost, stolen or damaged tool" (team app or office).
create table tool_reports (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('lost', 'stolen', 'damaged')),
  asset_id bigint references assets(id) on delete set null,
  tool_name text not null,
  occurred_at timestamptz,
  location text,
  police_ref text,
  details text,
  wants text not null default 'none' check (wants in ('none', 'replace', 'repair')),
  urgency text check (urgency in ('today', 'this_week', 'no_rush')),
  repair_notes text,
  replace_notes text,
  reported_by text not null,
  reported_by_id bigint references people(id) on delete set null,
  source text not null default 'office' check (source in ('office', 'team')),
  status text not null default 'new' check (status in ('new', 'in_progress', 'closed')),
  request_id bigint references requests(id) on delete set null,
  closed_at timestamptz,
  closed_by text,
  office_notes text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index tool_reports_asset on tool_reports (asset_id);
create trigger tool_reports_updated_at before update on tool_reports for each row execute function set_updated_at();

alter table assets enable row level security;
alter table asset_services enable row level security;
alter table materials enable row level security;
alter table material_stock enable row level security;
alter table stock_moves enable row level security;
alter table stocktakes enable row level security;
alter table stocktake_lines enable row level security;
alter table tool_reports enable row level security;

-- Per-record folders (paths approved by Ethan 29/10/2026; see 20261029120000_registers_upload_folders.sql).
create function upload_folder_assets(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Equipment/' ||
    coalesce(registers_folder_name(concat_ws(' - ', nullif(btrim(asset_tag), ''), name)), 'Equipment ' || id)
  from assets where id = p_id
$$;

create function upload_folder_asset_services(p_id bigint) returns text
language sql stable set search_path = public as $$
  select upload_folder_assets(asset_id) || '/Service History' from asset_services where id = p_id
$$;

create function upload_folder_materials(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Materials/' || coalesce(registers_folder_name(name), 'Material ' || id) from materials where id = p_id
$$;

create function upload_folder_tool_reports(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Equipment/Tool Reports/Report ' || id from tool_reports where id = p_id
$$;
