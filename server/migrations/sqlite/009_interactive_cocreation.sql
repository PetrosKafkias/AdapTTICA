-- Real role-based co-creation interactivity: bring Alternative Futures up
-- to the same propose/reply/agree-disagree/merge pattern Vision Elements
-- and Adaptation Options already have; add Coordinator curation actions
-- (highlight, group, mark ready) that were previously merge-only; add a
-- Shared Vision record distinct from the raw Vision Elements it's built
-- from; add per-case step activation state (the Coordinator "opens"/
-- "closes" an activity, participants see what's currently active); add
-- Baseline comments/suggestions; add an optional justification to pathway
-- comparison ratings.

alter table alternative_futures add column status text not null default 'proposed'
  check (status in ('proposed', 'merged', 'archived'));
alter table alternative_futures add column merged_into_id text references alternative_futures(id);
alter table alternative_futures add column highlighted integer not null default 0;
alter table alternative_futures add column group_label text;

create table future_replies (
  id text primary key,
  future_id text not null references alternative_futures(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table future_votes (
  future_id text not null references alternative_futures(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value text not null check (value in ('agree', 'disagree')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (future_id, user_id)
);

create index future_replies_future_idx on future_replies(future_id, created_at);

alter table vision_elements add column highlighted integer not null default 0;
alter table vision_elements add column group_label text;
alter table vision_elements add column include_in_synthesis integer not null default 0;

alter table adaptation_options add column highlighted integer not null default 0;
alter table adaptation_options add column group_label text;
alter table adaptation_options add column ready_for_pathway integer not null default 0;

-- The Shared Vision is a distinct published artifact "built from" a
-- selection of Vision Elements -- not the elements themselves, and not a
-- single freeform text field the Coordinator fills in independently.
create table shared_visions (
  id text primary key,
  case_id text unique not null references case_studies(id) on delete cascade,
  summary_el text not null default '',
  summary_en text not null default '',
  source_element_ids text not null default '[]',
  published_by text not null references users(id),
  published_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The Coordinator opens/closes each step as a live activity; Participants
-- see which step is currently active rather than every step always being
-- equally "on". Baseline has no row (always read/comment-only, never
-- gated) -- every other step defaults to 'not_started' until opened.
create table case_step_state (
  case_id text not null references case_studies(id) on delete cascade,
  step text not null check (step in ('futures', 'vision', 'toc', 'options', 'pathways', 'compare', 'outcome')),
  status text not null default 'not_started' check (status in ('not_started', 'active', 'closed')),
  opened_by text references users(id),
  opened_at text,
  primary key (case_id, step)
);

create table baseline_comments (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  is_suggestion integer not null default 0,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index baseline_comments_case_idx on baseline_comments(case_id, created_at);

alter table pathway_comparisons add column justification text;
