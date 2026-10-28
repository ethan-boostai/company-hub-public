-- A database login for n8n that can do one thing: run the two ServiceM8 sync functions.
-- It can't read or change any table directly. Created without a password (NOLOGIN); Ethan turns it
-- on once with a password he chooses (see README "ServiceM8 sync"). The functions run with the owner's
-- rights (security definer) and a fixed search_path.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cbs_n8n_sync') then
    create role cbs_n8n_sync nologin;
  end if;
end $$;

alter function sm8_apply_event(jsonb) security definer set search_path = public, pg_temp;
alter function sm8_apply_records(text, jsonb) security definer set search_path = public, pg_temp;

revoke all on function sm8_apply_event(jsonb) from public;
revoke all on function sm8_apply_records(text, jsonb) from public;
grant usage on schema public to cbs_n8n_sync;
grant execute on function sm8_apply_event(jsonb) to cbs_n8n_sync;
grant execute on function sm8_apply_records(text, jsonb) to cbs_n8n_sync;

-- The helper functions are only called from inside the two above (or by the app's own login).
revoke all on function sm8_upsert_job(jsonb, jsonb), sm8_upsert_client(jsonb), sm8_upsert_contact(jsonb),
  sm8_upsert_staff(jsonb), sm8_upsert_booking(jsonb), sm8_upsert_folder(jsonb, int) from public;
