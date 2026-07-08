-- Semantic search: embeddings are DERIVED data, computed after sealing,
-- never part of the record hash (PRD §6.3). Requires pgvector (built into
-- Supabase; on vanilla Postgres install the extension first).

create extension if not exists vector;

create table record_embeddings (
  record_id uuid primary key references records(id),
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz not null default now()
);

-- Cosine-distance index; lists=10 is fine at this scale (a few records/week).
create index record_embeddings_cosine
  on record_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 10);

alter table record_embeddings enable row level security;

create policy record_embeddings_member_read on record_embeddings for select using (
  exists (select 1 from records r where r.id = record_embeddings.record_id and is_group_member(r.group_id))
);

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant select on record_embeddings to authenticated;
  end if;
end $$;
