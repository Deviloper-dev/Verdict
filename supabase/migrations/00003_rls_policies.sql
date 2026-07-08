-- Row Level Security: every read is scoped to groups the caller belongs to.
-- In production, members.id == auth.uid() (Supabase Auth user id) — M2 wires
-- signup to insert the members row with that id.
-- Writes are NOT granted to clients: all mutations go through server routes
-- (service role), so tables get SELECT policies only, plus the ledger INSERT.

-- SECURITY DEFINER avoids RLS recursion when policies consult group_members.
create or replace function is_group_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from group_members where group_id = gid and member_id = auth.uid()
  );
$$;

alter table members enable row level security;
alter table groups enable row level security;
alter table group_members enable row level security;
alter table polls enable row level security;
alter table options enable row level security;
alter table participants enable row level security;
alter table votes enable row level security;
-- records RLS already enabled in 00001.

-- A member sees themselves and anyone who shares a group with them.
create policy members_visible_via_shared_group on members for select using (
  id = auth.uid()
  or exists (
    select 1 from group_members mine
    join group_members theirs on theirs.group_id = mine.group_id
    where mine.member_id = auth.uid() and theirs.member_id = members.id
  )
);

create policy groups_member_read on groups for select using (is_group_member(id));
create policy group_members_member_read on group_members for select using (is_group_member(group_id));
create policy polls_member_read on polls for select using (is_group_member(group_id));

create policy options_member_read on options for select using (
  exists (select 1 from polls p where p.id = options.poll_id and is_group_member(p.group_id))
);
create policy participants_member_read on participants for select using (
  exists (select 1 from polls p where p.id = participants.poll_id and is_group_member(p.group_id))
);
create policy votes_member_read on votes for select using (
  exists (select 1 from polls p where p.id = votes.poll_id and is_group_member(p.group_id))
);

create policy records_member_read on records for select using (is_group_member(group_id));
create policy records_ledger_insert on records for insert to verdict_ledger_writer with check (true);

-- Supabase grants: the `authenticated` role gets read access; policies scope rows.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant usage on schema public to authenticated;
    grant select on all tables in schema public to authenticated;
  end if;
end $$;
