-- A client loaded after its job (the 5-minute read does jobs first) was never linked to that job.
-- Saving a client now links every held job whose ServiceM8 client it is.
create or replace function cbs_sync.sm8_upsert_client(c jsonb, for_job boolean default false) returns bigint
language plpgsql as $$
declare
  cid bigint;
  edit timestamptz := cbs_sync.sm8_ts(c->>'edit_date');
begin
  if cbs_sync.sm8_blank(c->>'uuid') is null then return null; end if;
  if not for_job and not cbs_sync.sm8_client_allowed(c->>'uuid') then return null; end if;
  insert into clients (sm8_uuid, name, address, phone, email, active, sm8_edit_date, created_by)
  values (c->>'uuid', coalesce(cbs_sync.sm8_blank(c->>'name'), '(no name)'), cbs_sync.sm8_blank(c->>'address'),
          cbs_sync.sm8_blank(c->>'phone'), cbs_sync.sm8_blank(c->>'email'), coalesce((c->>'active')::int, 1) = 1, edit, 'ServiceM8')
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
  -- Jobs are read before clients, so link any held job that names this client.
  update jobs set client_id = cid where sm8_company_uuid = c->>'uuid' and client_id is distinct from cid;
  return cid;
end;
$$;


alter function cbs_sync.sm8_upsert_client(jsonb, boolean) set search_path = public, pg_temp;
