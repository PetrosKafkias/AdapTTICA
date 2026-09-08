-- One persisted P2R journey per Case Study / Climate Impact.
-- Phase status is independent from navigation and can only be changed by
-- the Coordinator or an Administrator through the API.
create table case_phase_state (
  case_id text not null references case_studies(id) on delete cascade,
  phase text not null check (phase in ('phase1', 'phase2', 'phase3')),
  status text not null check (status in ('locked', 'upcoming', 'current', 'completed')),
  updated_by text references users(id),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (case_id, phase)
);

insert into case_phase_state (case_id, phase, status)
select id, 'phase1', 'completed' from case_studies where deleted_at is null;
insert into case_phase_state (case_id, phase, status)
select id, 'phase2', 'current' from case_studies where deleted_at is null;
insert into case_phase_state (case_id, phase, status)
select id, 'phase3', 'locked' from case_studies where deleted_at is null;

-- A real phase-scoped forum. Replies remain attached to their parent and the
-- phase check prevents a comment from drifting into a different discussion.
create table phase_forum_comments (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  phase text not null check (phase in ('phase1', 'phase2', 'phase3')),
  parent_id text references phase_forum_comments(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
create index phase_forum_case_phase_idx on phase_forum_comments(case_id, phase, created_at);
create index phase_forum_parent_idx on phase_forum_comments(parent_id, created_at);

insert into phase_forum_comments (id, case_id, phase, author_id, body, created_at)
select id, case_id, case when section = 'baseline' then 'phase1' else 'phase2' end, author_id, body, created_at
from section_comments where section in ('baseline', 'toc');

-- Phase 2 uses one prioritisation mechanism: each user selects one
-- Alternative Future, and can replace that selection later.
create table future_prioritisations (
  case_id text not null references case_studies(id) on delete cascade,
  future_id text not null references alternative_futures(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (case_id, user_id)
);
create index future_prioritisations_future_idx on future_prioritisations(future_id);

-- Remove the obsolete standalone ownership activity from the persisted step
-- model as well as the UI/API.
create table case_step_state_simplified (
  case_id text not null references case_studies(id) on delete cascade,
  step text not null check (step in ('futures', 'vision', 'toc', 'options', 'pathways', 'compare', 'outcome')),
  status text not null default 'not_started' check (status in ('not_started', 'active', 'closed')),
  opened_by text references users(id),
  opened_at text,
  primary key (case_id, step)
);
insert into case_step_state_simplified
select case_id, step, status, opened_by, opened_at from case_step_state where step <> 'ownership';
drop table case_step_state;
alter table case_step_state_simplified rename to case_step_state;
