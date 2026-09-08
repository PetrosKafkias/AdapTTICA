-- Connect the user journey: System -> Impact -> Case Study -> Visioning ->
-- Pathway (see the approved plan). The previous pass's Challenge entity is
-- split in two: Challenge is renamed to Impact and becomes a pure,
-- admin-managed taxonomy entry (System x Impact) with no content of its
-- own, same tier as Hazards; the co-creation content it used to own
-- (Alternative Futures, Vision Elements, Theory of Change, Pathways) moves
-- to the Case Study, the platform's one collaborative workspace.
--
-- No production data is at stake: everything in these tables is demo/seed
-- content created and cleaned up during development. Tables whose foreign
-- key target changes (challenge_id -> case_id) are dropped and recreated
-- rather than altered in place, since SQLite can rename columns/tables but
-- cannot repoint a foreign key's target table via ALTER TABLE.

-- 1. Rename Challenge -> Impact. Simple renames only; SQLite automatically
--    rewrites the `references challenges(id)` clauses of dependent tables
--    to `references impacts(id)` as part of `RENAME TO`.
alter table challenges rename to impacts;
alter table challenge_hazards rename to impact_hazards;
alter table impact_hazards rename column challenge_id to impact_id;
alter table challenge_linked_systems rename to impact_linked_systems;
alter table impact_linked_systems rename column challenge_id to impact_id;
alter table case_studies rename column challenge_id to impact_id;

drop index if exists challenges_system_idx;
create index impacts_system_idx on impacts(system_id, updated_at desc);
drop index if exists case_studies_challenge_idx;
create index case_studies_impact_idx on case_studies(impact_id);

-- 2. A Case Study's own hazard tags and linked systems -- may differ from
--    its Impact's typical tags for this specific local case.
create table case_hazards (
  case_id text not null references case_studies(id) on delete cascade,
  hazard_id text not null references hazards(id) on delete cascade,
  primary key (case_id, hazard_id)
);

create table case_linked_systems (
  case_id text not null references case_studies(id) on delete cascade,
  system_id text not null references systems(id) on delete cascade,
  primary key (case_id, system_id)
);

-- 3. Drop and recreate the co-creation tables, re-scoped to case_id instead
--    of challenge_id (demo/test data only -- nothing to migrate).
drop table if exists vision_element_votes;
drop table if exists vision_element_replies;
drop table if exists vision_elements;
drop table if exists alternative_futures;
drop table if exists theory_of_change_entries;
drop table if exists pathway_comparisons;
drop table if exists pathway_comments;
drop table if exists pathway_linked_systems;
drop table if exists pathway_options;
drop table if exists pathways;
drop table if exists adaptation_options;

create table alternative_futures (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  title text not null,
  description text not null default '{}',
  benefits text not null default '{}',
  barriers text not null default '{}',
  trade_offs text not null default '{}',
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- A vision element is the actual co-creation unit: a proposed idea,
-- alternative, or standalone vision statement. future_id is nullable so
-- elements can be proposed directly under a Case Study before any
-- Alternative Future exists yet.
create table vision_elements (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  future_id text references alternative_futures(id) on delete set null,
  author_id text not null references users(id),
  body text not null,
  status text not null default 'proposed'
    check (status in ('proposed', 'merged', 'archived')),
  merged_into_id text references vision_elements(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table vision_element_replies (
  id text primary key,
  vision_element_id text not null references vision_elements(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table vision_element_votes (
  vision_element_id text not null references vision_elements(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value text not null check (value in ('agree', 'disagree')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (vision_element_id, user_id)
);

create table theory_of_change_entries (
  id text primary key,
  case_id text unique not null references case_studies(id) on delete cascade,
  current_state text not null default '{}',
  desired_future text not null default '{}',
  required_transformations text not null default '{}',
  intermediate_outcomes text not null default '{}',
  enabling_conditions text not null default '{}',
  updated_by text not null references users(id),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Step 5: Adaptation Options, proposed and discussed the same way as
-- Futures and Vision Elements. Inherits the case's own primary
-- system/impact/hazards rather than re-tagging each option individually
-- with the same facts (see plan for this trim's rationale).
create table adaptation_options (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  author_id text not null references users(id),
  title text not null,
  description text not null default '{}',
  benefits text not null default '{}',
  barriers text not null default '{}',
  enabling_conditions text not null default '{}',
  co_benefits text not null default '{}',
  trade_offs text not null default '{}',
  maladaptation_risks text not null default '{}',
  transformative_potential text not null default '{}',
  status text not null default 'proposed'
    check (status in ('proposed', 'merged', 'archived')),
  merged_into_id text references adaptation_options(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table pathways (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  title text not null,
  short_description text not null default '{}',
  time_horizon text,
  primary_system_id text references systems(id),
  relevant_hazards text not null default '[]',
  relevant_impacts text not null default '{}',
  sequence_of_interventions text not null default '{}',
  enabling_conditions text not null default '{}',
  decision_points text not null default '{}',
  dependencies text not null default '{}',
  trade_offs text not null default '{}',
  maladaptation_risks text not null default '{}',
  transformative_potential text not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'under_discussion', 'preferred', 'combined', 'archived')),
  combined_from text,
  direction_summary text,
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Step 6: assemble a pathway by selecting and sequencing existing
-- Adaptation Options.
create table pathway_options (
  pathway_id text not null references pathways(id) on delete cascade,
  option_id text not null references adaptation_options(id) on delete cascade,
  sort_order integer not null default 0,
  primary key (pathway_id, option_id)
);

create table pathway_linked_systems (
  pathway_id text not null references pathways(id) on delete cascade,
  system_id text not null references systems(id) on delete cascade,
  primary key (pathway_id, system_id)
);

create table pathway_comments (
  id text primary key,
  pathway_id text not null references pathways(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Step 7: Compare and Prioritise. Ten criteria per the reviewed spec.
create table pathway_comparisons (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  pathway_id text not null references pathways(id) on delete cascade,
  criterion text not null check (criterion in (
    'effectiveness', 'feasibility', 'transformative_potential',
    'inclusiveness', 'stakeholder_support', 'co_benefits', 'trade_off_risk',
    'maladaptation_risk', 'long_term_resilience', 'cross_system_contribution'
  )),
  score integer not null check (score between 1 and 5),
  rated_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (pathway_id, criterion, rated_by)
);

create index alternative_futures_case_idx on alternative_futures(case_id, created_at);
create index vision_elements_case_idx on vision_elements(case_id, created_at);
create index vision_elements_future_idx on vision_elements(future_id, created_at);
create index vision_element_replies_element_idx on vision_element_replies(vision_element_id, created_at);
create index adaptation_options_case_idx on adaptation_options(case_id, created_at);
create index pathways_case_idx on pathways(case_id, updated_at desc);
create index pathway_options_pathway_idx on pathway_options(pathway_id, sort_order);
create index pathway_comments_pathway_idx on pathway_comments(pathway_id, created_at);
create index pathway_comparisons_pathway_idx on pathway_comparisons(pathway_id, criterion);

-- 4. System Overview "Where Are We Now?" free text -- admin-editable, kept
--    thin per the review's own instruction not to build a new
--    risk-assessment workflow.
alter table systems add column description text;
alter table systems add column key_vulnerabilities text;
alter table systems add column rccap_priorities text;
