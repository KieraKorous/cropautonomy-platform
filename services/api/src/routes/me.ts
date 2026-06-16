import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../lib/db.js";

// GET /v1/me — the signed-in caller's platform identity. The portal gets the
// user's name/email/avatar straight from Clerk; this fills in what Clerk can't:
// the active organization name and the caller's role in it. requireAuth() with
// no permission arg — every authenticated member may read their own identity.

interface OrgRow {
  id: string;
  name: string;
}

// PostgREST embeds the to-one `roles` row as an object under the `role` alias,
// mirroring PermissionResolver in packages/db/src/permissions/index.ts.
interface MembershipRow {
  role: { key: string; name: string } | null;
}

interface UserRow {
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

const meRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/me", { preHandler: app.requireAuth() }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    const [orgResult, membershipResult, userResult] = await Promise.all([
      supabase.from("organizations").select("id, name").eq("id", caller.orgId).single(),
      supabase
        .from("organization_memberships")
        .select("role:roles!inner ( key, name )")
        .eq("user_id", caller.userId)
        .eq("org_id", caller.orgId)
        .eq("status", "active")
        .single(),
      supabase
        .from("users")
        .select("display_name, email, avatar_url")
        .eq("id", caller.userId)
        .single()
    ]);

    if (orgResult.error) throw orgResult.error;
    if (membershipResult.error) throw membershipResult.error;
    if (userResult.error) throw userResult.error;

    const org = orgResult.data as OrgRow;
    const membership = membershipResult.data as unknown as MembershipRow;
    const user = userResult.data as UserRow;

    return {
      userId: caller.userId,
      orgId: caller.orgId,
      org: { id: org.id, name: org.name },
      role: membership.role
        ? { key: membership.role.key, name: membership.role.name }
        : { key: "viewer", name: "Viewer" },
      user: {
        displayName: user.display_name,
        email: user.email,
        avatarUrl: user.avatar_url
      }
    };
  });
};

export default meRoutes;
