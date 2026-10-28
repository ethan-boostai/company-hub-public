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
revoke all on function sm8_write_allowed(text) from public;

-- The ServiceM8 allow lists (settings key 'sm8_sync') can't be changed by the hub. A change needs the
-- session to opt in first, which only migrations and an approved direct change do:
--   set local cbs.allow_sync_settings = 'on';  (inside a transaction), then the update.
create or replace function settings_guard_sm8_sync() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('cbs.allow_sync_settings', true), '') <> 'on' then
    raise exception 'The ServiceM8 allow lists can only be changed by an approved migration.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger settings_sm8_sync_guard
  before update or delete on settings
  for each row when (old.key = 'sm8_sync') execute function settings_guard_sm8_sync();
create trigger settings_sm8_sync_guard_insert
  before insert on settings
  for each row when (new.key = 'sm8_sync') execute function settings_guard_sm8_sync();
