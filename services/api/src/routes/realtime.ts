// POST /v1/realtime/publish
//
// v0 proxy endpoint: field-web POSTs a channel + event envelope here so the
// service-role server publisher can broadcast on its behalf. Goes away when
// the Clerk -> Supabase JWT bridge lands and the browser can publish directly.

import { publish } from "@gaia/realtime/server";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { badRequest, forbidden } from "../lib/errors.js";

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

const realtimeRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    "/v1/realtime/publish",
    { preHandler: app.requireAuth() },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("realtime.invalid_input", "Invalid publish body.", {
          issues: parsed.error.issues
        });
      }
      const { channel, event } = parsed.data;

      enforceOrgScopedChannel(channel, caller.orgId);

      await publish(channel, {
        type: event.type,
        version: event.version,
        payload: event.payload,
        emittedBy: caller.clerkUserId
      } as Parameters<typeof publish>[1]);

      return { ok: true };
    }
  );
};

function enforceOrgScopedChannel(channel: string, callerOrgId: string) {
  const match = /^org\.([^.]+)\./.exec(channel);
  if (!match) {
    throw badRequest(
      "realtime.invalid_channel",
      "Channel name must follow the `org.{orgId}.…` convention."
    );
  }
  if (match[1] !== callerOrgId) {
    throw forbidden(
      "realtime.cross_org_publish",
      "Cannot publish to another organization's channel."
    );
  }
}

export default realtimeRoutes;
