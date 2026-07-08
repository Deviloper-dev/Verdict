-- TEST-ONLY: emulates Supabase's auth.uid() on vanilla Postgres so the RLS
-- migration (00003) can be applied and exercised outside Supabase.
-- Apply BEFORE 00003. Never used in production — Supabase provides auth.uid().

create schema if not exists auth;

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;
