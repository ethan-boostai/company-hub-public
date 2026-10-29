-- Phase 2 (Safety), job level: sign-ons (Ethan approved the plan 30/10/2026). One signing system for
-- RAMS, pre-starts, toolbox talks and CPHSP inductions: each person signs a document's current
-- revision once. Additive only.
create table sign_ons (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs (id) on delete cascade,
  doc_type text not null check (doc_type in ('rams', 'prestart', 'toolbox', 'cphsp')),
  doc_id bigint not null,
  doc_revision int not null default 1,
  doc_label text,                    -- e.g. "RAMS rev 2", as shown on the sign-on list
  name text not null,
  company text,                      -- "Chelmsford Building Services" or the other company
  is_worker boolean not null default true,   -- CBS (true) or another company
  person_id bigint references people (id) on delete set null,
  accepted boolean not null default true,    -- ticked "I have read and understood"
  signature_file_id bigint references files (id) on delete set null,
  signed_at timestamptz not null default now(),
  signed_via text not null default 'office' check (signed_via in ('office', 'crew')),
  presenter text,                    -- a CPHSP induction given on one device
  reviewed boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text
);
-- One signature per person per document revision.
create unique index sign_ons_once on sign_ons (doc_type, doc_id, doc_revision, lower(name));
create index sign_ons_job on sign_ons (job_id);
create index sign_ons_to_review on sign_ons (job_id) where not reviewed;
alter table sign_ons enable row level security;
