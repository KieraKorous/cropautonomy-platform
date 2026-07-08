import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { publishBestEffort } from "../lib/live.js";
import { channels } from "@gaia/realtime/channels";
import type { TeamResourceType } from "../lib/team-scope.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// The five assignable entity types → their backing tables. One place so the
// polymorphic team_assignments plumbing and the org-scope validation agree.
const RESOURCE_TABLE: Record<TeamResourceType, string> = {
  farm: "farms",
  field: "fields",
  device: "devices",
  capture_session: "capture_sessions",
  capture: "captures",
  scout_task: "scout_tasks"
};
const RESOURCE_TYPES = Object.keys(RESOURCE_TABLE) as TeamResourceType[];

const createTeamSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  color: z.string().max(32).nullable().optional()
});

const updateTeamSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(2000).nullable().optional(),
    color: z.string().max(32).nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

const addMemberSchema = z.object({ userId: z.string().uuid() });

const assignmentItemSchema = z.object({
  resourceType: z.enum([
    "farm",
    "field",
    "device",
    "capture_session",
    "capture",
    "scout_task"
  ]),
  resourceId: z.string().uuid()
});

const assignSchema = z.object({
  assignments: z.array(assignmentItemSchema).min(1).max(500),
  // With a farm in the list, also assign its fields, sessions, and captures.
  cascade: z.literal("farm_descendants").optional()
});

const unassignSchema = z.object({
  assignments: z.array(assignmentItemSchema).min(1).max(500)
});

interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
  updated_at: string;
}

function toTeamSummary(
  row: TeamRow,
  memberCount: number,
  assignmentCounts: Record<TeamResourceType, number>
) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    memberCount,
    assignmentCounts,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function emptyCounts(): Record<TeamResourceType, number> {
  return { farm: 0, field: 0, device: 0, capture_session: 0, capture: 0, scout_task: 0 };
}

// Load a team scoped to the caller's org, or throw 404 across tenants.
async function loadTeam(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  teamId: string
): Promise<TeamRow> {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, description, color, created_at, updated_at, org_id")
    .eq("id", teamId)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as { org_id: string }).org_id !== orgId) {
    throw notFound("teams.not_found", "Team not found.");
  }
  return data as TeamRow;
}

// Every capture/field/session/capture under a farm — the cascade target set.
async function resolveFarmDescendants(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  farmId: string
): Promise<Array<{ resourceType: TeamResourceType; resourceId: string }>> {
  const out: Array<{ resourceType: TeamResourceType; resourceId: string }> = [];

  const { data: fieldRows, error: fieldErr } = await supabase
    .from("fields")
    .select("id")
    .eq("org_id", orgId)
    .eq("farm_id", farmId);
  if (fieldErr) throw fieldErr;
  const fieldIds = ((fieldRows ?? []) as Array<{ id: string }>).map((r) => r.id);
  for (const id of fieldIds) out.push({ resourceType: "field", resourceId: id });

  // Sessions and captures that belong to the farm directly or via its fields.
  const sessionQuery = supabase
    .from("capture_sessions")
    .select("id")
    .eq("org_id", orgId);
  const { data: sessionRows, error: sessionErr } = await (fieldIds.length
    ? sessionQuery.or(`farm_id.eq.${farmId},field_id.in.(${fieldIds.join(",")})`)
    : sessionQuery.eq("farm_id", farmId));
  if (sessionErr) throw sessionErr;
  for (const r of (sessionRows ?? []) as Array<{ id: string }>) {
    out.push({ resourceType: "capture_session", resourceId: r.id });
  }

  const captureQuery = supabase.from("captures").select("id").eq("org_id", orgId);
  const { data: captureRows, error: captureErr } = await (fieldIds.length
    ? captureQuery.or(`farm_id.eq.${farmId},field_id.in.(${fieldIds.join(",")})`)
    : captureQuery.eq("farm_id", farmId));
  if (captureErr) throw captureErr;
  for (const r of (captureRows ?? []) as Array<{ id: string }>) {
    out.push({ resourceType: "capture", resourceId: r.id });
  }

  return out;
}

