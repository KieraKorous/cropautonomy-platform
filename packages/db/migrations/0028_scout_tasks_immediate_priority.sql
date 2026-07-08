-- 0028_scout_tasks_immediate_priority.sql
--
-- Adds 'immediate' as the top priority tier for scout tasks. 0027 originally
-- shipped the CHECK as ('low', 'normal', 'high'); this widens it so the portal's
-- "Immediate" option (which floats a task to the top of the board with a red
-- border) can be persisted. Databases that applied 0027 *after* the constraint
-- was updated in place already allow 'immediate' — this migration is idempotent
-- (drop-if-exists + re-add), so it is a no-op there.
--
-- 0027 created the CHECK inline (unnamed) on the priority column, so Postgres
-- auto-named it `scout_tasks_priority_check`.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0028_scout_tasks_immediate_priority.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

alter table public.scout_tasks
  drop constraint if exists scout_tasks_priority_check;

alter table public.scout_tasks
  add constraint scout_tasks_priority_check
  check (priority in ('low', 'normal', 'high', 'immediate'));
