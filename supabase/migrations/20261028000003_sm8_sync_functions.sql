-- ServiceM8 sync rules, as database functions. n8n receives ServiceM8 webhooks and its 5-minute /
-- nightly reads, and calls these functions; they decide what to store. ServiceM8 is the master.
--
-- Rules (docs/plan.md 3.6):
--  * A record is applied only if it is at least as new (ServiceM8 edit_date) as what is stored:
--    events can arrive out of order. A blank client on an equally new copy never clears a known client.
--  * Each ServiceM8 event id is applied once (sm8_events).
--  * Folders are matched by uuid; names are trimmed (ServiceM8 names can have stray spaces).
--  * Jobs: only those allowed by the 'sm8_sync' setting (test job 10278 until live data is approved).
--  * A Work Order that drops out of its folder goes back to the folder it was in (Approved, Part
--    Approved, Reactive, Maintenance). The function only says so (action restore_folder); n8n writes
--    it to ServiceM8. Off unless the 'sm8_sync' setting has folder_keeper = true (the old hub still
--    does this until it is switched off).

insert into settings (key, value, created_by)
values ('sm8_sync', '{"jobs": "allowlist", "allow": ["10278"], "folder_keeper": false}', 'migration')
on conflict (key) do nothing;

-- ServiceM8 date text ('2026-10-28 12:57:19', UK local time; '0000-00-00 00:00:00' = none).
create or replace function sm8_ts(t text) returns timestamptz
language sql immutable as $$
  select case when t is null or t = '' or t like '0000-00-00%' then null
              else (t::timestamp at time zone 'Europe/London') end
$$;

create or replace function sm8_blank(t text) returns text
language sql immutable as $$
  select nullif(btrim(coalesce(t, '')), '')
$$;

-- Hub stage from ServiceM8 status.
create or replace function sm8_stage(status text) returns text
language sql immutable as $$
  select case status when 'Work Order' then 'approved' when 'Completed' then 'completed'
                     when 'Unsuccessful' then 'unsuccessful' else 'estimate' end
$$;

-- Folders a Work Order is kept in (and put back into if it drops out).
create or replace function sm8_kept_folder(name text) returns boolean
language sql immutable as $$
  select coalesce(btrim(name), '') ~* '^(approved|part approved)|reactive|maint'
$$;

create or replace function sm8_job_allowed(job_no text) returns boolean
language sql stable as $$
  select coalesce((select case when value->>'jobs' = 'all' then true
                               else coalesce(value->'allow', '[]'::jsonb) ? job_no end
                   from settings where key = 'sm8_sync'), false)
$$;

create or replace function sm8_upsert_folder(q jsonb, sort_no int default null) returns void
language plpgsql as $$
begin
  if sm8_blank(q->>'uuid') is null then return; end if;
  insert into sm8_folders (sm8_uuid, name, active, sort, default_days, sm8_edit_date)
  values (q->>'uuid', coalesce(sm8_blank(q->>'name'), '(no name)'), coalesce((q->>'active')::int, 1) = 1,
          sort_no, nullif(q->>'default_timeframe', '')::int, sm8_ts(q->>'edit_date'))
  on conflict (sm8_uuid) do update set
    name = excluded.name,
    active = case when q ? 'active' then excluded.active else sm8_folders.active end,
    sort = coalesce(excluded.sort, sm8_folders.sort),
    default_days = coalesce(excluded.default_days, sm8_folders.default_days),
    sm8_edit_date = coalesce(excluded.sm8_edit_date, sm8_folders.sm8_edit_date);
end;
$$;

create or replace function sm8_upsert_client(c jsonb) returns bigint
language plpgsql as $$
declare
  cid bigint;
  edit timestamptz := sm8_ts(c->>'edit_date');
begin
  if sm8_blank(c->>'uuid') is null then return null; end if;
  insert into clients (sm8_uuid, name, address, phone, email, active, sm8_edit_date, created_by)
  values (c->>'uuid', coalesce(sm8_blank(c->>'name'), '(no name)'), sm8_blank(c->>'address'),
          sm8_blank(c->>'phone'), sm8_blank(c->>'email'), coalesce((c->>'active')::int, 1) = 1, edit, 'ServiceM8')
  on conflict (sm8_uuid) do update set
    name = excluded.name,
    address = excluded.address,
    phone = coalesce(excluded.phone, clients.phone),
    email = coalesce(excluded.email, clients.email),
    active = case when c ? 'active' then excluded.active else clients.active end,
    sm8_edit_date = coalesce(excluded.sm8_edit_date, clients.sm8_edit_date),
    updated_by = 'ServiceM8'
  where clients.sm8_edit_date is null or excluded.sm8_edit_date is null or excluded.sm8_edit_date >= clients.sm8_edit_date
  returning id into cid;
  if cid is null then select id into cid from clients where sm8_uuid = c->>'uuid'; end if;
  return cid;
