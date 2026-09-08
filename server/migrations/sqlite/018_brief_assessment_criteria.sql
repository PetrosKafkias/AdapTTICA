-- The assessment brief defines its own initial criteria set and states that
-- the criteria "may change in the future" and should not be unnecessarily
-- hard-coded. The original table pinned the ten-criterion vocabulary in a
-- CHECK constraint, so every future change to the list would need a schema
-- migration and would reject scores written by a newer application build.
--
-- Rebuild the table with the criterion left open, keeping the application's
-- exported list (server/src/lib/comparisonCriteria.js) as the single source
-- of truth. The score bound and every key/foreign key are preserved.

create table pathway_comparisons_new (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  pathway_id text not null references pathways(id) on delete cascade,
  criterion text not null,
  score integer not null check (score between 1 and 5),
  rated_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  justification text,
  unique (pathway_id, criterion, rated_by)
);

insert into pathway_comparisons_new (id, case_id, pathway_id, criterion, score, rated_by, created_at, justification)
  select id, case_id, pathway_id, criterion, score, rated_by, created_at, justification from pathway_comparisons;

drop table pathway_comparisons;
alter table pathway_comparisons_new rename to pathway_comparisons;
create index pathway_comparisons_pathway_idx on pathway_comparisons(pathway_id, criterion);
