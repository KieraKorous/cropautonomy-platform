// POST /api/realtime/publish
//
// Proxy publish for browser clients (field PWA). The body carries a logical
// channel name and an event envelope. The endpoint:
//   1. authenticates the caller
//   2. validates the envelope against the registered zod schema
//   3. enforces that the channel name's org segment matches the caller's org
//   4. re-broadcasts via the service-role server publisher
//
// This exists as a v0 alternative to direct browser publishes until the
// Clerk -> Supabase JWT bridge is in place. See
// docs/architecture/authentication-and-tenancy.md and
// packages/realtime/src/transports/proxy.ts.

import { z } from "zod";
import { publish } from "@gaia/realtime/server";
import {
  HttpError,
  requireTechnician,
  toErrorResponse
} from "../../../../lib/auth.js";
import { corsHeaders, handlePreflight } from "../../../../lib/cors.js";

export const runtime = "nodejs";

const bodySchema = z.object({
  channel: z.string().min(1),
  event: z.object({
    type: z.string(),
    version: z.number().int().positive(),
    payload: z.unknown(),
    emittedAt: z.string().datetime({ offset: true }).optional(),
    emittedBy: z.string().optional()
  })
});

export async function OPTIONS(request: Request) {
  return handlePreflight(request);
}

export async function POST(request: Request) {
  try {
    const caller = await requireTechnician();
    const { channel, event } = bodySchema.parse(await request.json());

    enforceOrgScopedChannel(channel, caller.orgId);

    // Hand to the server publisher. It re-validates the envelope against the
    // registered schema (throws on invalid) and stamps emittedAt.
    await publish(channel, {
      type: event.type,
      version: event.version,
      payload: event.payload,
      emittedBy: caller.clerkUserId
    } as Parameters<typeof publish>[1]);

    return withCorsHeaders(Response.json({ ok: true }), request);
  } catch (error) {
    return withCorsHeaders(toErrorResponse(error), request);
  }
}

function enforceOrgScopedChannel(channel: string, callerOrgId: string) {
  // Channel names follow `org.{orgId}.…` — see packages/realtime/src/channels.ts.
  const match = /^org\.([^.]+)\./.exec(channel);
  if (!match)
    throw new HttpError(
      400,
      "Channel name must follow the `org.{orgId}.…` convention."
    );
  if (match[1] !== callerOrgId)
    throw new HttpError(403, "Cannot publish to another organization's channel.");
}

function withCorsHeaders(response: Response, request: Request) {
  const headers = corsHeaders(request.headers.get("origin"));
  for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
  return response;
}
