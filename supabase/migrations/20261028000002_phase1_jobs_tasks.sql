-- Phase 1: jobs and tasks. Schema from docs/plan.md section 3.3, approved 28/10/2026, plus the
-- ServiceM8 sync tables the webhook test (job 10278) showed are needed. Additive only.
-- ServiceM8 is the master for jobs, folders, clients and the schedule: the sm8_* columns and tables
-- are written only by the sync.

-- ServiceM8 folders ("queues"), in ServiceM8's own order.
create table sm8_folders (
  id bigint generated always as identity primary key,
  sm8_uuid text not null unique,
  name text not null,
  active boolean not null default true,
  sort int,
  default_days int,
  sm8_edit_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create trigger sm8_folders_updated_at before update on sm8_folders for each row execute function set_updated_at();

-- Clients (ServiceM8 companies).
create table clients (
  id bigint generated always as identity primary key,
  sm8_uuid text not null unique,
  name text not null,
  address text,
  phone text,
  email text,
  active boolean not null default true,
  sm8_edit_date timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index clients_name on clients (lower(name));
create trigger clients_updated_at before update on clients for each row execute function set_updated_at();

-- Client contacts (ServiceM8 company contacts).
create table client_contacts (
  id bigint generated always as identity primary key,
  client_id bigint references clients(id) on delete cascade,
  sm8_uuid text not null unique,
  sm8_client_uuid text,
  name text not null default '',
  role text,
  phone text,
  mobile text,
  email text,
  active boolean not null default true,
  sm8_edit_date timestamptz,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index client_contacts_client on client_contacts (client_id);
create trigger client_contacts_updated_at before update on client_contacts for each row execute function set_updated_at();

-- Jobs. One row per ServiceM8 job. Programme, scope and enquiry columns arrive with their phases.
create table jobs (
  id bigint generated always as identity primary key,
  -- ServiceM8 copy (written only by the sync)
  sm8_uuid text not null unique,
  job_no text not null unique,
  sm8_status text,                       -- Quote / Work Order / Completed / Unsuccessful
  sm8_folder_uuid text,                  -- current folder (null = no folder)
  sm8_folder_expires timestamptz,
  sm8_last_kept_folder_uuid text,        -- last Approved / Part Approved / Reactive / Maintenance folder
  sm8_po_number text,
  sm8_invoice_total numeric(12,2),
  sm8_booked_until timestamptz,
  sm8_active boolean not null default true,
  sm8_description text,
  sm8_job_contact jsonb,                 -- the job's own contact in ServiceM8 (name, phone, email)
  client_id bigint references clients(id),
  site_address text,
  sm8_edit_date timestamptz,             -- newest ServiceM8 version applied (events can arrive out of order)
  -- hub stage, derived from sm8_status and stored for filtering
  stage text not null default 'estimate' check (stage in ('estimate','approved','completed','unsuccessful')),
  -- hub fields
  name text,
  client_contact_id bigint references client_contacts(id),
  contract_value numeric(12,2),
  qbo_ref text,
  notes text,
  sm8_description_copied text,           -- last ServiceM8 description copied into notes
  pm_id bigint references people(id),
  show_on_tv boolean not null default false,
  job_type text not null default 'project' check (job_type in ('project','cdm')),
  job_type_since timestamptz,
  job_type_by text,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index jobs_stage on jobs (stage);
create index jobs_folder on jobs (sm8_folder_uuid);
create index jobs_client on jobs (client_id);
create trigger jobs_updated_at before update on jobs for each row execute function set_updated_at();

-- Simple requirement types the office adds (a plain task with a stage). Built-in types live in code.
create table requirement_types (
  id bigint generated always as identity primary key,
  name text not null,
  stage text not null check (stage in ('estimate','approved_planning','approved_onsite','completed')),
  side text not null default 'office' check (side in ('office','site')),
  active boolean not null default true,
  sort int,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create unique index requirement_types_name on requirement_types (lower(name));
create trigger requirement_types_updated_at before update on requirement_types for each row execute function set_updated_at();

-- Which requirements are on each job. req_key is a built-in key or 'custom:<requirement_types.id>'.
-- "Remove from job" sets on = false (the task is hidden, never deleted).
create table job_requirements (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs(id) on delete cascade,
  req_key text not null,
  "on" boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text,
  unique (job_id, req_key)
);
create trigger job_requirements_updated_at before update on job_requirements for each row execute function set_updated_at();

-- Folder and status moves, from the hub, from ServiceM8 or automatic (folder restore).
create table job_moves (
  id bigint generated always as identity primary key,
  job_id bigint not null references jobs(id) on delete cascade,
  kind text not null,                    -- folder / status / type / restore
  source text not null check (source in ('hub','sm8','auto')),
  from_value text,
  to_value text,
  note text,
  at timestamptz not null default now(),
  by text
);
create index job_moves_job on job_moves (job_id, at desc);

-- Tasks. Every task is a single task. Three statuses; Verified is a sign-off after Done; In hand is a
-- note on an In progress task. Category is not stored (requirement group, or Office for one-off tasks).
create table tasks (
  id bigint generated always as identity primary key,
  job_id bigint references jobs(id) on delete cascade,      -- null = office task with no job
  title text not null,
  notes text,
  status text not null default 'todo' check (status in ('todo','in_progress','done')),
  in_hand_note text,
  in_hand_by text,
  in_hand_at timestamptz,
  assignee_id bigint references people(id),
  due_on date,
  done_at timestamptz,
  done_by text,
  verified_at timestamptz,
  verified_by text,
  side text not null default 'office' check (side in ('office','site')),
  submitted_at timestamptz,
  submitted_by text,
  sent_back_note text,
  sent_back_at timestamptz,
  sent_back_by text,
  removed_at timestamptz,
  removed_by text,
  req_key text,                          -- null for one-off tasks
  stage text check (stage in ('estimate','approved_planning','approved_onsite','completed')),
  source_table text,
  source_id bigint,
  drawing_pin jsonb,
  repeat text,
  last_done_on date,
  created_at timestamptz not null default now(),
  created_by text,
  updated_at timestamptz,
  updated_by text
);
create index tasks_job on tasks (job_id);
create index tasks_open on tasks (status) where removed_at is null;
create index tasks_assignee on tasks (assignee_id);
-- One live task per requirement per job.
create unique index tasks_job_req on tasks (job_id, req_key) where req_key is not null and removed_at is null;
create trigger tasks_updated_at before update on tasks for each row execute function set_updated_at();

-- ServiceM8 staff, for the schedule (who's booked on site).
create table sm8_staff (
  id bigint generated always as identity primary key,
  sm8_uuid text not null unique,
  first_name text,
  last_name text,
  email text,
  active boolean not null default true,
  sm8_edit_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create trigger sm8_staff_updated_at before update on sm8_staff for each row execute function set_updated_at();

-- ServiceM8 schedule: scheduled job activities (bookings). ServiceM8 is the only source for who's on site.
create table sm8_bookings (
  id bigint generated always as identity primary key,
  sm8_uuid text not null unique,
  job_sm8_uuid text not null,
  staff_sm8_uuid text,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean not null default true,
  sm8_edit_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index sm8_bookings_job on sm8_bookings (job_sm8_uuid);
create index sm8_bookings_when on sm8_bookings (starts_at, ends_at) where active;
create trigger sm8_bookings_updated_at before update on sm8_bookings for each row execute function set_updated_at();

-- ServiceM8 events already applied, so a repeat delivery is skipped.
create table sm8_events (
  event_id text primary key,
  type text not null,
  object_uuid text,
  edit_date timestamptz,
  outcome text,
  received_at timestamptz not null default now()
);
create index sm8_events_received on sm8_events (received_at);

alter table sm8_folders enable row level security;
alter table clients enable row level security;
alter table client_contacts enable row level security;
alter table jobs enable row level security;
alter table requirement_types enable row level security;
alter table job_requirements enable row level security;
alter table job_moves enable row level security;
alter table tasks enable row level security;
alter table sm8_staff enable row level security;
alter table sm8_bookings enable row level security;
alter table sm8_events enable row level security;
