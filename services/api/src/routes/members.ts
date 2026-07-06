import type { FastifyPluginAsync } from "fastify";
import { getDb } from "../lib/db.js";

// GET /v1/members — active members of the caller's org, for pickers (e.g. the
// Team page's "add member" control). Read-only; members.read is held by every
// role. Returns the internal user id + display fields + role key.
interface MemberRow {
  user_id: string;
  role: { key: string; name: string } | null;
  user: {
    id: string;
    display_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
}

const membersRoutes: FastifyPluginAsync = async (app) => {
  app.get("/v1/members", { preHandler: app.requireAuth("members.read") }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    // Disambiguate the users embed: organization_memberships has TWO FKs to
    // users (user_id + invited_by_user_id), so PostgREST needs the column hint.
    const { data, error } = await supabase
      .from("organization_memberships")
      .select(
        "user_id, role:roles!inner ( key, name ), user:users!user_id ( id, display_name, email, avatar_url )"
      )
      .eq("org_id", caller.orgId)
      .eq("status", "active");
    if (error) throw error;

    const members = ((data ?? []) as unknown as MemberRow[]).map((r) => ({
      userId: r.user_id,
      displayName: r.user?.display_name ?? null,
      email: r.user?.email ?? null,
      avatarUrl: r.user?.avatar_url ?? null,
      roleKey: r.role?.key ?? null,
      roleName: r.role?.name ?? null
    }));

    return { orgId: caller.orgId, members };
  });
};

export default membersRoutes;
