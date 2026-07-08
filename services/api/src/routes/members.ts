import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getClerk } from "../lib/clerk.js";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

// Members — the org's people, their role + status, and the invitation flow. The
// roster (GET) is held by every role via members.read; mutation + invite are
// gated on members.update / members.remove / members.invite (owner/admin).
//
// Invites go through the Clerk Invitations API: Clerk sends the email and hosts
// sign-up. The target org + role ride in the invitation's public_metadata; the
// portal's Clerk webhook consumes them on user.created to create the membership
// and set the active org. Pending invitations live in Clerk (not our DB) until
// accepted, so we list/revoke them straight through Clerk.

const UUID_RE = /^[0-9a-f-]{36}$/i;

// The system roles a member can hold. `owner` is assignable only by an owner
// (guarded below); the rest are freely assignable by anyone with members.update
// or members.invite.
const SYSTEM_ROLE_KEYS = ["owner", "admin", "manager", "technician", "viewer"] as const;
type SystemRoleKey = (typeof SYSTEM_ROLE_KEYS)[number];

const inviteSchema = z.object({
  email: z.string().email(),
  roleKey: z.enum(SYSTEM_ROLE_KEYS)
});

const updateMemberSchema = z
  .object({
    roleKey: z.enum(SYSTEM_ROLE_KEYS).optional(),
    status: z.enum(["active", "suspended"]).optional()
  })
  .refine((v) => v.roleKey !== undefined || v.status !== undefined, {
    message: "Provide roleKey and/or status."
  });

