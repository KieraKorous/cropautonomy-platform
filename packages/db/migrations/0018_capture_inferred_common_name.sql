-- 0018_capture_inferred_common_name.sql
--
-- Denormalizes the plant's common (regular) name onto captures, alongside the
-- scientific name already in `inferred_species`. PlantNet returns common names
-- in each detection's payload (analysis_results.payload.common_names) but they
-- were never surfaced on the capture row — only the scientific `category` was
-- stamped into inferred_species. This adds `inferred_common_name` so the portal
-- can show both names and let the user choose which to display.
--
-- Stamped by the analysis worker from the same top detection that fills
-- inferred_species, so the two names always describe the same organism. Model-
-- authored; null when the top detection carries no common name.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0018_capture_inferred_common_name.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

alter table public.captures
  add column if not exists inferred_common_name text;