end;
$$;

create or replace function sm8_upsert_contact(c jsonb) returns void
language plpgsql as $$
declare
  edit timestamptz := sm8_ts(c->>'edit_date');
  nm text := btrim(concat_ws(' ', sm8_blank(c->>'first'), sm8_blank(c->>'last')));
begin
  if sm8_blank(c->>'uuid') is null then return; end if;
  insert into client_contacts (client_id, sm8_uuid, sm8_client_uuid, name, role, phone, mobile, email, active, sm8_edit_date, created_by)
  values ((select id from clients where sm8_uuid = c->>'company_uuid'), c->>'uuid', sm8_blank(c->>'company_uuid'),
          nm, sm8_blank(c->>'type'), sm8_blank(c->>'phone'), sm8_blank(c->>'mobile'), sm8_blank(c->>'email'),
          coalesce((c->>'active')::int, 1) = 1, edit, 'ServiceM8')
  on conflict (sm8_uuid) do update set
    client_id = coalesce(excluded.client_id, client_contacts.client_id),
    sm8_client_uuid = coalesce(excluded.sm8_client_uuid, client_contacts.sm8_client_uuid),
    name = excluded.name, role = excluded.role, phone = excluded.phone, mobile = excluded.mobile,
    email = excluded.email, active = excluded.active,
    sm8_edit_date = coalesce(excluded.sm8_edit_date, client_contacts.sm8_edit_date),
    updated_by = 'ServiceM8'
  where client_contacts.sm8_edit_date is null or excluded.sm8_edit_date is null or excluded.sm8_edit_date >= client_contacts.sm8_edit_date;
end;
$$;

create or replace function sm8_upsert_staff(s jsonb) returns void
language plpgsql as $$
begin
  if sm8_blank(s->>'uuid') is null then return; end if;
  insert into sm8_staff (sm8_uuid, first_name, last_name, email, active, sm8_edit_date)
  values (s->>'uuid', sm8_blank(s->>'first'), sm8_blank(s->>'last'), sm8_blank(s->>'email'),
          coalesce((s->>'active')::int, 1) = 1, sm8_ts(s->>'edit_date'))
  on conflict (sm8_uuid) do update set
    first_name = excluded.first_name, last_name = excluded.last_name, email = excluded.email,
    active = excluded.active, sm8_edit_date = excluded.sm8_edit_date;
end;
$$;

-- ServiceM8 job activity: only scheduled ones are bookings. Skipped for jobs the hub doesn't hold.
create or replace function sm8_upsert_booking(a jsonb) returns boolean
language plpgsql as $$
declare
  edit timestamptz := sm8_ts(a->>'edit_date');
  live boolean := coalesce((a->>'active')::int, 1) = 1 and coalesce((a->>'activity_was_scheduled')::int, 0) = 1;
begin
  if sm8_blank(a->>'uuid') is null or sm8_blank(a->>'job_uuid') is null then return false; end if;
  if not exists (select 1 from jobs where sm8_uuid = a->>'job_uuid') then return false; end if;
  insert into sm8_bookings (sm8_uuid, job_sm8_uuid, staff_sm8_uuid, starts_at, ends_at, active, sm8_edit_date)
  values (a->>'uuid', a->>'job_uuid', sm8_blank(a->>'staff_uuid'), sm8_ts(a->>'start_date'), sm8_ts(a->>'end_date'), live, edit)
  on conflict (sm8_uuid) do update set
    job_sm8_uuid = excluded.job_sm8_uuid, staff_sm8_uuid = excluded.staff_sm8_uuid,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at, active = excluded.active,
    sm8_edit_date = excluded.sm8_edit_date
  where sm8_bookings.sm8_edit_date is null or excluded.sm8_edit_date is null or excluded.sm8_edit_date >= sm8_bookings.sm8_edit_date;
  return true;
