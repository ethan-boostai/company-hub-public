-- Registers: per-record SharePoint folders, and team app report references (Ethan approved the
-- folder paths 29/10/2026). Additive only.
--
-- upload_folder_<table>(id) returns the full folder (inside "CBS System/") for files attached to that
-- record, or null when the record doesn't exist, which refuses the upload. The upload start route
-- calls it when one exists for the record's table. Outside the live site every upload still goes to
-- the test folder (uploadFolderFor in src/lib/files/storage.ts).

-- A company or item name made safe for a SharePoint folder name.
create function registers_folder_name(t text) returns text
language sql immutable set search_path = public as $$
  select nullif(left(btrim(regexp_replace(regexp_replace(coalesce(t, ''), '["*:<>?|#%/\\]|[[:cntrl:]]', '', 'g'), '\s+', ' ', 'g'), ' .'), 120), '')
$$;

-- Fleet: CBS System/Fleet/<REG> (regs are stored with no spaces).
create function upload_folder_vehicles(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Fleet/' || reg from vehicles where id = p_id
$$;

create function upload_folder_vehicle_services(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Fleet/' || v.reg || '/Service History' from vehicle_services s join vehicles v on v.id = s.vehicle_id where s.id = p_id
$$;

create function upload_folder_vehicle_checks(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Fleet/' || v.reg || '/Vehicle Checks' from vehicle_checks c join vehicles v on v.id = c.vehicle_id where c.id = p_id
$$;

create function upload_folder_vehicle_accidents(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Fleet/' || v.reg || '/Accidents' from vehicle_accidents a join vehicles v on v.id = a.vehicle_id where a.id = p_id
$$;

-- Subcontractors: CBS System/H&S/Subcontractors/<Company name>.
create function upload_folder_subcontractors(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/H&S/Subcontractors/' || coalesce(registers_folder_name(company), 'Subcontractor ' || id) from subcontractors where id = p_id
$$;

-- Suppliers: CBS System/Operations/Suppliers/<Company name>.
create function upload_folder_suppliers(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Suppliers/' || coalesce(registers_folder_name(name), 'Supplier ' || id) from suppliers where id = p_id
$$;

-- A subcontractor or supplier document goes in its company's folder.
create function upload_folder_subcontractor_docs(p_id bigint) returns text
language sql stable set search_path = public as $$
  select case when d.subcontractor_id is not null then upload_folder_subcontractors(d.subcontractor_id)
              else upload_folder_suppliers(d.supplier_id) end
  from subcontractor_docs d where d.id = p_id
$$;

-- Team requests: CBS System/Operations/Team Requests/Request <number>.
create function upload_folder_requests(p_id bigint) returns text
language sql stable set search_path = public as $$
  select 'CBS System/Operations/Team Requests/Request ' || id from requests where id = p_id
$$;

-- Which record each team app report created, by its one-time request key, so a report that is sent
-- again (its reply was lost) still gets its photo ticket instead of a second record.
create table team_report_refs (
  request_key text primary key,
  entity_table text not null,
  entity_id bigint not null,
  created_at timestamptz not null default now()
);
alter table team_report_refs enable row level security;
