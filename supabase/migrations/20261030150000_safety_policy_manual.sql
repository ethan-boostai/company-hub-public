-- Phase 2 (Safety), company level: the H&S policy statement and the H&S manual (Ethan approved the
-- plan 29/10/2026). One row per document issue. Additive only.
create table hs_documents (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('policy', 'manual')),
  version text not null,              -- the issue name, e.g. "October 2026"
  status text not null default 'draft' check (status in ('draft', 'issued', 'superseded')),
  effective_on date,
  review_due date,
  -- Policy statement only: the wording and who signs it.
  paragraphs text[] not null default '{}',
  signatory_id bigint references people (id) on delete set null,
  signatory_name text,                 -- as printed on the issued statement
  signatory_role text,
  advisor text,
  signature_file_id bigint references files (id) on delete set null,
  -- The issued policy PDF, or the manual PDF.
  file_id bigint references files (id) on delete set null,
  issued_by text,
  issued_on date,
  notes text,
  legacy_id bigint unique,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index hs_documents_version_unique on hs_documents (kind, lower(version));
-- Only one issued policy and one issued manual at a time.
create unique index hs_documents_one_issued on hs_documents (kind) where status = 'issued';
alter table hs_documents enable row level security;

-- SharePoint: CBS System/H&S/Policies (the manual upload; issued statements are saved there too).
create function upload_folder_hs_documents(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/H&S/Policies' from hs_documents where id = p_id
$$;
