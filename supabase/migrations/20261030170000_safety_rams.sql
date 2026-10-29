-- Phase 2 (Safety), job level: RAMS and RAMS job types (Ethan approved the plan 30/10/2026).
-- One row per RAMS revision; a new revision is a new row (its own PDF file, "… rev 2.pdf"), and the
-- one before becomes Superseded. Subcontractor RAMS are uploads on the same list. Additive only.
create table rams (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs (id) on delete cascade,
  kind text not null default 'cbs' check (kind in ('cbs', 'subcontractor')),
  seq int not null,                       -- RAMS number on the job: "<job no>-<seq>"
  revision int not null default 1 check (revision >= 1),
  status text not null default 'draft' check (status in ('draft', 'issued', 'superseded')),
  title text not null,                    -- the activity
  template_key text,                      -- the job type it started from
  data jsonb not null default '{}'::jsonb, -- the builder content (steps, hazards, PPE, permits, wording …)
  prepared_by_id bigint references people (id) on delete set null,
  approved_by_id bigint references people (id) on delete set null,
  approver_role text,
  dated date,
  -- Subcontractor RAMS: who sent it and the office's review.
  subcontractor_id bigint references subcontractors (id) on delete set null,
  review_status text check (review_status in ('pending', 'approved', 'rejected')),
  review_note text,
  file_id bigint references files (id) on delete set null,         -- the issued PDF (or the subcontractor's file)
  signed_file_id bigint references files (id) on delete set null,  -- the current signed copy
  issued_at timestamptz,
  issued_by text,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  unique (job_id, seq, revision)
);
create index rams_job on rams (job_id);
-- Only one issued revision of each RAMS at a time.
create unique index rams_one_issued on rams (job_id, seq) where status = 'issued';
alter table rams enable row level security;

-- Health and safety > Templates > RAMS job types: what a new RAMS can start from.
create table rams_templates (
  id bigint generated always as identity primary key,
  key text not null unique check (key ~ '^[a-z0-9_]{1,60}$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'retired')),
  template jsonb not null default '{}'::jsonb,  -- activity, scope, plant, materials, hazard keys, PPE, permits, steps
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index rams_templates_name_unique on rams_templates (lower(name));
alter table rams_templates enable row level security;

-- Files attached to a RAMS (a subcontractor's RAMS upload) go in the job's RAMS folder.
create function upload_folder_rams(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Jobs/Job ' || j.job_no || '/RAMS' from rams r join jobs j on j.id = r.job_id where r.id = p_id
$$;
