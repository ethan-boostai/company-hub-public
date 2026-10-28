-- Registers: Fleet (vehicles, vehicle checks, services, accidents).
-- docs/plan.md section 3.3 "Company-wide", with the changes Ethan approved on 28/10/2026:
-- reg stored in capitals with no spaces; no insurance_due (the motor policy gives it);
-- inspection_frequency replaces no_monthly_check; holds_stock replaces fleet_only;
-- next_inspection_on kept (rolls on when a check is logged, office can edit);
-- photos and receipts are files rows, not single file columns. Mileage is in miles.

create table vehicles (
  id bigint generated always as identity primary key,
  reg text not null check (reg ~ '^[A-Z0-9]+$'),
  make_model text,
  year int check (year between 1950 and 2100),
  assigned_to_id bigint references people(id) on delete set null,
  vehicle_tax_due date,
  mot_expiry date,
  service_due date,
  inspection_frequency text not null default 'monthly'
    check (inspection_frequency in ('weekly', 'monthly', 'quarterly', 'not_required')),
  next_inspection_on date,
  holds_stock boolean not null default true,  -- shows as a location for equipment and materials
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index vehicles_reg_unique on vehicles (reg);
create trigger vehicles_updated_at before update on vehicles for each row execute function set_updated_at();

create table vehicle_checks (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  checked_on date not null,
  checked_by text,                      -- name picked per check (crew use the team app with no sign-in)
  odometer int check (odometer >= 0),   -- miles
  tyres_ok boolean not null default true,
  lights_ok boolean not null default true,
  fluids_ok boolean not null default true,
  body_ok boolean not null default true,
  restraints_ok boolean not null default true,
  first_aid_ok boolean not null default true,
  extinguisher_ok boolean not null default true,
  defects text,
  action text,
  status text not null default 'passed' check (status in ('passed', 'defects', 'off_road', 'defects_fixed')),
  reviewed boolean not null default false,
  source text not null default 'office' check (source in ('office', 'team')),
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index vehicle_checks_vehicle on vehicle_checks (vehicle_id, checked_on desc);
create trigger vehicle_checks_updated_at before update on vehicle_checks for each row execute function set_updated_at();

create table vehicle_services (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  serviced_on date not null,
  workshop text,
  work_done text,
  odometer int check (odometer >= 0),        -- miles
  cost numeric(12,2),
  next_due date,
  next_due_miles int check (next_due_miles >= 0),
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index vehicle_services_vehicle on vehicle_services (vehicle_id, serviced_on desc);
create trigger vehicle_services_updated_at before update on vehicle_services for each row execute function set_updated_at();

create table vehicle_accidents (
  id bigint generated always as identity primary key,
  vehicle_id bigint not null references vehicles(id) on delete cascade,
  occurred_at timestamptz,
  driver text,
  location text,
  description text,
  damage text,
  injuries text,
  third_party text,
  third_party_reg text,
  third_party_insurer text,
  police_event_no text,
  claim_id bigint,                      -- foreign key to claims is added with the insurance register
  status text not null default 'reported' check (status in ('reported', 'claim_lodged', 'repairs_booked', 'closed')),
  source text not null default 'office' check (source in ('office', 'team')),
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index vehicle_accidents_vehicle on vehicle_accidents (vehicle_id, occurred_at desc);
create trigger vehicle_accidents_updated_at before update on vehicle_accidents for each row execute function set_updated_at();

alter table vehicles enable row level security;
alter table vehicle_checks enable row level security;
alter table vehicle_services enable row level security;
alter table vehicle_accidents enable row level security;