// Confirm each referenced resource exists in the caller's org before assigning.
async function assertResourcesInOrg(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  items: Array<{ resourceType: TeamResourceType; resourceId: string }>
) {
  // Group by type so we validate one table at a time with a single `in` query.
  const byType = new Map<TeamResourceType, string[]>();
  for (const it of items) {
    const list = byType.get(it.resourceType) ?? [];
    list.push(it.resourceId);
    byType.set(it.resourceType, list);
  }
  for (const [type, ids] of byType) {
    const uniqueIds = [...new Set(ids)];
    const { data, error } = await supabase
      .from(RESOURCE_TABLE[type])
      .select("id")
      .eq("org_id", orgId)
      .in("id", uniqueIds);
    if (error) throw error;
    const found = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
    for (const id of uniqueIds) {
      if (!found.has(id)) {
        throw notFound(
          "teams.resource_not_found",
          `Referenced ${type} does not exist in this organization.`
        );
      }
    }
  }
}

const teamsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/teams — the org's teams with member + per-type assignment counts.
  // canManage lets the page render create/edit/delete + roster controls.
  app.get("/v1/teams", { preHandler: app.requireAuth("teams.read") }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    const [teamsResult, membersResult, assignmentsResult] = await Promise.all([
      supabase
        .from("teams")
        .select("id, name, description, color, created_at, updated_at")
        .eq("org_id", caller.orgId)
        .order("name", { ascending: true }),
      supabase.from("team_memberships").select("team_id").eq("org_id", caller.orgId),
      supabase
        .from("team_assignments")
        .select("team_id, resource_type")
        .eq("org_id", caller.orgId)
    ]);
    if (teamsResult.error) throw teamsResult.error;
    if (membersResult.error) throw membersResult.error;
    if (assignmentsResult.error) throw assignmentsResult.error;

    const memberCounts = new Map<string, number>();
    for (const r of (membersResult.data ?? []) as Array<{ team_id: string }>) {
      memberCounts.set(r.team_id, (memberCounts.get(r.team_id) ?? 0) + 1);
    }
    const assignCounts = new Map<string, Record<TeamResourceType, number>>();
    for (const r of (assignmentsResult.data ?? []) as Array<{
      team_id: string;
      resource_type: TeamResourceType;
    }>) {
      const counts = assignCounts.get(r.team_id) ?? emptyCounts();
      counts[r.resource_type] += 1;
      assignCounts.set(r.team_id, counts);
    }

    const canManage = await request.permissions!.hasPermission(
      { userId: caller.userId, orgId: caller.orgId },
      "teams.create"
    );

    const rows = (teamsResult.data ?? []) as TeamRow[];
    return {
      orgId: caller.orgId,
      canManage,
      teams: rows.map((row) =>
        toTeamSummary(
          row,
          memberCounts.get(row.id) ?? 0,
          assignCounts.get(row.id) ?? emptyCounts()
        )
      )
    };
  });

  // GET /v1/me/teams — the caller's own team memberships. Drives the field app's
  // capture team picker and self-assignment default. Auth-only (any member).
  app.get("/v1/me/teams", { preHandler: app.requireAuth() }, async (request, _reply) => {
    const caller = request.auth!;
    const supabase = getDb();

    const { data, error } = await supabase
      .from("team_memberships")
      .select("team:teams!inner ( id, name, color )")
      .eq("org_id", caller.orgId)
      .eq("user_id", caller.userId);
    if (error) throw error;

    const teams = ((data ?? []) as unknown as Array<{
      team: { id: string; name: string; color: string | null } | null;
    }>)
      .map((r) => r.team)
      .filter((t): t is { id: string; name: string; color: string | null } => t != null);
    return { teams };
  });

  // POST /v1/teams — create a team in the caller's org.
  app.post("/v1/teams", { preHandler: app.requireAuth("teams.create") }, async (request, reply) => {
    const caller = request.auth!;
    const parsed = createTeamSchema.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest("teams.invalid_input", "Invalid team body.", {
        issues: parsed.error.issues
      });
    }
    const body = parsed.data;
    const supabase = getDb();

    const { data: inserted, error: insertErr } = await supabase
      .from("teams")
      .insert({
        org_id: caller.orgId,
        name: body.name,
        description: body.description ?? null,
        color: body.color ?? null,
        created_by_user_id: caller.userId
      })
      .select("id, name, description, color, created_at, updated_at")
      .single();
    if (insertErr) {
      // Unique (org_id, lower(name)) violation → 409 rather than opaque 500.
      if ((insertErr as { code?: string }).code === "23505") {
        throw conflict("teams.duplicate_name", "A team with this name already exists.");
      }
      throw insertErr;
    }

    reply.status(201);
    return toTeamSummary(inserted as TeamRow, 0, emptyCounts());
  });

  // GET /v1/teams/:id — one team with its members and grouped assignments.
  app.get<{ Params: { id: string } }>(
    "/v1/teams/:id",
    { preHandler: app.requireAuth("teams.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const caller = request.auth!;
      const supabase = getDb();

      const team = await loadTeam(supabase, caller.orgId, id);

      const [membersResult, assignmentsResult] = await Promise.all([
        // Disambiguate the users embed: team_memberships has TWO FKs to users
        // (user_id + added_by_user_id), so PostgREST needs the column hint.
        supabase
          .from("team_memberships")
          .select("user_id, created_at, user:users!user_id ( id, display_name, email, avatar_url )")
          .eq("org_id", caller.orgId)
          .eq("team_id", id),
        supabase
          .from("team_assignments")
          .select("resource_type, resource_id, created_at")
          .eq("org_id", caller.orgId)
          .eq("team_id", id)
      ]);
      if (membersResult.error) throw membersResult.error;
      if (assignmentsResult.error) throw assignmentsResult.error;

      const members = ((membersResult.data ?? []) as unknown as Array<{
        user_id: string;
        created_at: string;
        user: {
          id: string;
          display_name: string | null;
          email: string | null;
          avatar_url: string | null;
        } | null;
      }>).map((r) => ({
        userId: r.user_id,
        displayName: r.user?.display_name ?? null,
        email: r.user?.email ?? null,
        avatarUrl: r.user?.avatar_url ?? null,
        addedAt: r.created_at
      }));

      const assignments: Record<TeamResourceType, string[]> = {
        farm: [],
        field: [],
        device: [],
        capture_session: [],
        capture: [],
        scout_task: []
      };
      for (const r of (assignmentsResult.data ?? []) as Array<{
        resource_type: TeamResourceType;
        resource_id: string;
      }>) {
        assignments[r.resource_type].push(r.resource_id);
      }

      return {
        team: toTeamSummary(
          team,
          members.length,
          RESOURCE_TYPES.reduce((acc, t) => {
            acc[t] = assignments[t].length;
            return acc;
          }, emptyCounts())
        ),
        members,
        assignments
      };
    }
  );

  // PATCH /v1/teams/:id — rename / recolor / re-describe.
  app.patch<{ Params: { id: string } }>(
    "/v1/teams/:id",
    { preHandler: app.requireAuth("teams.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const parsed = updateTeamSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("teams.invalid_input", "Invalid team update.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      const patch: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.description !== undefined) patch.description = parsed.data.description;
      if (parsed.data.color !== undefined) patch.color = parsed.data.color;

      const { error: updErr } = await supabase
        .from("teams")
        .update(patch)
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (updErr) {
        if ((updErr as { code?: string }).code === "23505") {
          throw conflict("teams.duplicate_name", "A team with this name already exists.");
        }
        throw updErr;
      }

      const updated = await loadTeam(supabase, caller.orgId, id);
      return toTeamSummary(updated, 0, emptyCounts());
    }
  );

  // DELETE /v1/teams/:id — delete a team. Memberships + assignments cascade on
  // the team FK; entities that were only visible via this team fall back to
  // org-visible if they lose their last assignment.
  app.delete<{ Params: { id: string } }>(
    "/v1/teams/:id",
    { preHandler: app.requireAuth("teams.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      const { error: delErr } = await supabase
        .from("teams")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { teamId: id, deleted: true };
    }
  );

  // POST /v1/teams/:id/members — add an active org member to the team.
  app.post<{ Params: { id: string } }>(
    "/v1/teams/:id/members",
    { preHandler: app.requireAuth("team_members.manage") },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const parsed = addMemberSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("teams.invalid_input", "Invalid member body.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      // The user must be an active member of this org to join a team in it.
      const { data: membership, error: membershipErr } = await supabase
        .from("organization_memberships")
        .select("id")
        .eq("org_id", caller.orgId)
        .eq("user_id", parsed.data.userId)
        .eq("status", "active")
        .maybeSingle();
      if (membershipErr) throw membershipErr;
      if (!membership) {
        throw badRequest(
          "teams.not_org_member",
          "That user is not an active member of this organization."
        );
      }

      const { error: insErr } = await supabase
        .from("team_memberships")
        .insert({
          team_id: id,
          user_id: parsed.data.userId,
          org_id: caller.orgId,
          added_by_user_id: caller.userId
        });
      if (insErr && (insErr as { code?: string }).code !== "23505") throw insErr;

      reply.status(201);
      return { teamId: id, userId: parsed.data.userId, added: true };
    }
  );

  // DELETE /v1/teams/:id/members/:userId — remove a user from the team.
  app.delete<{ Params: { id: string; userId: string } }>(
    "/v1/teams/:id/members/:userId",
    { preHandler: app.requireAuth("team_members.manage") },
    async (request, _reply) => {
      const { id, userId } = request.params;
      if (!UUID_RE.test(id) || !UUID_RE.test(userId)) {
        throw badRequest("teams.invalid_id", "Invalid id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      const { error: delErr } = await supabase
        .from("team_memberships")
        .delete()
        .eq("team_id", id)
        .eq("user_id", userId)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { teamId: id, userId, removed: true };
    }
  );

  // POST /v1/teams/:id/assignments — assign entities to the team. With
  // cascade:'farm_descendants', each farm in the list also pulls in its fields,
  // sessions, and captures. Idempotent (unique constraint + ignoreDuplicates).
  app.post<{ Params: { id: string } }>(
    "/v1/teams/:id/assignments",
    { preHandler: app.requireAuth("teams.assign") },
    async (request, reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const parsed = assignSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("teams.invalid_input", "Invalid assignment body.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      // Expand cascade before validation so descendants are org-checked too.
      let items = [...parsed.data.assignments];
      if (parsed.data.cascade === "farm_descendants") {
        const farmIds = items
          .filter((it) => it.resourceType === "farm")
          .map((it) => it.resourceId);
        for (const farmId of farmIds) {
          items.push(...(await resolveFarmDescendants(supabase, caller.orgId, farmId)));
        }
      }
      // De-dupe (cascade can overlap explicit picks).
      const seen = new Set<string>();
      items = items.filter((it) => {
        const key = `${it.resourceType}:${it.resourceId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      await assertResourcesInOrg(supabase, caller.orgId, items);

      const rows = items.map((it) => ({
        team_id: id,
        org_id: caller.orgId,
        resource_type: it.resourceType,
        resource_id: it.resourceId,
        assigned_by_user_id: caller.userId
      }));

      const { error: insErr } = await supabase
        .from("team_assignments")
        .upsert(rows, {
          onConflict: "team_id,resource_type,resource_id",
          ignoreDuplicates: true
        });
      if (insErr) throw insErr;

      // Announce each assignment so open list views + the Live wall re-fetch
      // (visibility may have shifted). Best-effort; the DB row is the truth.
      for (const it of items) {
        await publishBestEffort(request.log, channels.orgTeams(caller.orgId), {
          type: "team.assignment.changed",
          version: 1,
          payload: {
            orgId: caller.orgId,
            teamId: id,
            resourceType: it.resourceType,
            resourceId: it.resourceId,
            changeType: "assigned"
          }
        });
      }

      reply.status(201);
      return { teamId: id, assigned: items.length };
    }
  );

  // DELETE /v1/teams/:id/assignments — unassign entities from the team.
  app.delete<{ Params: { id: string } }>(
    "/v1/teams/:id/assignments",
    { preHandler: app.requireAuth("teams.assign") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("teams.invalid_id", "Invalid team id.");
      const parsed = unassignSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("teams.invalid_input", "Invalid unassignment body.", {
          issues: parsed.error.issues
        });
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTeam(supabase, caller.orgId, id);

      for (const it of parsed.data.assignments) {
        const { error: delErr } = await supabase
          .from("team_assignments")
          .delete()
          .eq("team_id", id)
          .eq("org_id", caller.orgId)
          .eq("resource_type", it.resourceType)
          .eq("resource_id", it.resourceId);
        if (delErr) throw delErr;

        await publishBestEffort(request.log, channels.orgTeams(caller.orgId), {
          type: "team.assignment.changed",
          version: 1,
          payload: {
            orgId: caller.orgId,
            teamId: id,
            resourceType: it.resourceType,
            resourceId: it.resourceId,
            changeType: "unassigned"
          }
        });
      }

      return { teamId: id, unassigned: parsed.data.assignments.length };
    }
  );
};

export default teamsRoutes;
