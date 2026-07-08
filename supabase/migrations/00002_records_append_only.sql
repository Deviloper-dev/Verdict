-- Layer 1: dedicated app role that can only ever INSERT/SELECT records.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'verdict_ledger_writer') then
    create role verdict_ledger_writer nologin;
  end if;
end $$;

grant select, insert on records to verdict_ledger_writer;
-- Deliberately no UPDATE/DELETE/TRUNCATE grants.

-- Layer 2: trigger blocks mutation for every role, including the table owner,
-- unless the trigger itself is disabled/dropped (which the anchor makes detectable).
create or replace function verdict_block_record_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'records are immutable: % is not permitted', tg_op;
end $$;

create trigger records_immutable
  before update or delete on records
  for each row execute function verdict_block_record_mutation();
