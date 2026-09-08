-- Vision Elements ("Shared Vision" ideas) move from a single freeform body
-- to the same Title + Description + optional image shape as Alternative
-- Futures, since only a Coordinator/Admin proposes them now (participants
-- only agree/disagree/reply) -- see caseWorkflow.js's vision-elements routes.
alter table vision_elements add column title_el text;
alter table vision_elements add column title_en text;
alter table vision_elements add column description_el text;
alter table vision_elements add column description_en text;
alter table vision_elements add column image_key text references uploads(id) on delete set null;

-- The Theory of Change entry is a single record per case (not a list like
-- Futures/Vision Elements), but participants still need to react to it --
-- so it gets its own agree/disagree/reply thread, keyed by case_id since a
-- ToC row does not always exist yet when someone first opens the tab.
create table toc_votes (
  case_id text not null references case_studies(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value text not null check (value in ('agree', 'disagree')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (case_id, user_id)
);

create table toc_replies (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index toc_replies_case_idx on toc_replies(case_id, created_at);
