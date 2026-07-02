-- 0025_annotation_confirmation.sql
--
-- Phase 3 of the capture-analysis-intelligence layer: the confirm loop (the
-- corpus flywheel). A reviewer confirms / rejects / corrects / adds findings on
-- the capture detail page; each action appends a capture_annotations row (the
-- human-verified label). See docs/architecture/capture-analysis-intelligence.md.
--
-- This migration adds:
--   1. capture_annotations.confirmation_level — how trustworthy the label is.
--      Visual field ID is often wrong; some ground truth needs a lab assay, so
--      models can later train/eval on the confirmed tier only.
--   2. The analysis.annotate permission + grants (owner/admin/manager/technician;
--      viewers stay read-only).
--
-- Idempotent: safe to re-run.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0025_annotation_confirmation.sql
------------------------------------------------------------------------------

------------------------------------------------------------------------
-- 1. Confirmation tier on human annotations.
------------------------------------------------------------------------

alter table public.capture_annotations
  add column if not exists confirmation_level text not null default 'field_visual'
    check (confirmation_level in ('field_visual', 'expert_visual', 'lab_confirmed'));

------------------------------------------------------------------------
-- 2. analysis.annotate permission + role grants.
--    Labeling is "THE primary portal surface" (ADR 0003): field operators
--    (technician) and up may annotate; viewers stay read-only.
------------------------------------------------------------------------

insert into public.permissions (key, resource_group, description) values
  ('analysis.annotate', 'analysis',
   'Confirm, reject, correct, or add analysis findings (build the labeled corpus).')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
  select r.id, p.id
  from public.roles r
  cross join public.permissions p
  where r.is_system = true
    and r.key in ('owner', 'admin', 'manager', 'technician')
    and p.key = 'analysis.annotate'
    and not exists (
      select 1 from public.role_permissions rp
      where rp.role_id = r.id and rp.permission_id = p.id
    );
