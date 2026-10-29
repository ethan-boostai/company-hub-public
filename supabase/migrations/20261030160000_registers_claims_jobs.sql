-- Registers: link claims to jobs (Ethan, 30/10/2026: once jobs are on main). Additive only.
-- Claims kept the ServiceM8 job number as text (job_no); now they also point at the job itself.
-- job_no stays: it's what the old hub stored, and it still reads for a job the hub doesn't hold.

alter table claims add column job_id bigint references jobs(id) on delete set null;
create index claims_job on claims (job_id);

-- Claims already saved with a job number that the hub knows.
update claims c set job_id = j.id from jobs j where c.job_id is null and c.job_no is not null and j.job_no = c.job_no;
