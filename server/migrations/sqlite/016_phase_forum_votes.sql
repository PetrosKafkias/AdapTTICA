create table phase_forum_votes (
  comment_id text not null references phase_forum_comments(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  value integer not null check (value in (-1, 1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (comment_id, user_id)
);

create index phase_forum_votes_comment_idx on phase_forum_votes(comment_id, value);
