import { getDb } from "../lib/db.js";
import { channels } from "@gaia/realtime/channels";
import { publish } from "@gaia/realtime/server";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

// Realtime broadcasts are observational, not the source of truth — the DB row
// is. A broker timeout/error must never fail a request whose write already
// committed, so every publish from this route goes through here.
async function publishBestEffort(
  request: FastifyRequest,
  channelName: string,
  event: Parameters<typeof publish>[1]
): Promise<void> {
  try {
    await publish(channelName, event);
  } catch (err) {
    request.log.warn(
      { err, channel: channelName, type: event.type },
      "realtime publish failed (non-fatal)"
    );
  }
}

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
  })
]);

const UUID_RE = /^[0-9a-f-]{36}$/i;

// A session is "live" on the wall while it's starting, running, or paused —
// anything but ended/error. The Live page seeds from this list, then keeps it
// fresh via the org-wide active-sessions channel.
const ACTIVE_STATUSES = ["starting", "live", "paused"] as const;

interface LiveSessionRow {
  id: string;
  status: string;
  started_at: string;
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
          "id, status, started_at, operator:users!started_by_user_id(clerk_user_id, display_name, email), field:fields(name), farm:farms(name)"
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
          startedAt: row.started_at
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
      const supabase = getDb();

      if (body.farmId) await ensureOrgScoped("farms", body.farmId, caller.orgId);
      if (body.fieldId) await ensureOrgScoped("fields", body.fieldId, caller.orgId);
      if (body.cropTypeId)
        await ensureOrgScoped("crop_types", body.cropTypeId, caller.orgId);

      const startedAt = new Date().toISOString();

      const { data: session, error } = await supabase
        .from("capture_sessions")
        .insert({
          org_id: caller.orgId,
          started_by_user_id: caller.userId,
          farm_id: body.farmId ?? null,
          field_id: body.fieldId ?? null,
          crop_type_id: body.cropTypeId ?? null,
          status: "live",
          started_at: startedAt,
          last_known_location: body.initialLocation
            ? `SRID=4326;POINT(${body.initialLocation.lng} ${body.initialLocation.lat})`
            : null,
          last_heartbeat_at: startedAt,
          metadata: body.plannedDurationMinutes
            ? { plannedDurationMinutes: body.plannedDurationMinutes }
            : {}
        })
        .select("id")
        .single();
      if (error) throw error;

      const sessionId = (session as { id: string }).id;

      const startedEvent = {
        type: "capture.session.started" as const,
        version: 1 as const,
        emittedBy: caller.clerkUserId,
        payload: {
          sessionId,
          orgId: caller.orgId,
          operatorUserId: caller.clerkUserId,
          farmId: body.farmId ?? undefined,
          fieldId: body.fieldId ?? undefined,
          cropTypeId: body.cropTypeId ?? undefined,
          startedAt,
          initialLocation: body.initialLocation ?? undefined,
          plannedDurationMinutes: body.plannedDurationMinutes
        }
      };

      // Per-session state channel (detail watchers) + org-wide active index
      // (the Live page's camera roster sees the new session appear).
      // Best-effort: the session row is already committed, so a realtime broker
      // hiccup must not fail the request (the client would retry and create a
      // duplicate session). Log and move on.
      await publishBestEffort(
        request,
        channels.captureSessionState(caller.orgId, sessionId),
        startedEvent
      );
      await publishBestEffort(
        request,
        channels.orgActiveSessions(caller.orgId),
        startedEvent
      );

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
        .select("id, org_id, status, started_by_user_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!session) throw notFound("capture_sessions.not_found", "Session not found.");

      const row = session as {
        id: string;
        org_id: string;
        status: string;
        started_by_user_id: string;
      };

      if (row.org_id !== caller.orgId) {
        throw notFound("capture_sessions.not_found", "Session not found.");
      }
      if (row.started_by_user_id !== caller.userId) {
        throw forbidden(
          "capture_sessions.not_operator",
          "Session belongs to another operator."
        );
      }

      const now = new Date().toISOString();

      if (body.action === "pause") {
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
        await publishBestEffort(request, channels.captureSessionState(caller.orgId, id), {
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
        await publishBestEffort(request, channels.captureSessionState(caller.orgId, id), {
          type: "capture.session.resumed",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { sessionId: id, resumedAt: now }
        });
      } else {
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
        await publishBestEffort(request, channels.captureSessionState(caller.orgId, id), endedEvent);
        await publishBestEffort(request, channels.orgActiveSessions(caller.orgId), endedEvent);
      }

      return { sessionId: id, action: body.action };
    }
  );
};

async function ensureOrgScoped(table: string, id: string, orgId: string) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    throw notFound("references.not_found", `Referenced ${table} not found in org.`);
  }
}

export default captureSessionsRoutes;
