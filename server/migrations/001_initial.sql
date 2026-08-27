-- PostgreSQL 15+ reference schema for the shared AdapTTICA API.
create extension if not exists pgcrypto;
create extension if not exists citext;

create type platform_role as enum ('user', 'representative', 'coordinator', 'admin');
create type case_status as enum ('draft', 'in_progress', 'under_review', 'approved', 'completed');
create type invitation_status as enum ('pending', 'accepted', 'declined', 'expired');

create table organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'public_body',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  password_hash text not null,
  email_verified_at timestamptz,
  full_name text not null,
  platform_role platform_role not null default 'user',
  organisation_id uuid references organisations(id),
  locale text not null default 'el' check (locale in ('el', 'en')),
  preferences jsonb not null default '{}'::jsonb,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table case_studies (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title jsonb not null,
  description jsonb not null default '{}'::jsonb,
  organisation_id uuid references organisations(id),
  owner_id uuid not null references users(id),
  status case_status not null default 'draft',
  sectors text[] not null default '{}',
  adaptation_measures text[] not null default '{}',
  starts_on date,
  due_on date,
  workspace_provider text not null default 'affine',
  workspace_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table case_members (
  case_id uuid not null references case_studies(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role platform_role not null default 'user',
  permissions jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  primary key (case_id, user_id)
);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references case_studies(id) on delete cascade,
  invited_by uuid not null references users(id),
  email citext not null,
  case_role platform_role not null default 'user',
  token_hash text unique not null,
  status invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_by uuid references users(id),
  created_at timestamptz not null default now()
);

create table resources (
  id uuid primary key default gen_random_uuid(),
  title jsonb not null,
  description jsonb not null default '{}'::jsonb,
  resource_type text not null,
  sectors text[] not null default '{}',
  tags text[] not null default '{}',
  case_id uuid references case_studies(id) on delete set null,
  author_id uuid not null references users(id),
  storage_key text,
  external_url text,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((storage_key is not null) <> (external_url is not null))
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  event_type text not null,
  title jsonb not null,
  body jsonb not null default '{}'::jsonb,
  target_url text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index case_studies_owner_idx on case_studies(owner_id, updated_at desc);
create index case_members_user_idx on case_members(user_id, case_id);
create index invitations_email_idx on invitations(email, status);
create index resources_search_idx on resources using gin ((title || description));
create index notifications_user_idx on notifications(user_id, read_at, created_at desc);
create index audit_entity_idx on audit_log(entity_type, entity_id, created_at desc);
