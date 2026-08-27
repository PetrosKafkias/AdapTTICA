-- SQLite schema for the AdapTTICA API. Mirrors the field names in
-- server/migrations/001_initial.sql (the Postgres reference schema kept for
-- a future shared-production migration) adapted to SQLite: enums become
-- TEXT + CHECK, jsonb/text[] become JSON-encoded TEXT columns, and uuid
-- primary keys are TEXT populated by the application with crypto.randomUUID().

create table organisations (
  id text primary key,
  name text not null,
  kind text not null default 'public_body',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table users (
  id text primary key,
  email text unique not null collate nocase,
  password_hash text not null,
  email_verified_at text,
  full_name text not null,
  platform_role text not null default 'user'
    check (platform_role in ('user', 'representative', 'coordinator', 'admin')),
  organisation_id text references organisations(id),
  locale text not null default 'el' check (locale in ('el', 'en')),
  preferences text not null default '{}',
  disabled_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table case_studies (
  id text primary key,
  slug text unique not null,
  title text not null,
  description text not null default '{}',
  organisation_id text references organisations(id),
  owner_id text not null references users(id),
  status text not null default 'draft'
    check (status in ('draft', 'in_progress', 'under_review', 'approved', 'completed')),
  -- Diverges from the Postgres reference (text[] of sector codes): the real
  -- frontend only ever renders one bilingual sector label per case, so this
  -- stores a JSON {el, en} pair instead of a code array.
  sectors text not null default '{}',
  area text not null default '{}',
  adaptation_measures text not null default '[]',
  starts_on text,
  due_on text,
  workspace_provider text not null default 'local',
  workspace_id text unique,
  workspace_state text not null default '{"nodes":[],"version":1}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  deleted_at text
);

create table case_members (
  case_id text not null references case_studies(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null default 'user'
    check (role in ('user', 'representative', 'coordinator', 'admin')),
  permissions text not null default '{}',
  joined_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  primary key (case_id, user_id)
);

create table invitations (
  id text primary key,
  case_id text not null references case_studies(id) on delete cascade,
  invited_by text not null references users(id),
  email text not null collate nocase,
  case_role text not null default 'user'
    check (case_role in ('user', 'representative', 'coordinator', 'admin')),
  token_hash text unique not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'expired')),
  expires_at text not null,
  accepted_by text references users(id),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table resources (
  id text primary key,
  title text not null,
  description text not null default '{}',
  resource_type text not null,
  sectors text not null default '[]',
  tags text not null default '[]',
  case_id text references case_studies(id) on delete set null,
  author_id text not null references users(id),
  file_name text,
  storage_key text,
  external_url text,
  mime_type text,
  byte_size integer check (byte_size is null or byte_size >= 0),
  published_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  check (storage_key is not null or external_url is not null)
);

create table notifications (
  id text primary key,
  user_id text not null references users(id) on delete cascade,
  event_type text not null,
  title text not null,
  body text not null default '{}',
  target_url text,
  read_at text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table audit_log (
  id integer primary key autoincrement,
  actor_id text references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata text not null default '{}',
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create table uploads (
  id text primary key,
  owner_id text not null references users(id) on delete cascade,
  name text not null,
  mime_type text not null,
  byte_size integer not null,
  storage_path text not null,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

create index case_studies_owner_idx on case_studies(owner_id, updated_at desc);
create index case_members_user_idx on case_members(user_id, case_id);
create index invitations_email_idx on invitations(email, status);
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);
create index audit_entity_idx on audit_log(entity_type, entity_id, created_at desc);

-- Full-text search over resource titles/descriptions, standing in for the
-- Postgres GIN index in the reference schema (FTS5 has no native support
-- for external-content tables keyed by TEXT ids, so this is kept in sync
-- with triggers instead).
create virtual table resources_fts using fts5(id unindexed, title, description);

create trigger resources_fts_insert after insert on resources begin
  insert into resources_fts (id, title, description) values (new.id, new.title, new.description);
end;

create trigger resources_fts_update after update on resources begin
  update resources_fts set title = new.title, description = new.description where id = new.id;
end;

create trigger resources_fts_delete after delete on resources begin
  delete from resources_fts where id = old.id;
end;
