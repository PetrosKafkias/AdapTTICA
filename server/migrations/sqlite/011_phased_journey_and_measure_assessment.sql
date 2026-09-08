-- Phase-gated journey (per the reviewed "Regional Resilience Journey" user
-- journey doc): Ownership & Commitment becomes a real Phase 2 step, so
-- case_step_state's step list needs to grow. SQLite can't alter a CHECK
-- constraint in place, so the table is rebuilt.
create table case_step_state_new (
  case_id text not null references case_studies(id) on delete cascade,
  step text not null check (step in ('ownership', 'futures', 'vision', 'toc', 'options', 'pathways', 'compare', 'outcome')),
  status text not null default 'not_started' check (status in ('not_started', 'active', 'closed')),
  opened_by text references users(id),
  opened_at text,
  primary key (case_id, step)
);
insert into case_step_state_new select * from case_step_state;
drop table case_step_state;
alter table case_step_state_new rename to case_step_state;

-- Adaptation Options ("measures") get their own per-criterion assessment --
-- the doc is explicit that a Pathway's profile should be CALCULATED from
-- the measures it is built from, not re-assessed independently at the
-- pathway level (pathway_comparisons stays, now as the optional qualitative
-- "stakeholder discussion of the whole pathway" layer on top).
create table option_comparisons (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  option_id text not null references adaptation_options(id) on delete cascade,
  criterion text not null,
  score integer not null check (score between 1 and 5),
  justification text,
  rated_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (option_id, criterion, rated_by)
);
create index option_comparisons_case_idx on option_comparisons(case_id, option_id);
