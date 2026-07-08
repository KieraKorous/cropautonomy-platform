// Permission resolution helper.
//
// Single source of truth for "does this user have permission X in this org?"
// against the roles / role_permissions / organization_memberships tables.
//
// CONTRACT FOR CALLERS:
//   - App code checks PERMISSIONS, not ROLES.
//
//       await hasPermission(supabase, { userId, orgId, permission: 'captures.delete' })
//
//     never
//
//       if (membership.role === 'admin') ...
//
//   - The relational role schema only pays off if permission checks scatter
//     instead of role string comparisons. Don't undermine it.
//
// IMPLEMENTATION:
//   - Per-request cache of (userId, orgId) -> permission set, scoped to a single
//     PermissionResolver instance. Construct one per request; the cache dies
//     with the request. Cross-request caching (Redis, etc.) is out of scope for
//     v0 - revisit if the join shows up in flamegraphs.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.ts";

export type PermissionKey =
  // organization
  | "org.read"
  | "org.update"
  | "org.delete"
  | "org.billing.manage"
  | "org.audit.read"
  // membership & roles
  | "members.read"
  | "members.invite"
  | "members.update"
  | "members.remove"
  | "roles.read"
  | "roles.manage"
  // land
  | "farms.read"
  | "farms.create"
  | "farms.update"
  | "farms.delete"
  | "fields.read"
  | "fields.create"
  | "fields.update"
  | "fields.delete"
  | "zones.read"
  | "zones.create"
  | "zones.update"
  | "zones.delete"
  // crops
  | "crop_types.read"
  | "crop_types.create"
  | "crop_types.update"
  | "crop_types.delete"
  | "crop_plantings.read"
  | "crop_plantings.create"
  | "crop_plantings.update"
  | "crop_plantings.delete"
  // devices
  | "devices.read"
  | "devices.register"
  | "devices.update"
  | "devices.deregister"
  // captures
  | "captures.read"
  | "captures.create"
  | "captures.update"
  | "captures.delete"
  // capture sessions
  | "capture_sessions.read"
  | "capture_sessions.create"
  | "capture_sessions.update"
  | "capture_sessions.end"
  // analysis
  | "analysis.read"
  | "analysis.request"
  | "analysis.annotate"
  | "analysis.delete"
  // telemetry
  | "telemetry.read"
  | "telemetry.ingest"
  // notifications
  | "notifications.read"
  | "notifications.manage"
  // teams
  | "teams.read"
  | "teams.create"
  | "teams.update"
  | "teams.delete"
  | "teams.assign"
  | "team_members.manage"
  // scout tasks
  | "scout_tasks.read"
  | "scout_tasks.create"
  | "scout_tasks.update"
  | "scout_tasks.complete"
  | "scout_tasks.delete";

export interface MembershipContext {
  /** Internal users.id uuid (not the Clerk user id). */
  userId: string;
  /** Active organization uuid. */
  orgId: string;
}

export class PermissionResolver {
  private readonly cache = new Map<string, Set<string>>();

  constructor(private readonly supabase: SupabaseClient<Database>) {}

  /**
   * Resolve the full permission set for (userId, orgId) and cache it on this
   * resolver. Returns null if the user has no active membership in the org.
   */
  async load(ctx: MembershipContext): Promise<ReadonlySet<string> | null> {
    const key = cacheKey(ctx);
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Single round trip: membership -> role_permissions -> permissions.
    const { data, error } = await this.supabase
      .from("organization_memberships")
      .select(
        `
          status,
          role:roles!inner (
            id,
            role_permissions (
              permission:permissions!inner ( key )
            )
          )
        `
      )
      .eq("org_id", ctx.orgId)
      .eq("user_id", ctx.userId)
      .eq("status", "active")
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    const permissions = new Set<string>();
    // The joined shape is awkward to type without generated types in place;
    // narrow it here so callers see clean strings.
    const rolePermissions = (data as unknown as {
      role: { role_permissions: Array<{ permission: { key: string } }> };
    }).role.role_permissions;
    for (const rp of rolePermissions ?? []) {
      if (rp?.permission?.key) permissions.add(rp.permission.key);
    }

    this.cache.set(key, permissions);
    return permissions;
  }

  async hasPermission(
    ctx: MembershipContext,
    permission: PermissionKey
  ): Promise<boolean> {
    const set = await this.load(ctx);
    return set?.has(permission) ?? false;
  }

  /**
   * Throw if the user lacks the permission. Convenience for API route guards.
   */
  async requirePermission(
    ctx: MembershipContext,
    permission: PermissionKey
  ): Promise<void> {
    const allowed = await this.hasPermission(ctx, permission);
    if (!allowed) {
      throw new PermissionDeniedError(permission, ctx);
    }
  }

  /**
   * Check several permissions at once. Returns true only if ALL are granted.
   */
  async hasAll(
    ctx: MembershipContext,
    permissions: readonly PermissionKey[]
  ): Promise<boolean> {
    const set = await this.load(ctx);
    if (!set) return false;
    return permissions.every((p) => set.has(p));
  }

  /**
   * Check several permissions at once. Returns true if ANY is granted.
   */
  async hasAny(
    ctx: MembershipContext,
    permissions: readonly PermissionKey[]
  ): Promise<boolean> {
    const set = await this.load(ctx);
    if (!set) return false;
    return permissions.some((p) => set.has(p));
  }
}

export class PermissionDeniedError extends Error {
  constructor(
    readonly permission: PermissionKey,
    readonly context: MembershipContext
  ) {
    super(`Permission denied: ${permission}`);
    this.name = "PermissionDeniedError";
  }
}

function cacheKey(ctx: MembershipContext): string {
  return `${ctx.userId}::${ctx.orgId}`;
}
