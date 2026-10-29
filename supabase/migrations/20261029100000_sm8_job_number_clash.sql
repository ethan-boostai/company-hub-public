-- A ServiceM8 job whose number is already held in the hub by a different ServiceM8 job (e.g. a
-- seeded copy) used to stop the whole 5-minute batch with "duplicate key jobs_job_no_key". Now that
-- record is skipped with a reason and the rest of the batch is saved.
create or replace function cbs_sync.sm8_upsert_job(j jsonb, rel jsonb default '{}'::jsonb) returns jsonb
language plpgsql as $$
declare
  job_no text := cbs_sync.sm8_blank(j->>'generated_job_id');
  edit timestamptz := cbs_sync.sm8_ts(j->>'edit_date');
  cur jobs%rowtype;
  new_status text := cbs_sync.sm8_blank(j->>'status');
  folder text := cbs_sync.sm8_blank(j->>'queue_uuid');
  folder_name text;
  client bigint;
  contact jsonb;
  kept text;
  keeper boolean := coalesce((select (value->>'folder_keeper')::boolean from settings where key = 'sm8_sync'), false);
  actions jsonb := '[]'::jsonb;
  existed boolean;
begin
  if job_no is null or cbs_sync.sm8_blank(j->>'uuid') is null then return jsonb_build_object('outcome', 'skipped', 'reason', 'no job number'); end if;
  if not cbs_sync.sm8_job_allowed(job_no) then return jsonb_build_object('outcome', 'skipped', 'job_no', job_no, 'reason', 'not in allow list'); end if;

  select * into cur from jobs where sm8_uuid = j->>'uuid' for update;
  existed := found;
  -- Another ServiceM8 job already holds this job number in the hub: skip this record (and say so)
  -- rather than fail, so one clash never stops the rest of a batch.
  if not existed and exists (select 1 from jobs where jobs.job_no = cbs_sync.sm8_blank(j->>'generated_job_id')) then
    return jsonb_build_object('outcome', 'skipped', 'job_no', job_no, 'reason', 'job number already held by another ServiceM8 job');
  end if;
  if existed and cur.sm8_edit_date is not null and edit is not null and edit < cur.sm8_edit_date then
    return jsonb_build_object('outcome', 'stale', 'job_no', job_no);
  end if;

  if rel ? 'company' and jsonb_typeof(rel->'company') = 'object' and rel->'company'->>'uuid' = j->>'company_uuid' then
    perform cbs_sync.sm8_upsert_client(rel->'company', true);
  end if;
  if rel ? 'queue' and jsonb_typeof(rel->'queue') = 'object' then perform cbs_sync.sm8_upsert_folder(rel->'queue'); end if;
  if rel ? 'Queue' and jsonb_typeof(rel->'Queue') = 'object' then perform cbs_sync.sm8_upsert_folder(rel->'Queue'); end if;
  select c into contact from jsonb_array_elements(coalesce(rel->'jobContacts', '[]'::jsonb)) c where c->>'type' = 'JOB' limit 1;

  client := (select id from clients where sm8_uuid = cbs_sync.sm8_blank(j->>'company_uuid'));
  if folder is not null then select name into folder_name from sm8_folders where sm8_uuid = folder; end if;

  -- Last kept folder: remembered whenever the job sits in one.
  kept := case when folder is not null and cbs_sync.sm8_kept_folder(folder_name) then folder else cur.sm8_last_kept_folder_uuid end;

  if not existed then
    insert into jobs (sm8_uuid, job_no, sm8_status, sm8_folder_uuid, sm8_folder_expires, sm8_last_kept_folder_uuid,
                      sm8_po_number, sm8_invoice_total, sm8_booked_until, sm8_active, sm8_description, sm8_job_contact,
                      client_id, sm8_company_uuid, site_address, sm8_edit_date, stage, job_type_since, job_type_by, created_by)
    values (j->>'uuid', job_no, new_status, folder, cbs_sync.sm8_ts(j->>'queue_expiry_date'), kept,
            cbs_sync.sm8_blank(j->>'purchase_order_number'), nullif(j->>'total_invoice_amount', '')::numeric,
            cbs_sync.sm8_ts(j->>'job_is_scheduled_until_stamp'), coalesce((j->>'active')::int, 1) = 1,
            cbs_sync.sm8_blank(j->>'job_description'),
            case when contact is null then null else contact - 'job_uuid' - 'uuid' - 'type' end,
            client, cbs_sync.sm8_blank(j->>'company_uuid'), cbs_sync.sm8_blank(j->>'job_address'), edit, cbs_sync.sm8_stage(new_status), now(), 'ServiceM8', 'ServiceM8')
    returning * into cur;
  else
    if cur.sm8_status is distinct from new_status then
      insert into job_moves (job_id, kind, source, from_value, to_value, by) values (cur.id, 'status', 'sm8', cur.sm8_status, new_status, 'ServiceM8');
    end if;
    if cur.sm8_folder_uuid is distinct from folder then
      insert into job_moves (job_id, kind, source, from_value, to_value, by) values (cur.id, 'folder', 'sm8', cur.sm8_folder_uuid, folder, 'ServiceM8');
    end if;
    update jobs set
      sm8_status = new_status, stage = cbs_sync.sm8_stage(new_status),
      sm8_folder_uuid = folder, sm8_folder_expires = cbs_sync.sm8_ts(j->>'queue_expiry_date'), sm8_last_kept_folder_uuid = kept,
      sm8_po_number = cbs_sync.sm8_blank(j->>'purchase_order_number'),
      sm8_invoice_total = nullif(j->>'total_invoice_amount', '')::numeric,
      sm8_booked_until = cbs_sync.sm8_ts(j->>'job_is_scheduled_until_stamp'),
      sm8_active = coalesce((j->>'active')::int, 1) = 1,
      sm8_description = cbs_sync.sm8_blank(j->>'job_description'),
      sm8_job_contact = case when contact is null then jobs.sm8_job_contact else contact - 'job_uuid' - 'uuid' - 'type' end,
      client_id = coalesce(client, jobs.client_id),
      sm8_company_uuid = coalesce(cbs_sync.sm8_blank(j->>'company_uuid'), jobs.sm8_company_uuid),
      site_address = cbs_sync.sm8_blank(j->>'job_address'),
      sm8_edit_date = coalesce(edit, jobs.sm8_edit_date),
      updated_by = 'ServiceM8'
    where id = cur.id
    returning * into cur;
  end if;

  -- Folder restore: a Work Order with no folder goes back to its last kept folder.
  if keeper and new_status = 'Work Order' and folder is null and kept is not null and cbs_sync.sm8_write_allowed(job_no) then
    actions := actions || jsonb_build_array(jsonb_build_object(
      'action', 'restore_folder', 'job_uuid', cur.sm8_uuid, 'job_no', job_no, 'folder_uuid', kept,
      'expires', to_char((now() + interval '1 year') at time zone 'Europe/London', 'YYYY-MM-DD HH24:MI:SS')));
    insert into job_moves (job_id, kind, source, from_value, to_value, note, by)
    values (cur.id, 'restore', 'auto', null, kept, 'Dropped out of its folder; put back', 'Hub');
  end if;

  return jsonb_build_object('outcome', 'applied', 'job_no', job_no, 'actions', actions);
end;
$$;


alter function cbs_sync.sm8_upsert_job(jsonb, jsonb) set search_path = public, pg_temp;
