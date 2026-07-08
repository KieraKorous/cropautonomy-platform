import type { FastifyBaseLogger, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { publishBestEffort } from "../lib/live.js";
import { channels } from "@gaia/realtime/channels";
import {
  applyTeamFilter,
  canSeeResource,
  resolveTeamScope
} from "../lib/team-scope.js";

// Scout tasks — the day's field-work to-dos. Backs the portal "Today's scout
// list" page and the field PWA's "My tasks". Visibility reuses the polymorphic
// team_assignments boundary (see 0026_teams.sql / lib/team-scope.ts): a task is
// visible to a caller under the same (A) bypass / (B) unassigned / (C) shared
// team rule as every other assignable entity. `assignee_user_id` is the person
// RESPONSIBLE, not a visibility control.

const UUID_RE = /^[0-9a-f-]{36}$/i;

const STATUS = z.enum(["open", "in_progress", "done"]);
const PRIORITY = z.enum(["low", "normal", "high", "immediate"]);

const SCOUT_TASK_SELECT =
  "id, org_id, title, details, status, priority, assignee_user_id, farm_id, field_id, zone_id, due_on, origin_type, origin_capture_id, created_by_user_id, completed_by_user_id, completed_at, created_at, updated_at";

const listQuerySchema = z.object({
  // Comma-separated status list, e.g. "open,in_progress".
  status: z.string().optional(),
  // A specific assignee's tasks, or "me" for the caller's own.
  assignee: z.string().optional(),
  due: z.enum(["today", "week", "overdue"]).optional(),
  teamId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0)
});

const createSchema = z.object({
  title: z.string().min(1).max(500),
  details: z.string().max(5000).nullable().optional(),
  status: STATUS.optional(),
  priority: PRIORITY.nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD.").nullable().optional(),
  teamIds: z.array(z.string().uuid()).max(50).optional()
});

const updateSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    details: z.string().max(5000).nullable().optional(),
    priority: PRIORITY.nullable().optional(),
    assigneeUserId: z.string().uuid().nullable().optional(),
    farmId: z.string().uuid().nullable().optional(),
    fieldId: z.string().uuid().nullable().optional(),
    zoneId: z.string().uuid().nullable().optional(),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

const completeSchema = z.object({ status: STATUS });

interface ScoutTaskRow {
  id: string;
  org_id: string;
  title: string;
  details: string | null;
  status: "open" | "in_progress" | "done";
  priority: "low" | "normal" | "high" | "immediate" | null;
  assignee_user_id: string | null;
  farm_id: string | null;
  field_id: string | null;
  zone_id: string | null;
  due_on: string | null;
  origin_type: "manual" | "analysis_finding";
  origin_capture_id: string | null;
  created_by_user_id: string | null;
  completed_by_user_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserLite {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

function toSummary(
  row: ScoutTaskRow,
  assignee: UserLite | null,
  teamIds: string[],
  captureCount: number
) {
  return {
    id: row.id,
    title: row.title,
    details: row.details,
    status: row.status,
    priority: row.priority,
    assignee,
    farmId: row.farm_id,
    fieldId: row.field_id,
    zoneId: row.zone_id,
    dueOn: row.due_on,
    originType: row.origin_type,
    originCaptureId: row.origin_capture_id,
    createdByUserId: row.created_by_user_id,
    completedByUserId: row.completed_by_user_id,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teamIds,
    captureCount
  };
}

// Server-local "today" as a YYYY-MM-DD date string. Timezone niceties (per-org
// TZ) are out of scope for v0 — grouping into Today/This week is done client-side
// on the raw due_on; this filter is a convenience narrow.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Batch-resolve display fields for a set of user ids.
async function loadUsers(
  supabase: ReturnType<typeof getDb>,
  ids: string[]
): Promise<Map<string, UserLite>> {
  const map = new Map<string, UserLite>();
  const unique = [...new Set(ids)];
  if (unique.length === 0) return map;
  const { data, error } = await supabase
    .from("users")
    .select("id, display_name, avatar_url")
    .in("id", unique);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  }>) {
    map.set(r.id, {
      userId: r.id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url
    });
  }
  return map;
}

