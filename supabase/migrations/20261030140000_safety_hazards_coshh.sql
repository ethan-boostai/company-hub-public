-- Phase 2 (Safety), company level: the hazards library and the CoSHH library (Ethan approved the
-- plan 29/10/2026). Additive only. Also adds materials.sds_substance_id to Registers' materials table
-- (docs/parallel-work.md says so).

-- Risk rating from likelihood x consequence (1-5 each), as the old hub:
-- 20+ Extreme, 10+ High, 5+ Medium, otherwise Low.
create function safety_risk_rating(l smallint, c smallint) returns text
language sql immutable set search_path = public as $$
  select case when l is null or c is null then null
              when l * c >= 20 then 'Extreme' when l * c >= 10 then 'High' when l * c >= 5 then 'Medium' else 'Low' end
$$;

create table hazards (
  id bigint generated always as identity primary key,
  hazard text not null,
  activity text,
  harm text,
  likelihood smallint check (likelihood between 1 and 5),
  consequence smallint check (consequence between 1 and 5),
  risk_rating text generated always as (safety_risk_rating(likelihood, consequence)) stored,
  controls text,
  -- Control hierarchy: E Eliminate, S Substitute, I Isolate, G Engineering, A Administrative, P PPE.
  control_codes text[] not null default '{}' check (control_codes <@ array['E', 'S', 'I', 'G', 'A', 'P']),
  residual_likelihood smallint check (residual_likelihood between 1 and 5),
  residual_consequence smallint check (residual_consequence between 1 and 5),
  residual_risk text generated always as (safety_risk_rating(residual_likelihood, residual_consequence)) stored,
  owner_id bigint references people (id) on delete set null,
  -- Equipment categories (Registers' equipment.category list) that bring this hazard into a RAMS.
  plant_categories text[] not null default '{}',
  -- The key the RAMS builder uses for this hazard (the old builder's keys are kept at import).
  rams_key text not null unique check (rams_key ~ '^[a-z0-9_]{1,60}$'),
  source text,
  status text not null default 'active' check (status in ('active', 'archived')),
  last_reviewed_on date,
  review_on date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index hazards_name_unique on hazards (lower(hazard));
create index hazards_review on hazards (review_on) where status = 'active';
alter table hazards enable row level security;

create table substances (
  id bigint generated always as identity primary key,
  product text not null,
  supplier_id bigint references suppliers (id) on delete set null,
  use_for text,          -- the process it is used for
  location text,
  quantity text,
  -- GHS hazard pictograms.
  ghs text[] not null default '{}' check (ghs <@ array['explosive', 'flammable', 'oxidising', 'gas', 'corrosive', 'toxic', 'harmful', 'health', 'environment']),
  ingredients text,
  -- Per route (inhaled, swallowed, skin, eyes): { effect, control, first_aid }.
  exposure jsonb not null default '{}'::jsonb,
  who_exposed text[] not null default '{}' check (who_exposed <@ array['employees', 'others']),
  frequency text,
  duration text,
  controls text,
  storage text,
  spills_disposal text,
  ppe text[] not null default '{}',
  ppe_other text,
  assessed_by_id bigint references people (id) on delete set null,
  assessed_on date,
  review_on date,
  sds_date date,
  sds_file_id bigint references files (id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'assessed')),
  -- The CoSHH pack: version goes up, and a new pack is made, only when the assessment content changes.
  version int not null default 0 check (version >= 0),
  pack_file_id bigint references files (id) on delete set null,
  pack_content_hash text,   -- fingerprint of the content the current pack was made from
  pack_made_on date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index substances_product_supplier_unique on substances (lower(product), coalesce(supplier_id, 0));
create index substances_review on substances (review_on);
alter table substances enable row level security;

-- Registers' materials: the CoSHH substance (and so the SDS) for a material.
alter table materials add column sds_substance_id bigint references substances (id) on delete set null;

-- SharePoint folders (inside "CBS System/"). Files attached to a substance are its SDS:
-- CBS System/H&S/COSHH/<product>/SDS. The pack goes one level up, CBS System/H&S/COSHH/<product>.
create function upload_folder_substances(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/H&S/COSHH/' || coalesce(registers_folder_name(product), 'Substance ' || id) || '/SDS' from substances where id = p_id
$$;

create function coshh_pack_folder(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/H&S/COSHH/' || coalesce(registers_folder_name(product), 'Substance ' || id) from substances where id = p_id
$$;
