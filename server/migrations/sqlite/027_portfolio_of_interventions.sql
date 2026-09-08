-- "Design Portfolio of Interventions" (Phase 3, Tab 2) per the internal
-- methodology doc: its own 3 sub-tabs --
--   1. Formulate Adaptation Pathways -- an existing Pathway may now also
--      carry an image (a workshop diagram), same read-only-reference-image
--      pattern already used for the Theory of Change.
--   2. Evaluate Pathways -- a dedicated High/Medium/Low comparison across
--      six specific criteria (Risk reduction, Feasibility, Cost,
--      Co-benefits, Transformative potential, Flexibility), separate from
--      the existing 1-5 "Compare & Prioritise" criteria set, which stays as
--      it is.
--   3. Design portfolio of interventions -- one AFFiNE-produced
--      screenshot/image per case, visualizing how its pathways combine.

alter table pathways add column image_key text references uploads(id) on delete set null;

create table pathway_evaluations (
  id text primary key,
  pathway_id text not null references pathways(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  risk_reduction text not null check (risk_reduction in ('low', 'medium', 'high')),
  feasibility text not null check (feasibility in ('low', 'medium', 'high')),
  cost text not null check (cost in ('low', 'medium', 'high')),
  co_benefits text not null check (co_benefits in ('low', 'medium', 'high')),
  transformative_potential text not null check (transformative_potential in ('low', 'medium', 'high')),
  flexibility text not null check (flexibility in ('low', 'medium', 'high')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (pathway_id, user_id)
);

create index pathway_evaluations_pathway_idx on pathway_evaluations(pathway_id);

create table case_portfolio_images (
  case_id text primary key references case_studies(id) on delete cascade,
  image_key text references uploads(id) on delete set null,
  caption_el text not null default '',
  caption_en text not null default '',
  updated_by text references users(id),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
