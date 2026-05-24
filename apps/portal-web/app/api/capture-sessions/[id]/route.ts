// PATCH /api/capture-sessions/{id}
//
// Transitions session state (pause / resume / end) and publishes the
// corresponding lifecycle event.

import { z } from "zod";
import { channels } from "@gaia/realtime/channels";
import { publish } from "@gaia/realtime/server";
import {
  HttpError,
  requireTechnician,
  toErrorResponse
} from "../../../../lib/auth.js";
import { corsHeaders, handlePreflight } from "../../../../lib/cors.js";
import { getServiceSupabase } from "../../../../lib/supabase.js";

export const runtime = "nodejs";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("pause"),
    reason: z
      .enum(["operator", "low_battery", "connectivity_lost", "other"])
      .optional()
  }),
  z.object({ action: z.literal("resume") }),
  z.object({
    action: z.literal("end"),
    reason: z.enum(["operator", "battery_critical", "error"]).default("operator")
  })
]);

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(400, "Invalid session id.");

    const caller = await requireTechnician();
    const body = bodySchema.parse(await request.json());
    const supabase = getServiceSupabase();

    const { data: session, error: loadErr } = await supabase
      .from("capture_sessions")
      .select("id, org_id, status, started_by_user_id")
      .eq("id", id)
      .maybeSingle();
    if (loadErr) throw loadErr;
    if (!session) throw new HttpError(404, "Session not found.");
    if (session.org_id !== caller.orgId)
      throw new HttpError(403, "Session is in another org.");
    if (session.started_by_user_id !== caller.userId)
      throw new HttpError(403, "Session belongs to another operator.");

    const now = new Date().toISOString();

    if (body.action === "pause") {
      if (session.status !== "live")
        throw new HttpError(409, `Cannot pause a session in '${session.status}'.`);
      const { error } = await supabase
        .from("capture_sessions")
        .update({ status: "paused" })
        .eq("id", id);
      if (error) throw error;
      await publish(channels.captureSessionState(caller.orgId, id), {
        type: "capture.session.paused",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: { sessionId: id, pausedAt: now, reason: body.reason }
      });
    } else if (body.action === "resume") {
      if (session.status !== "paused")
        throw new HttpError(409, `Cannot resume a session in '${session.status}'.`);
      const { error } = await supabase
        .from("capture_sessions")
        .update({ status: "live" })
        .eq("id", id);
      if (error) throw error;
      await publish(channels.captureSessionState(caller.orgId, id), {
        type: "capture.session.resumed",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: { sessionId: id, resumedAt: now }
      });
    } else {
      if (session.status === "ended")
        throw new HttpError(409, "Session is already ended.");
      const { data: countRow, error: countErr } = await supabase
        .from("captures")
        .select("id", { count: "exact", head: true })
        .eq("session_id", id);
      if (countErr) throw countErr;
      const totalCaptures = countRow as unknown as { count: number } | null;
      const { error } = await supabase
        .from("capture_sessions")
        .update({ status: "ended", ended_at: now })
        .eq("id", id);
      if (error) throw error;
      await publish(channels.captureSessionState(caller.orgId, id), {
        type: "capture.session.ended",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: {
          sessionId: id,
          endedAt: now,
          totalCaptures: totalCaptures?.count ?? 0,
          reason: body.reason
        }
      });
    }

    return withCorsHeaders(
      Response.json({ sessionId: id, action: body.action }),
      request
    );
  } catch (error) {
    return withCorsHeaders(toErrorResponse(error), request);
  }
}

function withCorsHeaders(response: Response, request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}
