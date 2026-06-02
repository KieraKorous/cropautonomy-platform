import { channels } from "@gaia/realtime/channels";
import { publish } from "@gaia/realtime/server";
import type { FastifyBaseLogger } from "fastify";
import { getDb } from "./db.js";
import { notFound } from "./errors.js";

// Realtime broadcasts are observational, not the source of truth — the DB row
// is. A broker timeout/error must never fail a request whose write already
// committed, so every publish from a route goes through here.
export async function publishBestEffort(
  log: FastifyBaseLogger,
  channelName: string,
  event: Parameters<typeof publish>[1]
): Promise<void> {
  try {
    await publish(channelName, event);
  } catch (err) {
    log.warn(
      { err, channel: channelName, type: event.type },
      "realtime publish failed (non-fatal)"
    );
  }
}

// Validates that a referenced row exists and belongs to the caller's org.
export async function ensureOrgScoped(table: string, id: string, orgId: string) {
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

export interface CreateLiveSessionInput {
  orgId: string;
  /** Internal public.users.id of the operator the session is attributed to. */
  operatorUserId: string;
  /** Clerk user id of that operator — used for the realtime event + emittedBy. */
  operatorClerkUserId: string;
  startedByDeviceId?: string | null;
  farmId?: string | null;
  fieldId?: string | null;
  cropTypeId?: string | null;
  initialLocation?: { lat: number; lng: number; accuracyMeters?: number } | null;
  plannedDurationMinutes?: number;
}

export interface CreateLiveSessionResult {
  sessionId: string;
  startedAt: string;
}

// Inserts a 'live' capture_session and announces it on BOTH the per-session
// state channel (detail watchers) and the org-wide active index (the Live
// page's camera roster). Shared by the operator-started path
// (POST /v1/capture-sessions) and the request/accept path (live-requests).
export async function createLiveSession(
  log: FastifyBaseLogger,
  input: CreateLiveSessionInput
): Promise<CreateLiveSessionResult> {
  const supabase = getDb();
  const startedAt = new Date().toISOString();

  const { data: session, error } = await supabase
    .from("capture_sessions")
    .insert({
      org_id: input.orgId,
      started_by_user_id: input.operatorUserId,
      started_by_device_id: input.startedByDeviceId ?? null,
      farm_id: input.farmId ?? null,
      field_id: input.fieldId ?? null,
      crop_type_id: input.cropTypeId ?? null,
      status: "live",
      started_at: startedAt,
      last_known_location: input.initialLocation
        ? `SRID=4326;POINT(${input.initialLocation.lng} ${input.initialLocation.lat})`
        : null,
      last_heartbeat_at: startedAt,
      metadata: input.plannedDurationMinutes
        ? { plannedDurationMinutes: input.plannedDurationMinutes }
        : {}
    })
    .select("id")
    .single();
  if (error) throw error;

  const sessionId = (session as { id: string }).id;

  const startedEvent = {
    type: "capture.session.started" as const,
    version: 1 as const,
    emittedBy: input.operatorClerkUserId,
    payload: {
      sessionId,
      orgId: input.orgId,
      operatorUserId: input.operatorClerkUserId,
      farmId: input.farmId ?? undefined,
      fieldId: input.fieldId ?? undefined,
      cropTypeId: input.cropTypeId ?? undefined,
      startedAt,
      initialLocation: input.initialLocation ?? undefined,
      plannedDurationMinutes: input.plannedDurationMinutes
    }
  };

  await publishBestEffort(
    log,
    channels.captureSessionState(input.orgId, sessionId),
    startedEvent
  );
  // Only device-backed sessions (those that went live through the request/accept
  // gate) belong on the Live wall. Capture-only sessions skip the org-wide active
  // index so they never appear as a camera tile.
  if (input.startedByDeviceId) {
    await publishBestEffort(log, channels.orgActiveSessions(input.orgId), startedEvent);
  }

  return { sessionId, startedAt };
}
