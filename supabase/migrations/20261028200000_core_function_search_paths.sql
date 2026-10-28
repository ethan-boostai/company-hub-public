-- Supabase security report (cbs-hub-dev, 28/10/2026): pin the search_path of every function that
-- didn't have one, and lock the migration log like every other table.
alter table if exists schema_migrations enable row level security;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.settings_guard_sm8_sync() set search_path = public, pg_temp;

alter function cbs_sync.sm8_ts(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_blank(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_stage(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_kept_folder(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_job_allowed(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_write_allowed(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_client_allowed(text) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_folder(jsonb, int) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_client(jsonb, boolean) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_contact(jsonb) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_staff(jsonb) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_booking(jsonb) set search_path = public, pg_temp;
alter function cbs_sync.sm8_upsert_job(jsonb, jsonb) set search_path = public, pg_temp;