end;
$$;

-- Applies one ServiceM8 job record (with the related company / folder / job contact when given).
-- Returns {outcome: applied|stale|skipped, job_no, actions: [...]}.
create or replace function sm8_upsert_job(j jsonb, rel jsonb default '{}'::jsonb) returns jsonb
language plpgsql as $$
declare
  job_no text := sm8_blank(j->>'generated_job_id');
  edit timestamptz := sm8_ts(j->>'edit_date');
  cur jobs%rowtype;
  new_status text := sm8_blank(j->>'status');
  folder text := sm8_blank(j->>'queue_uuid');
  folder_name text;
  client bigint;
  contact jsonb;
  kept text;
  keeper boolean := coalesce((select (value->>'folder_keeper')::boolean from settings where key = 'sm8_sync'), false);
  actions jsonb := '[]'::jsonb;
  existed boolean;
begin
  if job_no is null or sm8_blank(j->>'uuid') is null then return jsonb_build_object('outcome', 'skipped', 'reason', 'no job number'); end if;
  if not sm8_job_allowed(job_no) then return jsonb_build_object('outcome', 'skipped', 'job_no', job_no, 'reason', 'not in allow list'); end if;

  select * into cur from jobs where sm8_uuid = j->>'uuid' for update;
  existed := found;
  if existed and cur.sm8_edit_date is not null and edit is not null and edit < cur.sm8_edit_date then
    return jsonb_build_object('outcome', 'stale', 'job_no', job_no);
  end if;

  if rel ? 'company' and jsonb_typeof(rel->'company') = 'object' then perform sm8_upsert_client(rel->'company'); end if;
  if rel ? 'queue' and jsonb_typeof(rel->'queue') = 'object' then perform sm8_upsert_folder(rel->'queue'); end if;
  if rel ? 'Queue' and jsonb_typeof(rel->'Queue') = 'object' then perform sm8_upsert_folder(rel->'Queue'); end if;
  select c into contact from jsonb_array_elements(coalesce(rel->'jobContacts', '[]'::jsonb)) c where c->>'type' = 'JOB' limit 1;

  client := (select id from clients where sm8_uuid = sm8_blank(j->>'company_uuid'));
  if folder is not null then select name into folder_name from sm8_folders where sm8_uuid = folder; end if;

  -- Last kept folder: remembered whenever the job sits in one.
  kept := case when folder is not null and sm8_kept_folder(folder_name) then folder else cur.sm8_last_kept_folder_uuid end;

  if not existed then
    insert into jobs (sm8_uuid, job_no, sm8_status, sm8_folder_uuid, sm8_folder_expires, sm8_last_kept_folder_uuid,
                      sm8_po_number, sm8_invoice_total, sm8_booked_until, sm8_active, sm8_description, sm8_job_contact,
                      client_id, site_address, sm8_edit_date, stage, job_type_since, job_type_by, created_by)
    values (j->>'uuid', job_no, new_status, folder, sm8_ts(j->>'queue_expiry_date'), kept,
            sm8_blank(j->>'purchase_order_number'), nullif(j->>'total_invoice_amount', '')::numeric,
            sm8_ts(j->>'job_is_scheduled_until_stamp'), coalesce((j->>'active')::int, 1) = 1,
            sm8_blank(j->>'job_description'),
            case when contact is null then null else contact - 'job_uuid' - 'uuid' - 'type' end,
            client, sm8_blank(j->>'job_address'), edit, sm8_stage(new_status), now(), 'ServiceM8', 'ServiceM8')
    returning * into cur;
  else
    if cur.sm8_status is distinct from new_status then
      insert into job_moves (job_id, kind, source, from_value, to_value, by) values (cur.id, 'status', 'sm8', cur.sm8_status, new_status, 'ServiceM8');
    end if;
    if cur.sm8_folder_uuid is distinct from folder then
      insert into job_moves (job_id, kind, source, from_value, to_value, by) values (cur.id, 'folder', 'sm8', cur.sm8_folder_uuid, folder, 'ServiceM8');
    end if;
    update jobs set
      sm8_status = new_status, stage = sm8_stage(new_status),
      sm8_folder_uuid = folder, sm8_folder_expires = sm8_ts(j->>'queue_expiry_date'), sm8_last_kept_folder_uuid = kept,
      sm8_po_number = sm8_blank(j->>'purchase_order_number'),
      sm8_invoice_total = nullif(j->>'total_invoice_amount', '')::numeric,
      sm8_booked_until = sm8_ts(j->>'job_is_scheduled_until_stamp'),
      sm8_active = coalesce((j->>'active')::int, 1) = 1,
      sm8_description = sm8_blank(j->>'job_description'),
      sm8_job_contact = case when contact is null then jobs.sm8_job_contact else contact - 'job_uuid' - 'uuid' - 'type' end,
      client_id = coalesce(client, jobs.client_id),
      site_address = sm8_blank(j->>'job_address'),
      sm8_edit_date = coalesce(edit, jobs.sm8_edit_date),
      updated_by = 'ServiceM8'
    where id = cur.id
    returning * into cur;
  end if;

  -- Folder restore: a Work Order with no folder goes back to its last kept folder.
  if keeper and new_status = 'Work Order' and folder is null and kept is not null then
    actions := actions || jsonb_build_array(jsonb_build_object(
      'action', 'restore_folder', 'job_uuid', cur.sm8_uuid, 'job_no', job_no, 'folder_uuid', kept,
      'expires', to_char((now() + interval '1 year') at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS')));
    insert into job_moves (job_id, kind, source, from_value, to_value, note, by)
    values (cur.id, 'restore', 'auto', null, kept, 'Dropped out of its folder; put back', 'Hub');
  end if;

  return jsonb_build_object('outcome', 'applied', 'job_no', job_no, 'actions', actions);
end;
$$;

-- One ServiceM8 webhook event (the body n8n receives). Applied once per event id.
create or replace function sm8_apply_event(ev jsonb) returns jsonb
language plpgsql as $$
declare
  eid text := coalesce(sm8_blank(ev->>'id'), 'noid:' || md5(ev::text));
  typ text := coalesce(sm8_blank(ev->>'type'), sm8_blank(ev->>'triggerEvent'), 'unknown');
  d jsonb := coalesce(ev->'data', '{}'::jsonb);
  rel jsonb := coalesce(ev->'related', '{}'::jsonb);
  result jsonb;
begin
  insert into sm8_events (event_id, type, object_uuid, edit_date) values (eid, typ, d->>'uuid', sm8_ts(d->>'edit_date'))
  on conflict (event_id) do nothing;
  if not found then return jsonb_build_object('outcome', 'duplicate', 'event_id', eid); end if;

  if typ like 'company.%' then
    perform sm8_upsert_client(d);
    result := jsonb_build_object('outcome', 'applied', 'client', d->>'name');
  elsif typ like 'job.%' then
    result := sm8_upsert_job(d, rel);
  else
    result := jsonb_build_object('outcome', 'ignored', 'type', typ);
  end if;
  update sm8_events set outcome = result->>'outcome' where event_id = eid;
  return result || jsonb_build_object('event_id', eid, 'type', typ, 'actions', coalesce(result->'actions', '[]'::jsonb));
end;
$$;

-- A batch of records from the 5-minute / nightly reads. kind: folder, client, contact, staff,
-- booking, job. Returns counts and any actions (folder restores) for n8n to carry out.
create or replace function sm8_apply_records(kind text, rows jsonb) returns jsonb
language plpgsql as $$
declare
  r jsonb;
  res jsonb;
  n int := 0;
  applied int := 0;
  actions jsonb := '[]'::jsonb;
  i int := 0;
begin
  for r in select value from jsonb_array_elements(coalesce(rows, '[]'::jsonb)) loop
    n := n + 1;
    i := i + 1;
    case kind
      when 'folder' then perform sm8_upsert_folder(r, i); applied := applied + 1;
      when 'client' then perform sm8_upsert_client(r); applied := applied + 1;
      when 'contact' then perform sm8_upsert_contact(r); applied := applied + 1;
      when 'staff' then perform sm8_upsert_staff(r); applied := applied + 1;
      when 'booking' then if sm8_upsert_booking(r) then applied := applied + 1; end if;
      when 'job' then
        res := sm8_upsert_job(r);
        if res->>'outcome' = 'applied' then applied := applied + 1; end if;
        actions := actions || coalesce(res->'actions', '[]'::jsonb);
      else raise exception 'Unknown record kind: %', kind;
    end case;
  end loop;
  return jsonb_build_object('kind', kind, 'received', n, 'applied', applied, 'actions', actions);
end;
$$;
