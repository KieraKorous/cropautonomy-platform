-- 0017_capture_inferred_details.sql
--
-- Adds a second model-authored field to captures: `inferred_details` — a deeper
-- agronomic analysis covering both what looks healthy and what looks wrong with
-- the plant. Distinct from `inferred_summary` (0016), which stays a short 1-2
-- sentence brief. Both are produced by the optional `agronomic_summary` stage
-- (Claude) and are reviewer-editable via PATCH /v1/captures/{id}.
--
-- Also bumps the summary stage's max_tokens (default-plant@v2) so the longer
-- details text isn't truncated. The concrete model id + token budget live in
-- pipeline_stages.config, swappable without a code change.
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0017_capture_inferred_details.sql
-- (or paste into the Supabase SQL editor).
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- 1. In-depth model-authored details column.
--    Mirrors inferred_summary: AI-authored, reviewer-editable, no length cap.
------------------------------------------------------------------------

alter table public.captures
  add column if not exists inferred_details text;

------------------------------------------------------------------------
-- 2. Widen the summary stage token budget on default-plant@v2 so the
--    longer details fit alongside the short brief.
------------------------------------------------------------------------

update public.pipeline_stages ps
set config = ps.config || '{"max_tokens": 600}'::jsonb
from public.pipelines p, public.model_versions mv
where ps.pipeline_id = p.id
  and ps.model_version_id = mv.id
  and p.name = 'default-plant' and p.version = 'v2'
  and mv.name = 'agronomic_summary' and mv.version = 'v1';
