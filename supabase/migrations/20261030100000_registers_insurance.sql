-- Registers: Insurance and accreditations (plan approved by Ethan 30/10/2026). Additive only.
-- Policies keep one record per period: "Add renewal" creates the next period, linked by renewed_from_id,
-- and the earlier period stays as history. Covers are typed lines (cover, limit, excess).
-- Claims are numbered CLM-001 upwards and link to a policy, a vehicle, a vehicle accident and equipment.
-- The job is stored as a job number (text) until the jobs table is on main; a later migration links it.

create table insurance_policies (
  id bigint generated always as identity primary key,
  policy_type text not null,             -- Public liability, Motor vehicle, ... (dropdown, office can add)
  name text,                             -- e.g. "Fleet", to tell two policies of one type apart
  insurer text,
  policy_no text,
  starts_on date,
  expires_on date,
  renewed_from_id bigint references insurance_policies(id) on delete set null,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint insurance_policies_dates check (expires_on is null or starts_on is null or expires_on >= starts_on)
);
-- A period can be renewed once (its renewal is the next period).
create unique index insurance_policies_renewed_from on insurance_policies (renewed_from_id) where renewed_from_id is not null;
create trigger insurance_policies_updated_at before update on insurance_policies for each row execute function set_updated_at();

create table insurance_covers (
  id bigint generated always as identity primary key,
  policy_id bigint not null references insurance_policies(id) on delete cascade,
  cover text not null,                   -- Public liability, Employer's liability, ... (dropdown, office can add)
  limit_amount numeric(14,2) check (limit_amount >= 0),
  excess numeric(12,2) check (excess >= 0),
  sort int not null default 0
);
create index insurance_covers_policy on insurance_covers (policy_id, sort);

create sequence claims_no_seq;

-- CLM-001, CLM-002 ... CLM-1000 (never cut short).
create function registers_next_claim_no() returns text
language sql volatile set search_path = public as $$
  select 'CLM-' || lpad(n::text, greatest(3, length(n::text)), '0') from (select nextval('claims_no_seq') as n) s
$$;

create table claims (
  id bigint generated always as identity primary key,
  claim_no text not null unique default registers_next_claim_no(),
  claim_type text not null,              -- Vehicle, Equipment, ... (dropdown, office can add)
  direction text not null default 'by_us' check (direction in ('by_us', 'against_us')),
  status text not null default 'open'
    check (status in ('open', 'lodged', 'assessing', 'approved', 'declined', 'settled', 'closed', 'withdrawn')),
  incident_date date,
  lodged_on date,
  closed_on date,
  policy_id bigint references insurance_policies(id) on delete set null,
  insurer text,                          -- insurer or other body handling it
  insurer_claim_no text,
  other_party text,
  other_contact text,
  description text,
  amount_claimed numeric(12,2) check (amount_claimed >= 0),
  excess numeric(12,2) check (excess >= 0),
  amount_settled numeric(12,2) check (amount_settled >= 0),
  vehicle_id bigint references vehicles(id) on delete set null,
  accident_id bigint references vehicle_accidents(id) on delete set null,
  asset_id bigint references assets(id) on delete set null,
  incident_ref text,                     -- safety incident reference, until Safety builds incidents
  job_no text,                           -- ServiceM8 job number, until jobs are on main
  site text,
  client text,
  next_action text,
  next_action_due date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index claims_vehicle on claims (vehicle_id);
create index claims_accident on claims (accident_id);
create index claims_asset on claims (asset_id);
create index claims_policy on claims (policy_id);
create trigger claims_updated_at before update on claims for each row execute function set_updated_at();

-- Company accreditations and memberships (the old cbs_company_certs).
create table company_certs (
  id bigint generated always as identity primary key,
  name text not null,                    -- CHAS, Constructionline Gold, ... (dropdown, office can add)
  issuer text,
  reference text,
  level text,
  issued_on date,
  expires_on date,
  annual_cost numeric(12,2) check (annual_cost >= 0),
  contact_notes text,                    -- account contact and login notes; never passwords
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint company_certs_dates check (expires_on is null or issued_on is null or expires_on >= issued_on)
);
create trigger company_certs_updated_at before update on company_certs for each row execute function set_updated_at();

alter table insurance_policies enable row level security;
alter table insurance_covers enable row level security;
alter table claims enable row level security;
alter table company_certs enable row level security;

-- Per-record folders (paths approved by Ethan 30/10/2026; see 20261029120000_registers_upload_folders.sql).
-- A policy and all its renewals share one folder, named from the first period.
create function upload_folder_insurance_policies(p_id bigint) returns text
language sql stable set search_path = public as $$
  with recursive chain as (
    select id, renewed_from_id, policy_type, name, 0 as depth from insurance_policies where id = p_id
    union all
    select p.id, p.renewed_from_id, p.policy_type, p.name, c.depth + 1
    from insurance_policies p join chain c on p.id = c.renewed_from_id
    where c.depth < 200
  )
  select 'CBS System/Operations/Insurance/' ||
    coalesce(registers_folder_name(concat_ws(' - ', policy_type, nullif(btrim(name), ''))), 'Policy ' || id)
  from chain order by depth desc limit 1
$$;

create function upload_folder_claims(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Insurance/Claims/' || coalesce(registers_folder_name(claim_no), 'Claim ' || id) from claims where id = p_id
$$;

create function upload_folder_company_certs(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Accreditations/' || coalesce(registers_folder_name(name), 'Accreditation ' || id) from company_certs where id = p_id
$$;
