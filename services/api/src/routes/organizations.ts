import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getClerk } from "../lib/clerk.js";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

// Organization onboarding + selection for the signed-in user. These endpoints
// use requireUser (not requireAuth) because a user with no active org — the
// "blank" state for anyone who signed up without an invite — must still be able
// to list, create, and pick an org. Switching/creating updates BOTH the DB
// (public.users.active_organization_id, which the API reads as orgId) AND Clerk
// publicMetadata.active_org_id (the JWT claim Supabase RLS reads) — the same
// two-sided pattern as the invite flow in members.ts.

const createOrgSchema = z.object({ name: z.string().trim().min(2).max(80) });
const setActiveSchema = z.object({ orgId: z.string().uuid() });

// A URL-safe, unique-per-org slug seed from the display name. Uniqueness is
// enforced by the DB; on collision we append a short suffix.
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "org";
}

function shortSuffix(): string {
  return Math.random().toString(36).slice(2, 6);
}

interface OrgMembershipRow {
  org: { id: string; name: string; slug: string };
  role: { key: string; name: string } | null;
}

const organizationsRoutes: FastifyPluginAsync = async (app) => {
  const clerk = getClerk();

  // GET /v1/me/organizations — every org the caller is an active member of,
  // flagged with which one is active. Empty for a blank-org user.
  app.get("/v1/me/organizations", { preHandler: app.requireUser() }, async (request) => {
    const caller = request.userAuth!;
    const supabase = getDb();

    const { data, error } = await supabase
      .from("organization_memberships")
      .select("org:organizations!inner ( id, name, slug ), role:roles ( key, name )")
      .eq("user_id", caller.userId)
      .eq("status", "active");
    if (error) throw error;

    const rows = (data ?? []) as unknown as OrgMembershipRow[];
    const organizations = rows.map((r) => ({
      id: r.org.id,
      name: r.org.name,
      slug: r.org.slug,
      roleKey: r.role?.key ?? null,
      roleName: r.role?.name ?? null,
      isActive: r.org.id === caller.activeOrgId
    }));
    organizations.sort(
      (a, b) => Number(b.isActive) - Number(a.isActive) || a.name.localeCompare(b.name)
    );

    return { organizations, activeOrgId: caller.activeOrgId };
  });

  // POST /v1/me/active-organization — switch the caller's active org to one they
  // already belong to.
  app.post("/v1/me/active-organization", { preHandler: app.requireUser() }, async (request) => {
    const caller = request.userAuth!;
    const parsed = setActiveSchema.safeParse(request.body);
    if (!parsed.success) throw badRequest("org.invalid", "Provide a valid orgId.");
    const supabase = getDb();

    const { data: membership, error: mErr } = await supabase
      .from("organization_memberships")
      .select("id")
      .eq("user_id", caller.userId)
      .eq("org_id", parsed.data.orgId)
      .eq("status", "active")
      .maybeSingle();
    if (mErr) throw mErr;
    if (!membership) {
      throw forbidden("org.not_a_member", "You are not a member of that organization.");
    }

    const { error: uErr } = await supabase
      .from("users")
      .update({ active_organization_id: parsed.data.orgId })
      .eq("id", caller.userId);
    if (uErr) throw uErr;

    await syncClerkActiveOrg(request, clerk, caller.clerkUserId, parsed.data.orgId, caller.userId);
    return { ok: true };
  });

  // POST /v1/organizations — self-serve create: the caller becomes the Owner and
  // the new org becomes their active one.
  app.post("/v1/organizations", { preHandler: app.requireUser() }, async (request, reply) => {
    const caller = request.userAuth!;
    const parsed = createOrgSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest("org.invalid_name", "Organization name must be 2–80 characters.");
    }
    const name = parsed.data.name;
    const supabase = getDb();

    const { data: ownerRole, error: roleErr } = await supabase
      .from("roles")
      .select("id")
      .eq("key", "owner")
      .eq("is_system", true)
      .maybeSingle();
    if (roleErr) throw roleErr;
    if (!ownerRole) throw notFound("org.no_owner_role", "Owner role is not configured.");

    let slug = slugify(name);
    const { data: existing, error: slugErr } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (slugErr) throw slugErr;
    if (existing) slug = `${slug}-${shortSuffix()}`;

    const { data: orgRow, error: orgErr } = await supabase
      .from("organizations")
      .insert({ name, slug, status: "active" })
      .select("id, name, slug")
      .single();
    if (orgErr) {
      throw conflict("org.create_failed", "Could not create organization. Try a different name.");
    }
    const org = orgRow as { id: string; name: string; slug: string };

    const { error: memErr } = await supabase.from("organization_memberships").insert({
      org_id: org.id,
      user_id: caller.userId,
      role_id: (ownerRole as { id: string }).id,
      status: "active",
      joined_at: new Date().toISOString()
    });
    if (memErr) throw memErr;

    const { error: aoErr } = await supabase
      .from("users")
      .update({ active_organization_id: org.id })
      .eq("id", caller.userId);
    if (aoErr) throw aoErr;

    await syncClerkActiveOrg(request, clerk, caller.clerkUserId, org.id, caller.userId);

    reply.status(201);
    return {
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        roleKey: "owner",
        roleName: "Owner",
        isActive: true
      }
    };
  });
};

// Mirror the active org into Clerk publicMetadata so the JWT org_id claim (used
// by Supabase RLS) tracks the DB. Best-effort: the API reads orgId from the DB,
// so a failed sync doesn't break API access — it's logged, not thrown.
async function syncClerkActiveOrg(
  request: FastifyRequest,
  clerk: ReturnType<typeof getClerk>,
  clerkUserId: string,
  orgId: string,
  platformUserId: string
): Promise<void> {
  try {
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { active_org_id: orgId, platform_user_id: platformUserId }
    });
  } catch (err) {
    request.log.warn({ err }, "organizations: failed to sync Clerk active_org_id");
  }
}

export default organizationsRoutes;
