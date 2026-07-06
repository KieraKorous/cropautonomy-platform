// Team access-scoping helpers.
//
// The team boundary is enforced PRIMARILY here in the API query layer; RLS
// (0026_teams.sql) mirrors it as a secondary net. See that migration's header
// for the canonical visibility rule. In short, a caller may see entity row R iff:
//   (A) caller holds team_members.manage  (admin/owner org-wide bypass), OR
//   (B) R has ZERO team assignments        (unassigned = org-visible), OR
//   (C) R shares >= 1 team with the caller.
//
// resolveTeamScope() computes (bypass, teamIds) once per request; the filter
// helpers apply (B)||(C). When bypass is true every helper short-circuits to the
// plain org query — byte-for-byte the pre-teams behavior, so admins never regress.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MembershipContext, PermissionResolver } from "@gaia/db/permissions";

export type TeamResourceType =
  | "farm"
  | "field"
  | "device"
  | "capture_session"
  | "capture";

export interface TeamScope {
  /** Caller holds team_members.manage → sees every org row (admin/owner). */
  bypass: boolean;
  /** Team ids the caller belongs to in the active org. null when bypass. */
  teamIds: string[] | null;
}

// A supabase-js filter builder we can chain .or()/.not() onto. The concrete
// PostgrestFilterBuilder generics vary per call site and postgrest-js is only a
// transitive dep, so we keep this structural + loose (routes use getDb(), which
// is already an untyped client).
interface TeamFilterable {
  or(filters: string): TeamFilterable;
  not(column: string, operator: string, value: unknown): TeamFilterable;
  in(column: string, values: readonly string[]): TeamFilterable;
}

/**
 * Resolve the caller's team scope for this request. bypass short-circuits all
 * filtering; otherwise teamIds is the (possibly empty) list of the caller's teams.
 */
export async function resolveTeamScope(
  supabase: SupabaseClient,
  permissions: PermissionResolver,
  ctx: MembershipContext
): Promise<TeamScope> {
  const bypass = await permissions.hasPermission(ctx, "team_members.manage");
  if (bypass) return { bypass: true, teamIds: null };

  const { data, error } = await supabase
    .from("team_memberships")
    .select("team_id")
    .eq("org_id", ctx.orgId)
    .eq("user_id", ctx.userId);
  if (error) throw error;

  const teamIds = ((data ?? []) as Array<{ team_id: string }>).map((r) => r.team_id);
  return { bypass: false, teamIds };
}

// Resource ids of a type that carry >= 1 assignment in the org (i.e. the rows
// that are NOT unassigned).
async function assignedResourceIds(
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType
): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id")
    .eq("org_id", orgId)
    .eq("resource_type", type);
  if (error) throw error;
  const ids = new Set(
    ((data ?? []) as Array<{ resource_id: string }>).map((r) => r.resource_id)
  );
  return [...ids];
}

// Resource ids of a type assigned to any of the caller's teams (rule C).
async function teamVisibleResourceIds(
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType,
  teamIds: string[]
): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id")
    .eq("org_id", orgId)
    .eq("resource_type", type)
    .in("team_id", teamIds);
  if (error) throw error;
  const ids = new Set(
    ((data ?? []) as Array<{ resource_id: string }>).map((r) => r.resource_id)
  );
  return [...ids];
}

// Resource ids of a type assigned to one specific team (the ?teamId= narrow).
async function resourceIdsForTeam(
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType,
  teamId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id")
    .eq("org_id", orgId)
    .eq("resource_type", type)
    .eq("team_id", teamId);
  if (error) throw error;
  const ids = new Set(
    ((data ?? []) as Array<{ resource_id: string }>).map((r) => r.resource_id)
  );
  return [...ids];
}

// A uuid that never matches a real row — used to force an empty result set when
// a `.in(...)` filter would otherwise be given an empty list (PostgREST's
// `in.()` is not reliably an empty match).
const NO_MATCH = "00000000-0000-0000-0000-000000000000";

/**
 * Append the team visibility filter (rule B||C) to a supabase list query. No-op
 * when the caller bypasses. `idColumn` is the entity's primary key column.
 *
 * Expressed as: id NOT IN (assigned) OR id IN (visibleAssigned). When nothing of
 * this type is assigned at all, the query is returned untouched (everything is
 * unassigned → org-visible).
 */
