-- 0011_capture_discard.sql
--
-- Soft-discard for captures. Discarding hides a capture from the portal list
-- without deleting the row or its Storage object — reversible, keeps the audit
-- trail. Permanent deletion (row + Storage object) is a separate admin action
-- driven from the portal settings page (captures.delete permission).
--
-- `discarded_at` is orthogonal to the analysis `status` lifecycle, so no change
-- to the status check constraint.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0011_capture_discard.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

alter table public.captures
  add column if not exists discarded_at timestamptz;

-- Serves both the default list (discarded_at is null) and the settings cleanup
-- view (discarded_at is not null), each org-scoped.
create index if not exists captures_org_discarded_at_idx
  on public.captures (org_id, discarded_at);
