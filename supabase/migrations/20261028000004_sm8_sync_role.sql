-- A database login for n8n that can do three things: run the two ServiceM8 sync functions and
-- read where the 5-minute read got to. Nothing else:
--  * no rights on any table, and no access to the public schema at all;
--  * it can't create anything; a short statement timeout; at most 5 connections.
-- Created without a password (NOLOGIN); Ethan turns the login on with a password he chooses
-- (README "ServiceM8 sync"). The three functions are in cbs_sync, which the Supabase API doesn't
-- expose, and run with the owner's rights (security definer) and a fixed search_path.
-- On Supabase migrations run as "postgres", which can create roles but isn't a superuser, so it
-- can't name the SUPERUSER attribute at all. A new role is never a superuser; the check below
-- stops the migration if this one somehow is.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cbs_n8n_sync') then
    create role cbs_n8n_sync nologin noinherit nocreatedb nocreaterole noreplication nobypassrls connection limit 5;
  end if;
end $$;
alter role cbs_n8n_sync nologin noinherit nocreatedb nocreaterole noreplication nobypassrls connection limit 5;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'cbs_n8n_sync' and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then
    raise exception 'cbs_n8n_sync must not be a superuser or have any admin rights';
  end if;
end $$;
alter role cbs_n8n_sync set statement_timeout = '15s';
alter role cbs_n8n_sync set idle_in_transaction_session_timeout = '30s';

alter function cbs_sync.sm8_apply_event(jsonb) security definer set search_path = public, pg_temp;
alter function cbs_sync.sm8_apply_records(text, jsonb) security definer set search_path = public, pg_temp;
alter function cbs_sync.sm8_sync_since(text) security definer set search_path = public, pg_temp;

-- Nothing in cbs_sync can be run or read by anyone but its owner, except the three functions
-- below for cbs_n8n_sync. Supabase's API roles are named too (they only exist on Supabase).
do $$
declare
  r text;
begin
  revoke all on all functions in schema cbs_sync from public;
  revoke all on all tables in schema cbs_sync from public;
  revoke all on schema cbs_sync from public;
  alter default privileges in schema cbs_sync revoke all on functions from public;
  foreach r in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all functions in schema cbs_sync from %I', r);
      execute format('revoke all on all tables in schema cbs_sync from %I', r);
      execute format('revoke all on schema cbs_sync from %I', r);
      execute format('alter default privileges in schema cbs_sync revoke all on functions from %I', r);
      execute format('alter default privileges in schema cbs_sync revoke all on tables from %I', r);
    end if;
  end loop;
end $$;

grant usage on schema cbs_sync to cbs_n8n_sync;
grant execute on function cbs_sync.sm8_apply_event(jsonb) to cbs_n8n_sync;
grant execute on function cbs_sync.sm8_apply_records(text, jsonb) to cbs_n8n_sync;
grant execute on function cbs_sync.sm8_sync_since(text) to cbs_n8n_sync;

-- No CREATE anywhere, and no way into the public schema.
revoke create on schema public from public, cbs_n8n_sync;
revoke all on schema public from cbs_n8n_sync;
revoke create on schema cbs_sync from cbs_n8n_sync;

-- The ServiceM8 allow list (settings key 'sm8_sync') can't be changed by the hub. A change needs the
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
