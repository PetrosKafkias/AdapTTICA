create table if not exists regional_system_comments (
  id text primary key,
  system_id text not null references systems(id) on delete cascade,
  author_id text not null references users(id) on delete cascade,
  body text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create index if not exists regional_system_comments_system_idx
  on regional_system_comments(system_id, created_at);
