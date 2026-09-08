-- Phase 1 "Prepare the Ground" must show the full RCCAP/P2R context the
-- journey doc lists: hazards, vulnerabilities, affected population/assets,
-- primary + linked systems, stakeholders, existing RCCAP measures and
-- evidence. Hazards, systems, stakeholders and evidence were already
-- derivable from existing relations, and system-wide vulnerabilities /
-- RCCAP priorities live on `systems` (seeded in 012). These two are the
-- impact-specific context that has no home yet -- "the impact IS the case"
-- in the journey doc, so its own baseline detail belongs here.
alter table impacts add column vulnerabilities text not null default '{}';
alter table impacts add column affected_assets text not null default '{}';
