-- Hazard type (Ethan, 30/10/2026): one hazards library, each hazard either a Workplace hazard (the
-- old hub's hazard register: lead, legionella, stress, driving …) or a Task hazard (the RAMS
-- builder's list). The RAMS picker shows Task hazards by default; the Hazards page filters by type.
-- Everything in the library today came from the RAMS builder's list, so it starts as Task.
-- At switch-over, live's register is imported as Workplace. Additive only.
alter table hazards add column hazard_type text not null default 'task'
  check (hazard_type in ('workplace', 'task'));
create index hazards_type on hazards (hazard_type) where status = 'active';
