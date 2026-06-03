-- 0015_capture_description.sql
--
-- Operator-authored description / observation notes for a capture. Surfaced on
-- the portal's per-capture detail page (/captures/{id}) below the plant name,
-- editable by technician-and-up (captures.update). Distinct from
-- `status_message` (pipeline-authored) and `inferred_species` (model output) —
-- this is free-form human context about the observation.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0015_capture_description.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

alter table public.captures
  add column if not exists description text;