// team_assignments grouped by scout task id (drives the team selector).
async function loadTeamIds(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  ids: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id, team_id")
    .eq("org_id", orgId)
    .eq("resource_type", "scout_task")
    .in("resource_id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ resource_id: string; team_id: string }>) {
    const list = map.get(r.resource_id) ?? [];
    list.push(r.team_id);
    map.set(r.resource_id, list);
  }
  return map;
}

// Count of captures collected against each task id. No group-by in the JS
// client, so fetch the (thin) rows and tally in memory.
async function loadCaptureCounts(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  ids: string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("captures")
    .select("scout_task_id")
    .eq("org_id", orgId)
    .in("scout_task_id", ids)
    .is("discarded_at", null);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ scout_task_id: string | null }>) {
    if (!r.scout_task_id) continue;
    map.set(r.scout_task_id, (map.get(r.scout_task_id) ?? 0) + 1);
  }
  return map;
}

// Validate that any referenced assignee / farm / field / zone belongs to the
// caller's org (assignee must be an ACTIVE member). Mirrors captures.ts's
// validateOrgScoped.
async function validateRefs(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  refs: {
    assigneeUserId?: string | null;
    farmId?: string | null;
    fieldId?: string | null;
    zoneId?: string | null;
  }
) {
  if (refs.assigneeUserId) {
    const { data, error } = await supabase
      .from("organization_memberships")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", refs.assigneeUserId)
      .eq("status", "active")
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw notFound(
        "scout_tasks.assignee_not_member",
        "The assignee is not an active member of this organization."
      );
    }
  }

  const checks: Array<{ table: string; id: string; label: string }> = [];
  if (refs.farmId) checks.push({ table: "farms", id: refs.farmId, label: "farm" });
  if (refs.fieldId) checks.push({ table: "fields", id: refs.fieldId, label: "field" });
  if (refs.zoneId) checks.push({ table: "zones", id: refs.zoneId, label: "zone" });
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select("id")
      .eq("id", check.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw notFound(
        "references.not_found",
        `Referenced ${check.label} does not exist in this organization.`
      );
    }
  }
}

async function publishChanged(
  log: FastifyBaseLogger,
  orgId: string,
  taskId: string,
  status: "open" | "in_progress" | "done",
  changeType: "created" | "updated" | "status_changed" | "deleted"
) {
  await publishBestEffort(log, channels.orgScoutTasks(orgId), {
    type: "scout.task.changed",
    version: 1,
    payload: { taskId, orgId, status, changeType }
  });
}

