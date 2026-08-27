-- Decisions, comments and votes. The reference Postgres schema in
-- server/migrations/001_initial.sql never modelled these, but the actual
-- frontend bundle calls GET/POST /cases/:id/decisions, GET/POST
-- /decisions/:id/comments, POST /decisions/:id/vote and PATCH
-- /decisions/:id/status, so a real backend needs them.

create table decisions (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  title text not null,
  description text not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'open', 'decided', 'archived')),
  created_by text not null references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table decision_comments (
  id text primary key,
  decision_id text not null references decisions(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table decision_votes (
  decision_id text not null references decisions(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (decision_id, user_id)
);

create index decisions_case_idx on decisions(case_id, updated_at desc);
create index decision_comments_decision_idx on decision_comments(decision_id, created_at);
