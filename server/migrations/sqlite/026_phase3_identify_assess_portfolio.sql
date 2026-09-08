-- Phase 3 redesign: Identify & Assess Adaptation Options (Tab 1) and a
-- categorised Portfolio (the existing "pathways" step, which already lets a
-- coordinator combine several Adaptation Options into one named, ordered
-- group -- reused here rather than duplicated, just extended with a
-- per-option category tag).

-- An Adaptation Option is either a fixed reference measure (from the 2020
-- PESPKA assessment) or a stakeholder-proposed one. Reference measures carry
-- a single read-only evidence blob (kept as one JSON column rather than a
-- dozen -- the field list is long and specific to PESPKA, and nothing else
-- reads these fields individually) and are never edited by a stakeholder.
alter table adaptation_options add column source text not null default 'stakeholder'
  check (source in ('pespka', 'stakeholder'));
alter table adaptation_options add column time_horizon text
  check (time_horizon in ('short', 'long') or time_horizon is null);
alter table adaptation_options add column pespka_evidence text;
-- Only a shortlisted option moves from "should we consider this?" (Step 1)
-- to "how strong is this?" (Step 2) -- a Coordinator/Admin call, the same
-- curator-only pattern already used for review-status style toggles.
alter table adaptation_options add column shortlisted integer not null default 0;

-- Step 1's "Support" action: "this is relevant and worth considering", never
-- "this is the best option" -- a plain yes/no per user, not the
-- agree/disagree pair adaptation_options already carries for other content
-- types, since that pair reads as approve/reject of the whole measure.
create table option_supports (
  option_id text not null references adaptation_options(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (option_id, user_id)
);

-- Step 2's structured assessment: one row per stakeholder per option, four
-- Low/Medium/High criteria plus the separate (non-numeric) robustness
-- question, upserted as the same person re-assesses.
create table option_assessments (
  id text primary key,
  option_id text not null references adaptation_options(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  effectiveness text not null check (effectiveness in ('low', 'medium', 'high')),
  feasibility text not null check (feasibility in ('low', 'medium', 'high')),
  co_benefits text not null check (co_benefits in ('low', 'medium', 'high')),
  transformative_potential text not null check (transformative_potential in ('low', 'medium', 'high')),
  robust_across_futures text not null check (robust_across_futures in ('most', 'some', 'dependent')),
  comment text not null default '',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (option_id, user_id)
);

create index option_supports_option_idx on option_supports(option_id);
create index option_assessments_option_idx on option_assessments(option_id);

-- The Portfolio groups complementary interventions by type (Knowledge,
-- Planning, Capacity Building, Governance, Nature-based, Infrastructure,
-- Behavioural/Social) -- a tag on each option's membership in a pathway's
-- sequence, not a new table, since "pathways" already is that
-- combine-into-one-named-group mechanism.
alter table pathway_options add column category text;
