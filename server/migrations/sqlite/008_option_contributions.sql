-- Adaptation Options need their own reply/vote tables, mirroring
-- vision_element_replies/vision_element_votes -- Step 5 reuses the same
-- propose/comment/reply/agree-disagree/merge pattern as Step 3.

create table option_replies (
  id text primary key,
  option_id text not null references adaptation_options(id) on delete cascade,
  author_id text not null references users(id),
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table option_votes (
  option_id text not null references adaptation_options(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value text not null check (value in ('agree', 'disagree')),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (option_id, user_id)
);

create index option_replies_option_idx on option_replies(option_id, created_at);
