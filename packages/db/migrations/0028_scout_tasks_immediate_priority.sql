-- 0028_scout_tasks_immediate_priority.sql
--
-- Adds 'immediate' as the top priority tier for scout tasks. 0027 originally
-- shipped the CHECK as ('low', 'normal', 'high'); this widens it so the portal's
-- "Immediate" option (which floats a task to the top of the board with a red
-- border) can be persisted.
--
-- Robust to the existing constraint's name: rather than assume Postgres named the
-- inline column CHECK `scout_tasks_priority_check`, we look up EVERY check
-- constraint on scout_tasks whose definition mentions `priority`, drop them all,
-- then add the widened one back. Idempotent — safe to re-run, and a no-op on a
-- database whose constraint already allows 'immediate'.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0028_scout_tasks_immediate_priority.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

do $$
declare
  c text;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.scout_tasks'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%priority%'
  loop
    execute format('alter table public.scout_tasks drop constraint %I', c);
  end loop;

  alter table public.scout_tasks
    add constraint scout_tasks_priority_check
    check (priority in ('low', 'normal', 'high', 'immediate'));
end$$;
