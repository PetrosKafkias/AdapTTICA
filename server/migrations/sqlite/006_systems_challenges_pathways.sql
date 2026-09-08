-- Priority Systems / Challenges / Pathways restructuring (Pentsiou review
-- comments, see the approved plan). Adds the P2R-aligned information
-- architecture on top of the existing case-study-centric model: Systems and
-- Hazards are a fixed taxonomy; a Challenge (System x Impact) is the new
-- top-level unit that Alternative Futures / Vision Elements / Theory of
-- Change / Pathways attach to; Case Studies stay as they are and gain an
-- optional link down into a Challenge.

create table systems (
  id text primary key,
  key text unique not null,
  name text not null,
  icon_key text not null default 'layers',
  is_horizontal integer not null default 0,
  sort_order integer not null default 0
);

create table hazards (
  id text primary key,
  key text unique not null,
  name text not null,
  sort_order integer not null default 0
);

create table challenges (
  id text primary key,
  system_id text not null references systems(id),
  title text not null,
  description text not null default '{}',
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table challenge_hazards (
  challenge_id text not null references challenges(id) on delete cascade,
  hazard_id text not null references hazards(id) on delete cascade,
  primary key (challenge_id, hazard_id)
);

-- The challenge's own system_id is the *primary* system; rows here are the
-- other systems it also affects ("linked/affected systems").
create table challenge_linked_systems (
  challenge_id text not null references challenges(id) on delete cascade,
  system_id text not null references systems(id) on delete cascade,
  primary key (challenge_id, system_id)
);

alter table case_studies add column challenge_id text references challenges(id);

create table alternative_futures (
  id text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
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
-- elements can be proposed directly under a Challenge before any
-- Alternative Future exists yet (comment #9's "smaller vision elements"
-- step that precedes settling on a future).
create table vision_elements (
  id text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
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
  challenge_id text unique not null references challenges(id) on delete cascade,
  current_state text not null default '{}',
  desired_future text not null default '{}',
  required_transformations text not null default '{}',
  intermediate_outcomes text not null default '{}',
  enabling_conditions text not null default '{}',
  updated_by text not null references users(id),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table pathways (
  id text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
  title text not null,
  short_description text not null default '{}',
  primary_system_id text references systems(id),
  relevant_hazards text not null default '[]',
  relevant_impacts text not null default '{}',
  adaptation_options text not null default '{}',
  enabling_conditions text not null default '{}',
  decision_points text not null default '{}',
  trade_offs text not null default '{}',
  transformative_potential text not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'under_discussion', 'preferred', 'archived')),
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
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

create table pathway_comparisons (
  id text primary key,
  challenge_id text not null references challenges(id) on delete cascade,
  pathway_id text not null references pathways(id) on delete cascade,
  criterion text not null check (criterion in (
    'effectiveness', 'feasibility', 'transformative_potential',
    'inclusiveness', 'stakeholder_support', 'co_benefits', 'trade_off_risk'
  )),
  score integer not null check (score between 1 and 5),
  rated_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  unique (pathway_id, criterion, rated_by)
);

create index challenges_system_idx on challenges(system_id, updated_at desc);
create index case_studies_challenge_idx on case_studies(challenge_id);
create index alternative_futures_challenge_idx on alternative_futures(challenge_id, created_at);
create index vision_elements_challenge_idx on vision_elements(challenge_id, created_at);
create index vision_elements_future_idx on vision_elements(future_id, created_at);
create index vision_element_replies_element_idx on vision_element_replies(vision_element_id, created_at);
create index pathways_challenge_idx on pathways(challenge_id, updated_at desc);
create index pathway_comments_pathway_idx on pathway_comments(pathway_id, created_at);
create index pathway_comparisons_pathway_idx on pathway_comparisons(pathway_id, criterion);

-- Fixed taxonomy seed data. Ids are stable, hand-written UUIDs (not
-- crypto.randomUUID()) so this migration is deterministic/idempotent to
-- read, matching how every other reference in this file is a fixed string.
insert into systems (id, key, name, icon_key, is_horizontal, sort_order) values
  ('00000000-0000-4000-8000-000000000001', 'water', '{"el":"Ύδατα","en":"Water"}', 'droplets', 0, 1),
  ('00000000-0000-4000-8000-000000000002', 'forest_ecosystems', '{"el":"Δασικά Οικοσυστήματα & Βιοποικιλότητα","en":"Forest Ecosystems & Biodiversity"}', 'trees', 0, 2),
  ('00000000-0000-4000-8000-000000000003', 'health', '{"el":"Υγεία","en":"Health"}', 'heart-pulse', 0, 3),
  ('00000000-0000-4000-8000-000000000004', 'built_environment', '{"el":"Δομημένο Περιβάλλον","en":"Built Environment"}', 'building-2', 0, 4),
  ('00000000-0000-4000-8000-000000000005', 'transport', '{"el":"Μεταφορές","en":"Transport"}', 'train-front', 0, 5),
  ('00000000-0000-4000-8000-000000000006', 'energy', '{"el":"Ενέργεια","en":"Energy"}', 'zap', 0, 6),
  ('00000000-0000-4000-8000-000000000007', 'tourism', '{"el":"Τουρισμός","en":"Tourism"}', 'palmtree', 0, 7),
  ('00000000-0000-4000-8000-000000000008', 'coastal_zones', '{"el":"Παράκτιες Ζώνες","en":"Coastal Zones"}', 'waves', 0, 8),
  ('00000000-0000-4000-8000-000000000009', 'agriculture_livestock', '{"el":"Γεωργία & Κτηνοτροφία","en":"Agriculture & Livestock"}', 'wheat', 0, 9),
  ('00000000-0000-4000-8000-000000000010', 'emergency_response', '{"el":"Πολιτική Προστασία / Επείγουσα Ανταπόκριση","en":"Emergency Response / Civil Protection"}', 'siren', 1, 10);

insert into hazards (id, key, name, sort_order) values
  ('00000000-0000-4000-9000-000000000001', 'heatwaves', '{"el":"Καύσωνες","en":"Heatwaves"}', 1),
  ('00000000-0000-4000-9000-000000000002', 'floods', '{"el":"Πλημμύρες","en":"Floods"}', 2),
  ('00000000-0000-4000-9000-000000000003', 'drought', '{"el":"Ξηρασία","en":"Drought"}', 3),
  ('00000000-0000-4000-9000-000000000004', 'wildfires', '{"el":"Πυρκαγιές","en":"Wildfires"}', 4),
  ('00000000-0000-4000-9000-000000000005', 'sea_level_rise', '{"el":"Άνοδος Στάθμης Θάλασσας","en":"Sea-level rise"}', 5);