interface MemberRow {
  id: string;
  user_id: string;
  status: string;
  joined_at: string | null;
  role: { key: string; name: string } | null;
  user: {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

// Resolve a system role's uuid by key (system roles have org_id = null).
async function systemRoleId(
  supabase: ReturnType<typeof getDb>,
  key: SystemRoleKey
): Promise<string> {
  const { data, error } = await supabase
    .from("roles")
    .select("id")
    .eq("key", key)
    .eq("is_system", true)
    .is("org_id", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("members.role_not_found", `System role '${key}' is not seeded.`);
  return (data as { id: string }).id;
}

// The caller's own role key in this org — used to gate owner-level actions.
async function callerRoleKey(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("role:roles!inner ( key )")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  const row = data as unknown as { role: { key: string } | null } | null;
  return row?.role?.key ?? null;
}

// Count active owners in the org — the last one can't be demoted or removed,
// which would strand the org with no one who can manage billing or delete it.
async function activeOwnerCount(
  supabase: ReturnType<typeof getDb>,
  orgId: string
): Promise<number> {
  const ownerRoleId = await systemRoleId(supabase, "owner");
  const { count, error } = await supabase
    .from("organization_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "active")
    .eq("role_id", ownerRoleId);
  if (error) throw error;
  return count ?? 0;
}

const membersRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/members — the org's members with role + status. Held by every role
  // (members.read). canInvite / canManageMembers drive the page's controls.
  // Returns active + suspended (so suspended members can be reactivated); the
  // Team page's "add member" picker still only offers active users because the
  // add endpoint rejects non-active members.
  app.get("/v1/members", { preHandler: app.requireAuth("members.read") }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    // Disambiguate the users embed: organization_memberships has TWO FKs to
    // users (user_id + invited_by_user_id), so PostgREST needs the column hint.
    const ctx = { userId: caller.userId, orgId: caller.orgId };
    const [membersResult, teamRowsResult, canInvite, canUpdate, canRemove] = await Promise.all([
      supabase
        .from("organization_memberships")
        .select(
          "id, user_id, status, joined_at, role:roles!inner ( key, name ), user:users!user_id ( id, display_name, email, avatar_url )"
        )
        .eq("org_id", caller.orgId)
        .in("status", ["active", "suspended"]),
      supabase
        .from("team_memberships")
        .select("user_id, team:teams!inner ( id, name, color )")
        .eq("org_id", caller.orgId),
      request.permissions!.hasPermission(ctx, "members.invite"),
      request.permissions!.hasPermission(ctx, "members.update"),
      request.permissions!.hasPermission(ctx, "members.remove")
    ]);
    if (membersResult.error) throw membersResult.error;
    if (teamRowsResult.error) throw teamRowsResult.error;

    // Group each member's teams by user for the detail view.
    const teamsByUser = new Map<string, Array<{ id: string; name: string; color: string | null }>>();
    for (const r of (teamRowsResult.data ?? []) as unknown as Array<{
      user_id: string;
      team: { id: string; name: string; color: string | null } | null;
    }>) {
      if (!r.team) continue;
      const list = teamsByUser.get(r.user_id) ?? [];
      list.push(r.team);
      teamsByUser.set(r.user_id, list);
    }

    const members = ((membersResult.data ?? []) as unknown as MemberRow[]).map((r) => ({
      membershipId: r.id,
      userId: r.user_id,
      displayName: r.user?.display_name ?? null,
      email: r.user?.email ?? null,
      avatarUrl: r.user?.avatar_url ?? null,
      roleKey: r.role?.key ?? null,
      roleName: r.role?.name ?? null,
      status: r.status,
      joinedAt: r.joined_at,
      isSelf: r.user_id === caller.userId,
      isOwner: r.role?.key === "owner",
      teams: teamsByUser.get(r.user_id) ?? []
    }));

    return {
      orgId: caller.orgId,
      canInvite,
      canManageMembers: canUpdate || canRemove,
      members
    };
  });

  // PATCH /v1/members/:userId — change a member's role and/or status.
  app.patch<{ Params: { userId: string } }>(
    "/v1/members/:userId",
    { preHandler: app.requireAuth("members.update") },
    async (request, _reply) => {
      const { userId } = request.params;
      if (!UUID_RE.test(userId)) throw badRequest("members.invalid_id", "Invalid user id.");
      const parsed = updateMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("members.invalid_input", "Invalid member update.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      // Can't change your own role/status here — avoids self-lockout and the
      // "demote yourself out of the last owner seat" footgun.
      if (userId === caller.userId) {
        throw forbidden("members.cannot_modify_self", "You can't change your own membership here.");
      }

      // Target must be a real member of this org.
      const { data: membership, error: memErr } = await supabase
        .from("organization_memberships")
        .select("id, role:roles!inner ( key )")
        .eq("org_id", caller.orgId)
        .eq("user_id", userId)
        .in("status", ["active", "suspended"])
        .maybeSingle();
      if (memErr) throw memErr;
      if (!membership) throw notFound("members.not_found", "That user is not a member of this org.");
      const targetRoleKey = (membership as unknown as { role: { key: string } | null }).role?.key ?? null;

      const patch: Record<string, unknown> = {};

      if (parsed.data.roleKey !== undefined && parsed.data.roleKey !== targetRoleKey) {
        // Only an owner may grant or revoke the owner role.
        const callerKey = await callerRoleKey(supabase, caller.orgId, caller.userId);
        if ((parsed.data.roleKey === "owner" || targetRoleKey === "owner") && callerKey !== "owner") {
          throw forbidden("members.owner_only", "Only an owner can assign or change the owner role.");
        }
        // Demoting the last owner would strand the org.
        if (targetRoleKey === "owner" && parsed.data.roleKey !== "owner") {
          if ((await activeOwnerCount(supabase, caller.orgId)) <= 1) {
            throw conflict("members.last_owner", "The organization must keep at least one owner.");
          }
        }
        patch.role_id = await systemRoleId(supabase, parsed.data.roleKey);
      }

      if (parsed.data.status !== undefined) {
        // Suspending the last active owner would lock the org out of admin.
        if (parsed.data.status === "suspended" && targetRoleKey === "owner") {
          if ((await activeOwnerCount(supabase, caller.orgId)) <= 1) {
            throw conflict("members.last_owner", "The organization must keep at least one active owner.");
          }
        }
        patch.status = parsed.data.status;
      }

      if (Object.keys(patch).length === 0) {
        return { userId, updated: false };
      }

      const { error: updErr } = await supabase
        .from("organization_memberships")
        .update(patch)
        .eq("org_id", caller.orgId)
        .eq("user_id", userId);
      if (updErr) throw updErr;

      return { userId, updated: true };
    }
  );

  // DELETE /v1/members/:userId — soft-remove a member (status → 'removed'). If
  // the removed org was their active org, clear it in our DB and in Clerk so
  // their next request resolves cleanly instead of a stale active_org_id.
  app.delete<{ Params: { userId: string } }>(
    "/v1/members/:userId",
    { preHandler: app.requireAuth("members.remove") },
    async (request, _reply) => {
      const { userId } = request.params;
      if (!UUID_RE.test(userId)) throw badRequest("members.invalid_id", "Invalid user id.");
      const caller = request.auth!;
      const supabase = getDb();

      if (userId === caller.userId) {
        throw forbidden("members.cannot_remove_self", "You can't remove yourself from the org.");
      }

      const { data: membership, error: memErr } = await supabase
        .from("organization_memberships")
        .select("id, role:roles!inner ( key )")
        .eq("org_id", caller.orgId)
        .eq("user_id", userId)
        .in("status", ["active", "suspended"])
        .maybeSingle();
      if (memErr) throw memErr;
      if (!membership) throw notFound("members.not_found", "That user is not a member of this org.");
      const targetRoleKey = (membership as unknown as { role: { key: string } | null }).role?.key ?? null;

      if (targetRoleKey === "owner" && (await activeOwnerCount(supabase, caller.orgId)) <= 1) {
        throw conflict("members.last_owner", "The organization must keep at least one owner.");
      }

      const { error: updErr } = await supabase
        .from("organization_memberships")
        .update({ status: "removed" })
        .eq("org_id", caller.orgId)
        .eq("user_id", userId);
      if (updErr) throw updErr;

      // Clear the active org if it pointed here, in our DB and in Clerk.
      const { data: userRow, error: userErr } = await supabase
        .from("users")
        .select("clerk_user_id, active_organization_id")
        .eq("id", userId)
        .maybeSingle();
      if (userErr) throw userErr;
      const u = userRow as { clerk_user_id: string; active_organization_id: string | null } | null;
      if (u && u.active_organization_id === caller.orgId) {
        const { error: clearErr } = await supabase
          .from("users")
          .update({ active_organization_id: null })
          .eq("id", userId);
        if (clearErr) throw clearErr;
        try {
          await getClerk().users.updateUserMetadata(u.clerk_user_id, {
            publicMetadata: { active_org_id: null }
          });
        } catch (err) {
          // Best-effort: the DB is the source of truth; auth re-derives on next
          // request. Log and move on rather than failing the removal.
          request.log.warn({ err }, "members: failed to clear Clerk active_org_id");
        }
      }

      return { userId, removed: true };
    }
  );

  // GET /v1/members/invitations — pending Clerk invitations for this org.
  app.get(
    "/v1/members/invitations",
    { preHandler: app.requireAuth("members.invite") },
    async (request, _reply) => {
      const caller = request.auth!;
      const clerk = getClerk();

      const list = await clerk.invitations.getInvitationList({ status: "pending" });
      const items = (Array.isArray(list) ? list : list.data) as Array<{
        id: string;
        emailAddress: string;
        publicMetadata?: Record<string, unknown> | null;
        status: string;
        createdAt: number;
      }>;

      const invitations = items
        .filter((inv) => (inv.publicMetadata?.invited_org_id as string | undefined) === caller.orgId)
        .map((inv) => ({
          id: inv.id,
          email: inv.emailAddress,
          roleKey: (inv.publicMetadata?.invited_role_key as string | undefined) ?? null,
          status: inv.status,
          createdAt: new Date(inv.createdAt).toISOString()
        }));

      return { orgId: caller.orgId, invitations };
    }
  );

  // POST /v1/members/invitations — invite an email to this org at a given role.
  app.post(
    "/v1/members/invitations",
    { preHandler: app.requireAuth("members.invite") },
    async (request, reply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("members.invalid_input", "Invalid invitation body.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();
      const clerk = getClerk();

      // Only an owner can invite someone straight to owner.
      if (parsed.data.roleKey === "owner") {
        const callerKey = await callerRoleKey(supabase, caller.orgId, caller.userId);
        if (callerKey !== "owner") {
          throw forbidden("members.owner_only", "Only an owner can invite an owner.");
        }
      }

      const redirectUrl = process.env.PORTAL_BASE_URL
        ? `${process.env.PORTAL_BASE_URL.replace(/\/$/, "")}/sign-up`
        : undefined;

      try {
        const invitation = await clerk.invitations.createInvitation({
          emailAddress: parsed.data.email,
          publicMetadata: {
            invited_org_id: caller.orgId,
            invited_role_key: parsed.data.roleKey
          },
          ...(redirectUrl ? { redirectUrl } : {}),
          ignoreExisting: false
        });

        reply.status(201);
        return {
          id: invitation.id,
          email: invitation.emailAddress,
          roleKey: parsed.data.roleKey,
          status: invitation.status,
          createdAt: new Date(invitation.createdAt).toISOString()
        };
      } catch (err) {
        // Surface Clerk's real reason instead of an opaque 500. Clerk backend
        // errors carry a `.status` and an `.errors[]` with human messages.
        const status = (err as { status?: number }).status;
        const clerkErrors = (err as {
          errors?: Array<{ message?: string; longMessage?: string }>;
        }).errors;
        const detail = clerkErrors?.[0]?.longMessage || clerkErrors?.[0]?.message;
        if (status === 422 || status === 409) {
          throw conflict(
            "members.invite_exists",
            detail || "That email already has a pending invitation or is already a member."
          );
        }
        // 400 (bad redirect url / restricted), 401/403 (key/config), etc. —
        // pass the actual message through so the operator can act on it.
        throw badRequest(
          "members.invite_failed",
          detail || (err instanceof Error ? err.message : "Could not send the invitation.")
        );
      }
    }
  );

  // DELETE /v1/members/invitations/:id — revoke a pending invitation. Verify it
  // belongs to the caller's org before revoking (invitations are global in Clerk).
  app.delete<{ Params: { id: string } }>(
    "/v1/members/invitations/:id",
    { preHandler: app.requireAuth("members.invite") },
    async (request, _reply) => {
      const { id } = request.params;
      const caller = request.auth!;
      const clerk = getClerk();

      let invitationOrgId: string | undefined;
      try {
        const list = await clerk.invitations.getInvitationList({ status: "pending" });
        const items = (Array.isArray(list) ? list : list.data) as Array<{
          id: string;
          publicMetadata?: Record<string, unknown> | null;
        }>;
        invitationOrgId = items.find((inv) => inv.id === id)?.publicMetadata?.invited_org_id as
          | string
          | undefined;
      } catch (err) {
        request.log.warn({ err }, "members: failed to load invitation before revoke");
      }
      if (invitationOrgId !== caller.orgId) {
        throw notFound("members.invitation_not_found", "Invitation not found in this organization.");
      }

      await clerk.invitations.revokeInvitation(id);
      return { id, revoked: true };
    }
  );
};

export default membersRoutes;
