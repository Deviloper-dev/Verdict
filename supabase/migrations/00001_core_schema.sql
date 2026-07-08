-- Verdict core schema (M0). RLS member policies land in M1 with Supabase Auth.

create table members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  joined_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references members(id),
  created_at timestamptz not null default now()
);

create table group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  member_id uuid not null references members(id),
  joined_at timestamptz not null default now(),
  unique (group_id, member_id)
);

create table polls (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  created_by uuid not null references members(id),
  title text not null,
  context text not null default '',
  quorum_percent int not null check (quorum_percent between 1 and 100),
  status text not null default 'open' check (status in ('open', 'withdrawn', 'finalized')),
  created_at timestamptz not null default now()
);

create table options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  label text not null
);

create table participants (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  member_id uuid not null references members(id),
  added_at timestamptz not null default now(),
  unique (poll_id, member_id)
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references polls(id),
  option_id uuid not null references options(id),
  participant_id uuid not null references participants(id),
  opinion_text text not null check (length(trim(opinion_text)) > 0),
  created_at timestamptz not null default now(),
  unique (participant_id)
);

create table records (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups(id),
  poll_id uuid not null references polls(id),
  seq int not null check (seq >= 1),
  title text not null,
  context text not null default '',
  options_snapshot jsonb not null,
  participants_snapshot jsonb not null,
  votes_snapshot jsonb not null,
  winning_option_id uuid not null,
  quorum_percent int not null,
  prev_hash text not null,
  this_hash text not null unique,
  hash_version int not null,
  finalized_at timestamptz not null,
  unique (group_id, seq)
);

alter table records enable row level security;
-- Deny-by-default for non-owner roles until M1 adds membership policies.
