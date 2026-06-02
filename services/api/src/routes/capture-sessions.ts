import { getDb } from "../lib/db.js";
import { channels } from "@gaia/realtime/channels";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { createLiveSession, ensureOrgScoped, publishBestEffort } from "../lib/live.js";

const startSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  cropTypeId: z.string().uuid().nullable().optional(),
  initialLocation: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracyMeters: z.number().optional()
    })
    .nullable()
    .optional(),
  plannedDurationMinutes: z.number().positive().optional()
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pause"),
    reason: z.enum(["operator", "low_battery", "connectivity_lost", "other"]).optional()
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("end"),
    reason: z.enum(["operator", "battery_critical", "error"]).default("operator")
  }),
  // Authoritative disconnect/reconnect: any watcher (not just the operator) can
  // pull a live camera off-air and put it back. Signals the publishing device.
  z.object({ action: z.literal("disconnect") }),
  z.object({ action: z.literal("reconnect") })
]);

// Actions any technician+/manager watcher may run on someone else's session.
// The lifecycle actions (pause/resume/end) stay operator-only.
const WATCHER_ACTIONS = new Set(["disconnect", "reconnect"]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

// A session is "live" on the wall while it's starting, running, or paused —
// anything but ended/error. The Live page seeds from this list, then keeps it
// fresh via the org-wide active-sessions channel.
const ACTIVE_STATUSES = ["starting", "live", "paused"] as const;

interface LiveSessionRow {
  id: string;
  status: string;
  started_at: string;
  live_disconnected_at: string | null;
  operator: { clerk_user_id: string; display_name: string | null; email: string } | null;
  field: { name: string } | null;
  farm: { name: string } | null;
}

const captureSessionsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/capture-sessions/live — org-scoped roster of in-flight sessions for
  // the portal Live page. Each row is one camera (an operator's field session).
  app.get(
    "/v1/capture-sessions/live",
    { preHandler: app.requireAuth("capture_sessions.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("capture_sessions")
        .select(
          "id, status, started_at, live_disconnected_at, operator:users!started_by_user_id(clerk_user_id, display_name, email), field:fields(name), farm:farms(name)"
        )
        .eq("org_id", caller.orgId)
        .in("status", ACTIVE_STATUSES as unknown as string[])
        .order("started_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as unknown as LiveSessionRow[];

      return {
        orgId: caller.orgId,
        sessions: rows.map((row) => ({
          sessionId: row.id,
          status: row.status,
          operatorUserId: row.operator?.clerk_user_id ?? null,
          operatorName: row.operator?.display_name ?? row.operator?.email ?? "Operator",
          fieldName: row.field?.name ?? null,
          farmName: row.farm?.name ?? null,
          startedAt: row.started_at,
          disconnectedAt: row.live_disconnected_at ?? null
        }))
      };
    }
  );

  app.post(
    "/v1/capture-sessions",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, reply) => {
      const caller = request.auth!;
      const parsed = startSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("capture_sessions.invalid_input", "Invalid session start body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;

      if (body.farmId) await ensureOrgScoped("farms", body.farmId, caller.orgId);
      if (body.fieldId) await ensureOrgScoped("fields", body.fieldId, caller.orgId);
      if (body.cropTypeId)
        await ensureOrgScoped("crop_types", body.cropTypeId, caller.orgId);

      const { sessionId, startedAt } = await createLiveSession(request.log, {
        orgId: caller.orgId,
        operatorUserId: caller.userId,
        operatorClerkUserId: caller.clerkUserId,
        farmId: body.farmId,
        fieldId: body.fieldId,
        cropTypeId: body.cropTypeId,
        initialLocation: body.initialLocation,
        plannedDurationMinutes: body.plannedDurationMinutes
      });

      reply.status(201);
      return {
        sessionId,
        orgId: caller.orgId,
        startedAt
      };
    }
  );

  app.patch<{ Params: { id: string } }>(
    "/v1/capture-sessions/:id",
    { preHandler: app.requireAuth("capture_sessions.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("capture_sessions.invalid_id", "Invalid session id.");
      }
      const caller = request.auth!;
      const parsed = patchSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest(
          "capture_sessions.invalid_input",
          "Invalid session patch body.",
          { issues: parsed.error.issues }
        );
      }
      const body = parsed.data;
      const supabase = getDb();

      const { data: session, error: loadErr } = await supabase
        .from("capture_sessions")
        .select("id, org_id, status, started_by_user_id, started_by_device_id, live_disconnected_at")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!session) throw notFound("capture_sessions.not_found", "Session not found.");

      const row = session as {
        id: string;
        org_id: string;
        status: string;
        started_by_user_id: string;
        started_by_device_id: string | null;
        live_disconnected_at: string | null;
      };

      if (row.org_id !== caller.orgId) {
        throw notFound("capture_sessions.not_found", "Session not found.");
      }
      // Lifecycle actions (pause/resume/end) are operator-only; disconnect/
      // reconnect are watcher actions any authorized viewer may run.
      if (!WATCHER_ACTIONS.has(body.action) && row.started_by_user_id !== caller.userId) {
        throw forbidden(
          "capture_sessions.not_operator",
          "Session belongs to another operator."
        );
      }

      const now = new Date().toISOString();

      if (body.action === "disconnect") {
        if (!ACTIVE_STATUSES.includes(row.status as (typeof ACTIVE_STATUSES)[number])) {
          throw conflict(
            "capture_sessions.invalid_transition",
            `Cannot disconnect a session in status '${row.status}'.`
          );
        }
        const { error } = await supabase
          .from("capture_sessions")
          .update({ live_disconnected_at: now })
          .eq("id", id);
        if (error) throw error;
        // Tell every watcher's tile to show the disconnected state…
        await publishBestEffort(request.log, channels.captureSessionState(caller.orgId, id), {
          type: "capture.session.disconnected",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { sessionId: id, disconnectedAt: now }
        });
        // …and direct the publishing phone to stop sending media.
        if (row.started_by_device_id) {
          await publishBestEffort(
            request.log,
            channels.deviceCommands(caller.orgId, row.started_by_device_id),
            {
              type: "device.command.disconnect",
              version: 1,
              emittedBy: caller.clerkUserId,
              payload: { deviceId: row.started_by_device_id, sessionId: id, disconnectedAt: now }
            }
          );
        }
      } else if (body.action === "reconnect") {
        const { error } = await supabase
          .from("capture_sessions")
          .update({ live_disconnected_at: null })
          .eq("id", id);
        if (error) throw error;
        await publishBestEffort(request.log, channels.captureSessionState(caller.orgId, id), {
          type: "capture.session.reconnected",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { sessionId: id, reconnectedAt: now }
        });
        if (row.started_by_device_id) {
          await publishBestEffort(
            request.log,
            channels.deviceCommands(caller.orgId, row.started_by_device_id),
            {
              type: "device.command.reconnect",
              version: 1,
              emittedBy: caller.clerkUserId,
              payload: { deviceId: row.started_by_device_id, sessionId: id, reconnectedAt: now }
            }
          );
        }
      } else if (body.action === "pause") {
        if (row.status !== "live") {
          throw conflict(
            "capture_sessions.invalid_transition",
            `Cannot pause a session in status '${row.status}'.`
          );
        }
        const { error } = await supabase
          .from("capture_sessions")
          .update({ status: "paused" })
          .eq("id", id);
        if (error) throw error;
        await publishBestEffort(request.log, channels.captureSessionState(caller.orgId, id), {
          type: "capture.session.paused",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { sessionId: id, pausedAt: now, reason: body.reason }
        });
      } else if (body.action === "resume") {
        if (row.status !== "paused") {
          throw conflict(
            "capture_sessions.invalid_transition",
            `Cannot resume a session in status '${row.status}'.`
          );
        }
        const { error } = await supabase
          .from("capture_sessions")
          .update({ status: "live" })
          .eq("id", id);
        if (error) throw error;
        await publishBestEffort(request.log, channels.captureSessionState(caller.orgId, id), {
          type: "capture.session.resumed",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { sessionId: id, resumedAt: now }
        });
      } else if (body.action === "end") {
        if (row.status === "ended") {
          throw conflict(
            "capture_sessions.already_ended",
            "Session is already ended."
          );
        }
        const { count, error: countErr } = await supabase
          .from("captures")
          .select("id", { count: "exact", head: true })
          .eq("session_id", id);
        if (countErr) throw countErr;
        const { error } = await supabase
          .from("capture_sessions")
          .update({ status: "ended", ended_at: now })
          .eq("id", id);
        if (error) throw error;
        const endedEvent = {
          type: "capture.session.ended" as const,
          version: 1 as const,
          emittedBy: caller.clerkUserId,
          payload: {
            sessionId: id,
            endedAt: now,
            totalCaptures: count ?? 0,
            reason: body.reason
          }
        };
        // State channel + org-wide active index (the Live page drops the tile).
        await publishBestEffort(request.log, channels.captureSessionState(caller.orgId, id), endedEvent);
        await publishBestEffort(request.log, channels.orgActiveSessions(caller.orgId), endedEvent);
      }

      return { sessionId: id, action: body.action };
    }
  );
};

export default captureSessionsRoutes;