// NOTE: the result is wrapped in `{ query }` on purpose. A supabase-js filter
// builder is itself a thenable, so `await`-ing a bare `Promise<Builder>` would
// recursively unwrap the builder into an executed PostgrestResponse. Returning a
// plain object shields the builder from that await. Call as:
//   query = (await applyTeamFilter(query, ...)).query
export async function applyTeamFilter<T>(
  query: T,
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType,
  scope: TeamScope,
  opts: { teamId?: string; idColumn?: string } = {}
): Promise<{ query: T }> {
  const idColumn = opts.idColumn ?? "id";
  const filterable = query as unknown as TeamFilterable;

  // ?teamId= narrowing (portal filter): restrict to rows assigned to that one
  // team. This can only NARROW an already-visible set, never widen it — a
  // non-bypass caller who isn't on the team sees nothing.
  if (opts.teamId) {
    if (!scope.bypass && !(scope.teamIds ?? []).includes(opts.teamId)) {
      return { query: filterable.in(idColumn, [NO_MATCH]) as unknown as T };
    }
    const ids = await resourceIdsForTeam(supabase, orgId, type, opts.teamId);
    return { query: filterable.in(idColumn, ids.length ? ids : [NO_MATCH]) as unknown as T };
  }

  if (scope.bypass) return { query };

  const assigned = await assignedResourceIds(supabase, orgId, type);
  if (assigned.length === 0) return { query }; // nothing assigned → all visible

  const visible = await teamVisibleResourceIds(
    supabase,
    orgId,
    type,
    scope.teamIds ?? []
  );

  if (visible.length === 0) {
    // Only rule (B) can apply: hide everything assigned.
    return {
      query: filterable.not(idColumn, "in", `(${assigned.join(",")})`) as unknown as T
    };
  }
  return {
    query: filterable.or(
      `${idColumn}.not.in.(${assigned.join(",")}),${idColumn}.in.(${visible.join(",")})`
    ) as unknown as T
  };
}

/**
 * Single-row visibility gate for detail routes. Returns true iff the caller may
 * see this specific resource under the visibility rule.
 */
export async function canSeeResource(
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType,
  resourceId: string,
  scope: TeamScope
): Promise<boolean> {
  if (scope.bypass) return true;

  const { data, error } = await supabase
    .from("team_assignments")
    .select("team_id")
    .eq("org_id", orgId)
    .eq("resource_type", type)
    .eq("resource_id", resourceId);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ team_id: string }>;
  if (rows.length === 0) return true; // (B) unassigned
  const mine = new Set(scope.teamIds ?? []);
  return rows.some((r) => mine.has(r.team_id)); // (C)
}

/**
 * Given a set of candidate resource ids, return the subset the caller may see.
 * For routes that fetch rows through an RPC (e.g. farms via list_org_farms) and
 * post-filter in JS rather than chaining onto a query builder.
 */
export async function partitionVisibleIds(
  supabase: SupabaseClient,
  orgId: string,
  type: TeamResourceType,
  scope: TeamScope,
  candidateIds: string[],
  teamId?: string
): Promise<Set<string>> {
  // ?teamId= narrow (portal filter): keep only rows assigned to that one team,
  // and only if the caller may see that team's rows at all.
  if (teamId) {
    if (!scope.bypass && !(scope.teamIds ?? []).includes(teamId)) {
      return new Set();
    }
    const teamIds = await resourceIdsForTeam(supabase, orgId, type, teamId);
    const inTeam = new Set(teamIds);
    return new Set(candidateIds.filter((id) => inTeam.has(id)));
  }

  if (scope.bypass || candidateIds.length === 0) return new Set(candidateIds);

  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id, team_id")
    .eq("org_id", orgId)
    .eq("resource_type", type)
    .in("resource_id", candidateIds);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ resource_id: string; team_id: string }>;
  const byResource = new Map<string, string[]>();
  for (const r of rows) {
    const list = byResource.get(r.resource_id) ?? [];
    list.push(r.team_id);
    byResource.set(r.resource_id, list);
  }

  const mine = new Set(scope.teamIds ?? []);
  const visible = new Set<string>();
  for (const id of candidateIds) {
    const teams = byResource.get(id);
    if (!teams || teams.length === 0) {
      visible.add(id); // (B) unassigned
    } else if (teams.some((t) => mine.has(t))) {
      visible.add(id); // (C)
    }
  }
  return visible;
}
