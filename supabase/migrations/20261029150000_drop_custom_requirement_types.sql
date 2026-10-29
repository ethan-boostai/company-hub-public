-- Ethan (29/10/2026): no office-added requirement types. Only the built-in types in code
-- (src/lib/requirements.ts). Any task made from a custom type stays, as a plain one-off task.
-- Renamed from 20261029120000_drop_custom_requirement_types.sql, which clashed with
-- 20261029120000_registers_upload_folders.sql. It only ever ran on the dev database; the last line
-- takes that old name out of the migration history (a no-op anywhere else).
update tasks set req_key = null, stage = null, is_repeat = false, repeat_no = null where req_key like 'custom:%';
delete from job_requirements where req_key like 'custom:%';
drop table if exists requirement_types;
delete from schema_migrations where name = '20261029120000_drop_custom_requirement_types.sql';
