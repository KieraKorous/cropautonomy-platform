// POST /api/capture-sessions
//
// Start an operator capture session. Publishes capture.session.started on the
// session's state channel via the server publisher.

import { z } from "zod";
import { channels } from "@gaia/realtime/channels";
import { publish } from "@gaia/realtime/server";
import {
  HttpError,
  requireTechnician,
  toErrorResponse
} from "../../../lib/auth.js";
import { corsHeaders, handlePreflight } from "../../../lib/cors.js";
import { getServiceSupabase } from "../../../lib/supabase.js";

export const runtime = "nodejs";

const bodySchema = z.object({
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

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function POST(request: Request) {
  try {
    const caller = await requireTechnician();
    const body = bodySchema.parse(await request.json());
    const supabase = getServiceSupabase();

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

    await publish(channels.captureSessionState(caller.orgId, session.id as string), {
      type: "capture.session.started",
      version: 1,
      emittedBy: caller.clerkUserId,
      payload: {
        sessionId: session.id as string,
        orgId: caller.orgId,
        operatorUserId: caller.clerkUserId,
        farmId: body.farmId ?? undefined,
        fieldId: body.fieldId ?? undefined,
        cropTypeId: body.cropTypeId ?? undefined,
        startedAt,
        initialLocation: body.initialLocation ?? undefined,
        plannedDurationMinutes: body.plannedDurationMinutes
      }
    });

    return withCorsHeaders(
      Response.json({
        sessionId: session.id,
        orgId: caller.orgId,
        startedAt
      }),
      request
    );
  } catch (error) {
    return withCorsHeaders(toErrorResponse(error), request);
  }
}

async function ensureOrgScoped(table: string, id: string, orgId: string) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from(table)
    .select("id")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(404, `Referenced ${table} not found in org.`);
}

function withCorsHeaders(response: Response, request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}
