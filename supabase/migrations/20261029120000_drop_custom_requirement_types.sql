-- Ethan (29/10/2026): no office-added requirement types. Only the built-in types in code
-- (src/lib/requirements.ts). Any task made from a custom type stays, as a plain one-off task.
update tasks set req_key = null, stage = null, is_repeat = false, repeat_no = null where req_key like 'custom:%';
delete from job_requirements where req_key like 'custom:%';
drop table if exists requirement_types;