const scoutTasksRoutes: FastifyPluginAsync = async (app) => {
  // -----------------------------------------------------------------------
  // GET /v1/scout-tasks — team-scoped list, newest due first.
  // -----------------------------------------------------------------------
  app.get(
    "/v1/scout-tasks",
    { preHandler: app.requireAuth("scout_tasks.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("scout_tasks.invalid_query", "Invalid scout task query.", {
          issues: parsed.error.issues
        });
      }
      const { status, assignee, due, teamId, limit, offset } = parsed.data;
      const supabase = getDb();

      let query = supabase
        .from("scout_tasks")
        .select(SCOUT_TASK_SELECT)
        .eq("org_id", caller.orgId);

      if (status) {
        const statuses = status
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s === "open" || s === "in_progress" || s === "done");
        if (statuses.length > 0) query = query.in("status", statuses);
      }
      if (assignee) {
        query = query.eq(
          "assignee_user_id",
          assignee === "me" ? caller.userId : assignee
        );
      }
      if (due === "today") {
        query = query.eq("due_on", today());
      } else if (due === "week") {
        query = query.gte("due_on", today()).lte("due_on", addDays(today(), 6));
      } else if (due === "overdue") {
        query = query.lt("due_on", today()).neq("status", "done");
      }

      // Team access boundary (+ optional ?teamId= narrow). No-op for admins.
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      query = (
        await applyTeamFilter(query, supabase, caller.orgId, "scout_task", scope, {
          teamId
        })
      ).query;

      const { data, error } = await query
        // Nulls last so undated tasks sink below the dated ones.
        .order("due_on", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      const rows = (data ?? []) as ScoutTaskRow[];
      const ids = rows.map((r) => r.id);
      const permCtx = { userId: caller.userId, orgId: caller.orgId };

      const [users, teamsById, counts, canAssignTeams, canManage, canComplete] =
        await Promise.all([
          loadUsers(
            supabase,
            rows.map((r) => r.assignee_user_id).filter((v): v is string => !!v)
          ),
          loadTeamIds(supabase, caller.orgId, ids),
          loadCaptureCounts(supabase, caller.orgId, ids),
          request.permissions!.hasPermission(permCtx, "teams.assign"),
          request.permissions!.hasPermission(permCtx, "scout_tasks.create"),
          request.permissions!.hasPermission(permCtx, "scout_tasks.complete")
        ]);

      return {
        tasks: rows.map((row) =>
          toSummary(
            row,
            row.assignee_user_id ? (users.get(row.assignee_user_id) ?? null) : null,
            teamsById.get(row.id) ?? [],
            counts.get(row.id) ?? 0
          )
        ),
        limit,
        offset,
        canAssignTeams,
        canManage,
        canComplete
      };
    }
  );

  // -----------------------------------------------------------------------
  // GET /v1/scout-tasks/:id — detail + linked captures.
  // -----------------------------------------------------------------------
  app.get<{ Params: { id: string } }>(
    "/v1/scout-tasks/:id",
    { preHandler: app.requireAuth("scout_tasks.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("scout_tasks.invalid_id", "Invalid scout task id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const row = await loadTask(supabase, caller.orgId, id);

      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      const visible = await canSeeResource(
        supabase,
        caller.orgId,
        "scout_task",
        id,
        scope
      );
      if (!visible) throw notFound("scout_tasks.not_found", "Scout task not found.");

      const [users, teamsById, counts, canAssignTeams] = await Promise.all([
        loadUsers(supabase, row.assignee_user_id ? [row.assignee_user_id] : []),
        loadTeamIds(supabase, caller.orgId, [id]),
        loadCaptureCounts(supabase, caller.orgId, [id]),
        request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "teams.assign"
        )
      ]);

      const { data: captures, error: capErr } = await supabase
        .from("captures")
        .select("id, media_type, status, thumbnail_path, captured_at, captured_by_user_id")
        .eq("org_id", caller.orgId)
        .eq("scout_task_id", id)
        .is("discarded_at", null)
        .order("captured_at", { ascending: false })
        .limit(50);
      if (capErr) throw capErr;

      return {
        task: toSummary(
          row,
          row.assignee_user_id ? (users.get(row.assignee_user_id) ?? null) : null,
          teamsById.get(id) ?? [],
          counts.get(id) ?? 0
        ),
        captures: captures ?? [],
        canAssignTeams
      };
    }
  );

  // -----------------------------------------------------------------------
  // POST /v1/scout-tasks — create (managers+). Optionally file under team(s).
  // -----------------------------------------------------------------------
  app.post(
    "/v1/scout-tasks",
    { preHandler: app.requireAuth("scout_tasks.create") },
    async (request, reply) => {
      const caller = request.auth!;
      const parsed = createSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("scout_tasks.invalid_input", "Invalid scout task body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      await validateRefs(supabase, caller.orgId, body);

      // Filing under team(s) is a curation action → requires teams.assign.
      if (body.teamIds && body.teamIds.length > 0) {
        const canAssign = await request.permissions!.hasPermission(
          { userId: caller.userId, orgId: caller.orgId },
          "teams.assign"
        );
        if (!canAssign) {
          throw forbidden(
            "scout_tasks.cannot_assign_teams",
            "You do not have permission to assign tasks to teams."
          );
        }
        await assertTeamsInOrg(supabase, caller.orgId, body.teamIds);
      }

      const { data: created, error: insertErr } = await supabase
        .from("scout_tasks")
        .insert({
          org_id: caller.orgId,
          title: body.title,
          details: body.details ?? null,
          status: body.status ?? "open",
          priority: body.priority ?? null,
          assignee_user_id: body.assigneeUserId ?? null,
          farm_id: body.farmId ?? null,
          field_id: body.fieldId ?? null,
          zone_id: body.zoneId ?? null,
          due_on: body.dueOn ?? null,
          origin_type: "manual",
          created_by_user_id: caller.userId
        })
        .select(SCOUT_TASK_SELECT)
        .single();
      if (insertErr) throw insertErr;

      const row = created as ScoutTaskRow;

      if (body.teamIds && body.teamIds.length > 0) {
        const rows = body.teamIds.map((teamId) => ({
          team_id: teamId,
          org_id: caller.orgId,
          resource_type: "scout_task" as const,
          resource_id: row.id,
          assigned_by_user_id: caller.userId
        }));
        const { error: assignErr } = await supabase
          .from("team_assignments")
          .upsert(rows, {
            onConflict: "team_id,resource_type,resource_id",
            ignoreDuplicates: true
          });
        if (assignErr) throw assignErr;
      }

      await publishChanged(request.log, caller.orgId, row.id, row.status, "created");

      const users = await loadUsers(
        supabase,
        row.assignee_user_id ? [row.assignee_user_id] : []
      );

      reply.status(201);
      return {
        task: toSummary(
          row,
          row.assignee_user_id ? (users.get(row.assignee_user_id) ?? null) : null,
          body.teamIds ?? [],
          0
        )
      };
    }
  );

  // -----------------------------------------------------------------------
  // PATCH /v1/scout-tasks/:id — edit body/assignee/field/due/priority (managers+).
  // -----------------------------------------------------------------------
  app.patch<{ Params: { id: string } }>(
    "/v1/scout-tasks/:id",
    { preHandler: app.requireAuth("scout_tasks.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("scout_tasks.invalid_id", "Invalid scout task id.");
      }
      const caller = request.auth!;
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("scout_tasks.invalid_input", "Invalid scout task patch.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      await loadTask(supabase, caller.orgId, id); // 404 across tenants
      await validateRefs(supabase, caller.orgId, body);

      const patch: Record<string, unknown> = {};
      if (body.title !== undefined) patch.title = body.title;
      if (body.details !== undefined) patch.details = body.details;
      if (body.priority !== undefined) patch.priority = body.priority;
      if (body.assigneeUserId !== undefined) patch.assignee_user_id = body.assigneeUserId;
      if (body.farmId !== undefined) patch.farm_id = body.farmId;
      if (body.fieldId !== undefined) patch.field_id = body.fieldId;
      if (body.zoneId !== undefined) patch.zone_id = body.zoneId;
      if (body.dueOn !== undefined) patch.due_on = body.dueOn;

      const { data: updated, error: updErr } = await supabase
        .from("scout_tasks")
        .update(patch)
        .eq("id", id)
        .eq("org_id", caller.orgId)
        .select(SCOUT_TASK_SELECT)
        .single();
      if (updErr) throw updErr;
      const row = updated as ScoutTaskRow;

      await publishChanged(request.log, caller.orgId, row.id, row.status, "updated");

      const [users, teamsById, counts] = await Promise.all([
        loadUsers(supabase, row.assignee_user_id ? [row.assignee_user_id] : []),
        loadTeamIds(supabase, caller.orgId, [id]),
        loadCaptureCounts(supabase, caller.orgId, [id])
      ]);

      return {
        task: toSummary(
          row,
          row.assignee_user_id ? (users.get(row.assignee_user_id) ?? null) : null,
          teamsById.get(id) ?? [],
          counts.get(id) ?? 0
        )
      };
    }
  );

  // -----------------------------------------------------------------------
  // POST /v1/scout-tasks/:id/complete — change status. A technician (complete
  // but not update) may only change the status of a task assigned to them.
  // -----------------------------------------------------------------------
  app.post<{ Params: { id: string } }>(
    "/v1/scout-tasks/:id/complete",
    { preHandler: app.requireAuth("scout_tasks.complete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("scout_tasks.invalid_id", "Invalid scout task id.");
      }
      const caller = request.auth!;
      const parsed = completeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("scout_tasks.invalid_input", "Invalid status body.", {
          issues: parsed.error.issues
        });
      }
      const supabase = getDb();
      const row = await loadTask(supabase, caller.orgId, id);

      // Visibility gate (a technician shouldn't act on a task they can't see).
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      const visible = await canSeeResource(supabase, caller.orgId, "scout_task", id, scope);
      if (!visible) throw notFound("scout_tasks.not_found", "Scout task not found.");

      // Without broad edit rights, you can only complete your OWN task.
      const canEdit = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "scout_tasks.update"
      );
      if (!canEdit && row.assignee_user_id !== caller.userId) {
        throw forbidden(
          "scout_tasks.not_assignee",
          "You can only change the status of a task assigned to you."
        );
      }

      const nextStatus = parsed.data.status;
      const done = nextStatus === "done";
      const { data: updated, error: updErr } = await supabase
        .from("scout_tasks")
        .update({
          status: nextStatus,
          completed_at: done ? new Date().toISOString() : null,
          completed_by_user_id: done ? caller.userId : null
        })
        .eq("id", id)
        .eq("org_id", caller.orgId)
        .select(SCOUT_TASK_SELECT)
        .single();
      if (updErr) throw updErr;
      const next = updated as ScoutTaskRow;

      await publishChanged(request.log, caller.orgId, next.id, next.status, "status_changed");

      const [users, teamsById, counts] = await Promise.all([
        loadUsers(supabase, next.assignee_user_id ? [next.assignee_user_id] : []),
        loadTeamIds(supabase, caller.orgId, [id]),
        loadCaptureCounts(supabase, caller.orgId, [id])
      ]);

      return {
        task: toSummary(
          next,
          next.assignee_user_id ? (users.get(next.assignee_user_id) ?? null) : null,
          teamsById.get(id) ?? [],
          counts.get(id) ?? 0
        )
      };
    }
  );

  // -----------------------------------------------------------------------
  // DELETE /v1/scout-tasks/:id — delete + clean up polymorphic assignments.
  // -----------------------------------------------------------------------
  app.delete<{ Params: { id: string } }>(
    "/v1/scout-tasks/:id",
    { preHandler: app.requireAuth("scout_tasks.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("scout_tasks.invalid_id", "Invalid scout task id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      await loadTask(supabase, caller.orgId, id); // 404 across tenants

      // team_assignments has no FK to scout_tasks (polymorphic) — clean up here.
      const { error: assignErr } = await supabase
        .from("team_assignments")
        .delete()
        .eq("org_id", caller.orgId)
        .eq("resource_type", "scout_task")
        .eq("resource_id", id);
      if (assignErr) throw assignErr;

      const { error: delErr } = await supabase
        .from("scout_tasks")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      await publishChanged(request.log, caller.orgId, id, "done", "deleted");

      return { scoutTaskId: id, deleted: true };
    }
  );
};

// Load a task scoped to the caller's org, or 404 across tenants.
async function loadTask(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  id: string
): Promise<ScoutTaskRow> {
  const { data, error } = await supabase
    .from("scout_tasks")
    .select(SCOUT_TASK_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || (data as ScoutTaskRow).org_id !== orgId) {
    throw notFound("scout_tasks.not_found", "Scout task not found.");
  }
  return data as ScoutTaskRow;
}

// Verify every team id belongs to the caller's org before filing under them.
async function assertTeamsInOrg(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  teamIds: string[]
) {
  const { data, error } = await supabase
    .from("teams")
    .select("id")
    .eq("org_id", orgId)
    .in("id", teamIds);
  if (error) throw error;
  const found = new Set(((data ?? []) as Array<{ id: string }>).map((r) => r.id));
  for (const t of teamIds) {
    if (!found.has(t)) {
      throw notFound("teams.not_found", "One or more teams do not exist in this organization.");
    }
  }
}

export default scoutTasksRoutes;
