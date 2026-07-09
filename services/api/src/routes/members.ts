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

// Per-team role assignment (member's side).
const teamRoleSchema = z.object({ roleKey: z.enum(SYSTEM_ROLE_KEYS) });
const addTeamRoleSchema = z.object({
  teamId: z.string().uuid(),
  roleKey: z.enum(SYSTEM_ROLE_KEYS)
});

interface MemberRow {
  id: string;
  user_id: string;
  status: string;
  joined_at: string | null;
  invited_by_user_id: string | null;
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

// Ownership override. Authorization here is role-permission OR ownership: a
// caller may manage a member they personally added even without members.update/
// remove, and may manage team memberships for a member they added or a team they
// created. These predicates back that "OR ownership" branch.

// True if `callerUserId` is the recorded inviter of `targetUserId` in this org.
async function invitedByCaller(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  callerUserId: string,
  targetUserId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("invited_by_user_id")
    .eq("org_id", orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as { invited_by_user_id: string | null } | null)?.invited_by_user_id === callerUserId
  );
}

// True if `callerUserId` created the given team in this org.
async function teamCreatedByCaller(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  callerUserId: string,
  teamId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("teams")
    .select("created_by_user_id")
    .eq("id", teamId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return (
    (data as { created_by_user_id: string | null } | null)?.created_by_user_id === callerUserId
  );
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
          "id, user_id, status, joined_at, invited_by_user_id, role:roles!inner ( key, name ), user:users!user_id ( id, display_name, email, avatar_url )"
        )
        .eq("org_id", caller.orgId)
        .in("status", ["active", "suspended"])
        // A user sees only the members they personally added (invited_by them)
        // plus themselves. No bypass — this holds for every role, owner included.
        // Invited users are attributed via the Clerk invite → webhook chain; the
        // direct-add path sets invited_by_user_id inline.
        .or(`invited_by_user_id.eq.${caller.userId},user_id.eq.${caller.userId}`),
      supabase
        .from("team_memberships")
        .select(
          "user_id, role:roles ( key, name ), team:teams!inner ( id, name, color )"
        )
        .eq("org_id", caller.orgId),
      request.permissions!.hasPermission(ctx, "members.invite"),
      request.permissions!.hasPermission(ctx, "members.update"),
      request.permissions!.hasPermission(ctx, "members.remove")
    ]);
    if (membersResult.error) throw membersResult.error;
    if (teamRowsResult.error) throw teamRowsResult.error;

    // Group each member's teams (with their per-team role) by user for the detail view.
    type MemberTeam = {
      id: string;
      name: string;
      color: string | null;
      roleKey: string | null;
      roleName: string | null;
    };
    const teamsByUser = new Map<string, MemberTeam[]>();
    for (const r of (teamRowsResult.data ?? []) as unknown as Array<{
      user_id: string;
      role: { key: string; name: string } | null;
      team: { id: string; name: string; color: string | null } | null;
    }>) {
      if (!r.team) continue;
      const list = teamsByUser.get(r.user_id) ?? [];
      list.push({
        id: r.team.id,
        name: r.team.name,
        color: r.team.color,
        roleKey: r.role?.key ?? null,
        roleName: r.role?.name ?? null
      });
      teamsByUser.set(r.user_id, list);
    }

    const members = ((membersResult.data ?? []) as unknown as MemberRow[]).map((r) => {
      const isSelf = r.user_id === caller.userId;
      // Your own row always presents as Owner — you own your scoped world. This is
      // a DISPLAY/identity override on the self row only; it does NOT change the
      // stored membership role or grant org-wide owner permissions (those still
      // flow from the actual role + the ownership overrides).
      return {
        membershipId: r.id,
        userId: r.user_id,
        displayName: r.user?.display_name ?? null,
        email: r.user?.email ?? null,
        avatarUrl: r.user?.avatar_url ?? null,
        roleKey: isSelf ? "owner" : r.role?.key ?? null,
        roleName: isSelf ? "Owner" : r.role?.name ?? null,
        status: r.status,
        joinedAt: r.joined_at,
        isSelf,
        isOwner: isSelf || r.role?.key === "owner",
        // Ownership: you fully manage the members you personally added. (The
        // roster is scoped to your invitees + yourself, so this is true for
        // everyone here except your own row.) Permission holders also get it.
        canManage: (canUpdate || canRemove || r.invited_by_user_id === caller.userId) && !isSelf,
        teams: teamsByUser.get(r.user_id) ?? []
      };
    });

    return {
      orgId: caller.orgId,
      // Anyone can invite now — the invitee becomes theirs to manage.
      canInvite: true,
      canManageMembers: canUpdate || canRemove,
      members
    };
  });

  // PATCH /v1/members/:userId — change a member's role and/or status.
  app.patch<{ Params: { userId: string } }>(
    "/v1/members/:userId",
    { preHandler: app.requireAuth() },
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
        .select("id, invited_by_user_id, role:roles!inner ( key )")
        .eq("org_id", caller.orgId)
        .eq("user_id", userId)
        .in("status", ["active", "suspended"])
        .maybeSingle();
      if (memErr) throw memErr;
      if (!membership) throw notFound("members.not_found", "That user is not a member of this org.");
      const membershipRow = membership as unknown as {
        invited_by_user_id: string | null;
        role: { key: string } | null;
      };
      const targetRoleKey = membershipRow.role?.key ?? null;

      // Authorize: role-permission OR ownership (you added this member). The
      // owner/last-owner guards below still apply on top of this.
      const canManage =
        (await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "members.update"
        )) || membershipRow.invited_by_user_id === caller.userId;
      if (!canManage) {
        throw forbidden("members.forbidden", "You can only manage members you added.");
      }

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
    { preHandler: app.requireAuth() },
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
        .select("id, invited_by_user_id, role:roles!inner ( key )")
        .eq("org_id", caller.orgId)
        .eq("user_id", userId)
        .in("status", ["active", "suspended"])
        .maybeSingle();
      if (memErr) throw memErr;
      if (!membership) throw notFound("members.not_found", "That user is not a member of this org.");
      const membershipRow = membership as unknown as {
        invited_by_user_id: string | null;
        role: { key: string } | null;
      };
      const targetRoleKey = membershipRow.role?.key ?? null;

      // Authorize: role-permission OR ownership (you added this member).
      const canManage =
        (await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "members.remove"
        )) || membershipRow.invited_by_user_id === caller.userId;
      if (!canManage) {
        throw forbidden("members.forbidden", "You can only remove members you added.");
      }

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
    // Anyone can invite; the invitee is attributed to (and managed by) them.
    { preHandler: app.requireAuth() },
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

      // An invite is to JOIN THIS ORG, not just to create a site account. If the
      // email already belongs to a platform user (Clerk would reject it as
      // "taken"), add them to this org directly instead of emailing them.
      const { data: existing, error: existingErr } = await supabase
        .from("users")
        .select("id, clerk_user_id, active_organization_id")
        .eq("email", parsed.data.email)
        .maybeSingle();
      if (existingErr) throw existingErr;

      if (existing) {
        const existingUser = existing as {
          id: string;
          clerk_user_id: string | null;
          active_organization_id: string | null;
        };
        const roleId = await systemRoleId(supabase, parsed.data.roleKey);

        // Reactivate a prior membership, or create a fresh one. Already-active →
        // conflict so the caller knows there's nothing to do.
        const { data: prior, error: priorErr } = await supabase
          .from("organization_memberships")
          .select("id, status")
          .eq("org_id", caller.orgId)
          .eq("user_id", existingUser.id)
          .maybeSingle();
        if (priorErr) throw priorErr;

        if (prior && (prior as { status: string }).status === "active") {
          throw conflict("members.already_member", "That user is already a member of this org.");
        }
        if (prior) {
          // Re-attribute to whoever re-added them, so the re-adder sees them.
          const { error: reErr } = await supabase
            .from("organization_memberships")
            .update({ status: "active", role_id: roleId, invited_by_user_id: caller.userId })
            .eq("id", (prior as { id: string }).id);
          if (reErr) throw reErr;
        } else {
          const { error: insErr } = await supabase.from("organization_memberships").insert({
            org_id: caller.orgId,
            user_id: existingUser.id,
            role_id: roleId,
            status: "active",
            invited_by_user_id: caller.userId,
            joined_at: new Date().toISOString()
          });
          if (insErr) throw insErr;
        }

        // Give them an active org if they have none yet, so their next request
        // lands in this org. Don't clobber an existing selection.
        if (!existingUser.active_organization_id) {
          const { error: aoErr } = await supabase
            .from("users")
            .update({ active_organization_id: caller.orgId })
            .eq("id", existingUser.id);
          if (aoErr) throw aoErr;
          if (existingUser.clerk_user_id) {
            try {
              await clerk.users.updateUserMetadata(existingUser.clerk_user_id, {
                publicMetadata: { active_org_id: caller.orgId, platform_user_id: existingUser.id }
              });
            } catch (err) {
              request.log.warn({ err }, "members: failed to set Clerk active_org_id for added user");
            }
          }
        }

        reply.status(201);
        return {
          kind: "added" as const,
          userId: existingUser.id,
          email: parsed.data.email,
          roleKey: parsed.data.roleKey
        };
      }

      const redirectUrl = process.env.PORTAL_BASE_URL
        ? `${process.env.PORTAL_BASE_URL.replace(/\/$/, "")}/sign-up`
        : undefined;

      try {
        const invitation = await clerk.invitations.createInvitation({
          emailAddress: parsed.data.email,
          publicMetadata: {
            invited_org_id: caller.orgId,
            invited_role_key: parsed.data.roleKey,
            // Attribute the eventual membership back to the inviter so it shows
            // up in their (and only their) roster. Read by the Clerk webhook.
            invited_by_platform_user_id: caller.userId
          },
          ...(redirectUrl ? { redirectUrl } : {}),
          ignoreExisting: false
        });

        reply.status(201);
        return {
          kind: "invited" as const,
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

  // --- Per-team roles -------------------------------------------------------
  // A member's role is assigned per team. These endpoints manage the member's
  // team memberships (with a role each) from the member's side. Gated on
  // team_members.manage (admin/owner), same as the team-page roster controls.

  // Confirm the team exists in the caller's org and the target user is an active
  // member of that org — both required before touching team_memberships.
  async function assertTeamAndMember(orgId: string, teamId: string, userId: string) {
    const supabase = getDb();
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, org_id")
      .eq("id", teamId)
      .maybeSingle();
    if (teamErr) throw teamErr;
    if (!team || (team as { org_id: string }).org_id !== orgId) {
      throw notFound("members.team_not_found", "Team not found in this organization.");
    }
    const { data: membership, error: memErr } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (memErr) throw memErr;
    if (!membership) {
      throw badRequest("members.not_org_member", "That user is not an active member of this org.");
    }
  }

  // POST /v1/members/:userId/teams — add the member to a team with a role.
  app.post<{ Params: { userId: string } }>(
    "/v1/members/:userId/teams",
    { preHandler: app.requireAuth() },
    async (request, reply) => {
      const { userId } = request.params;
      if (!UUID_RE.test(userId)) throw badRequest("members.invalid_id", "Invalid user id.");
      const parsed = addTeamRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("members.invalid_input", "Invalid team assignment.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await assertTeamAndMember(caller.orgId, parsed.data.teamId, userId);
      // Authorize: role-permission OR you added this member OR you created this
      // team. Owner-role grants stay owner-only (guard below).
      if (
        !(await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "team_members.manage"
        )) &&
        !(await invitedByCaller(supabase, caller.orgId, caller.userId, userId)) &&
        !(await teamCreatedByCaller(supabase, caller.orgId, caller.userId, parsed.data.teamId))
      ) {
        throw forbidden(
          "members.team_forbidden",
          "You can only manage teams you created or members you added."
        );
      }
      // Only an owner can grant the owner role — otherwise an admin could
      // escalate to owner-level permissions via the team-role union.
      if (parsed.data.roleKey === "owner") {
        const callerKey = await callerRoleKey(supabase, caller.orgId, caller.userId);
        if (callerKey !== "owner") {
          throw forbidden("members.owner_only", "Only an owner can assign the owner role.");
        }
      }
      const roleId = await systemRoleId(supabase, parsed.data.roleKey);

      // Upsert on the (team_id, user_id) unique constraint so re-adding just
      // updates the role rather than erroring.
      const { error: upErr } = await supabase
        .from("team_memberships")
        .upsert(
          {
            team_id: parsed.data.teamId,
            user_id: userId,
            org_id: caller.orgId,
            role_id: roleId,
            added_by_user_id: caller.userId
          },
          { onConflict: "team_id,user_id" }
        );
      if (upErr) throw upErr;

      reply.status(201);
      return { userId, teamId: parsed.data.teamId, roleKey: parsed.data.roleKey, added: true };
    }
  );

  // PATCH /v1/members/:userId/teams/:teamId — change the member's role on a team.
  app.patch<{ Params: { userId: string; teamId: string } }>(
    "/v1/members/:userId/teams/:teamId",
    { preHandler: app.requireAuth() },
    async (request, _reply) => {
      const { userId, teamId } = request.params;
      if (!UUID_RE.test(userId) || !UUID_RE.test(teamId)) {
        throw badRequest("members.invalid_id", "Invalid id.");
      }
      const parsed = teamRoleSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("members.invalid_input", "Invalid role.", { issues: parsed.error.issues });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await assertTeamAndMember(caller.orgId, teamId, userId);
      if (
        !(await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "team_members.manage"
        )) &&
        !(await invitedByCaller(supabase, caller.orgId, caller.userId, userId)) &&
        !(await teamCreatedByCaller(supabase, caller.orgId, caller.userId, teamId))
      ) {
        throw forbidden(
          "members.team_forbidden",
          "You can only manage teams you created or members you added."
        );
      }
      if (parsed.data.roleKey === "owner") {
        const callerKey = await callerRoleKey(supabase, caller.orgId, caller.userId);
        if (callerKey !== "owner") {
          throw forbidden("members.owner_only", "Only an owner can assign the owner role.");
        }
      }
      const roleId = await systemRoleId(supabase, parsed.data.roleKey);

      const { error: updErr } = await supabase
        .from("team_memberships")
        .update({ role_id: roleId })
        .eq("org_id", caller.orgId)
        .eq("team_id", teamId)
        .eq("user_id", userId);
      if (updErr) throw updErr;

      return { userId, teamId, roleKey: parsed.data.roleKey, updated: true };
    }
  );

  // DELETE /v1/members/:userId/teams/:teamId — remove the member from a team.
  app.delete<{ Params: { userId: string; teamId: string } }>(
    "/v1/members/:userId/teams/:teamId",
    { preHandler: app.requireAuth() },
    async (request, _reply) => {
      const { userId, teamId } = request.params;
      if (!UUID_RE.test(userId) || !UUID_RE.test(teamId)) {
        throw badRequest("members.invalid_id", "Invalid id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      if (
        !(await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "team_members.manage"
        )) &&
        !(await invitedByCaller(supabase, caller.orgId, caller.userId, userId)) &&
        !(await teamCreatedByCaller(supabase, caller.orgId, caller.userId, teamId))
      ) {
        throw forbidden(
          "members.team_forbidden",
          "You can only manage teams you created or members you added."
        );
      }

      const { error: delErr } = await supabase
        .from("team_memberships")
        .delete()
        .eq("org_id", caller.orgId)
        .eq("team_id", teamId)
        .eq("user_id", userId);
      if (delErr) throw delErr;

      return { userId, teamId, removed: true };
    }
  );
};

export default membersRoutes;
