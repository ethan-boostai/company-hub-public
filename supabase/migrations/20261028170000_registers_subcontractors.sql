-- Registers: Subcontractors and suppliers (one screen in the hub, separate tables underneath).
-- docs/plan.md section 3.3, with the changes Ethan approved on 28/10/2026:
-- subcontractors drop type, licence_* and insurance_expiry (never on the old form; documents cover them);
-- suppliers live only in suppliers; "Other, name it" columns are dropped (every dropdown can add options);
-- document files are files rows.
-- Additions: suppliers also hold documents (sites ask for delivery companies' insurance), so a
-- document belongs to either a subcontractor or a supplier; suppliers get a trade like subcontractors.

create table subcontractors (
  id bigint generated always as identity primary key,
  company text not null,
  trade text,
  contact text,
  email text,
  mobile text,
  approved boolean not null default false,   -- "Approved to work", set by hand
  inducted boolean not null default false,   -- "Inducted to our process"
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index subcontractors_company_unique on subcontractors (lower(company));
create trigger subcontractors_updated_at before update on subcontractors for each row execute function set_updated_at();

create table suppliers (
  id bigint generated always as identity primary key,
  name text not null,
  trade text,
  contact text,
  email text,
  phone text,
  address text,
  account_no text,
  qbo_vendor_id text,
  notes text,
  legacy_id bigint unique,                   -- old cbs_suppliers row
  legacy_subcontractor_id bigint unique,     -- old cbs_subcontractors row with type "Supplier"
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index suppliers_name_unique on suppliers (lower(name));
create trigger suppliers_updated_at before update on suppliers for each row execute function set_updated_at();

-- Insurance, accreditation and other documents held for a subcontractor or a supplier.
create table subcontractor_docs (
  id bigint generated always as identity primary key,
  subcontractor_id bigint references subcontractors(id) on delete cascade,
  supplier_id bigint references suppliers(id) on delete cascade,
  item text not null,
  reference text,
  issued_on date,
  expires_on date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  constraint subcontractor_docs_one_company check ((subcontractor_id is null) <> (supplier_id is null))
);
create index subcontractor_docs_subcontractor on subcontractor_docs (subcontractor_id);
create index subcontractor_docs_supplier on subcontractor_docs (supplier_id);
create trigger subcontractor_docs_updated_at before update on subcontractor_docs for each row execute function set_updated_at();

alter table subcontractors enable row level security;
alter table suppliers enable row level security;
alter table subcontractor_docs enable row level security;
