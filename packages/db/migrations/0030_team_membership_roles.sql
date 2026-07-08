-- 0030_team_membership_roles.sql
--
-- Roles move to the team level: each team_memberships row carries the role the
-- member holds ON that team. A member can be an Agronomist on one team and a
-- Field Scout on another. Effective permissions become the UNION of the
-- member's org base role and every team role they hold (see
-- packages/db/src/permissions/index.ts) — additive, so no one loses access.
--
-- role_id is nullable: pre-existing team memberships (added before this
-- migration, or added from the team page without a role) simply contribute no
-- extra permissions — they still grant team visibility. on delete restrict so a
-- role in use can't be deleted out from under a membership.
--
-- Apply via: psql "$DATABASE_URL" -f packages/db/migrations/0030_team_membership_roles.sql
-- (or paste into the Supabase SQL editor). Idempotent.
------------------------------------------------------------------------------

alter table public.team_memberships
  add column if not exists role_id uuid references public.roles(id) on delete restrict;

create index if not exists team_memberships_role_id_idx
  on public.team_memberships (role_id);
