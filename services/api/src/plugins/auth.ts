import type { ClerkClient } from "@clerk/backend";
import {
  PermissionDeniedError,
  PermissionResolver,
  type PermissionKey
} from "@gaia/db/permissions";
import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";
import { getClerk } from "../lib/clerk.js";
import { getDb } from "../lib/db.js";
import { forbidden, unauthorized } from "../lib/errors.js";

export interface AuthContext {
  clerkUserId: string;
  /** Internal public.users.id uuid. */
  userId: string;
  /** Active organization uuid. */
  orgId: string;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    permissions?: PermissionResolver;
  }
  interface FastifyInstance {
    requireAuth: (permission?: PermissionKey) => preHandlerHookHandler;
  }
}

export interface AuthPluginOptions {
  config: Config;
}

const authPlugin: FastifyPluginAsync<AuthPluginOptions> = async (app, _opts) => {
  const clerk: ClerkClient = getClerk();

  app.decorate("requireAuth", (permission?: PermissionKey): preHandlerHookHandler => {
    return async (request, _reply) => {
      const auth = await resolveAuth(request, clerk);
      const supabase = getDb();
      const resolver = new PermissionResolver(supabase);
      request.auth = auth;
      request.permissions = resolver;

      if (permission) {
        try {
          await resolver.requirePermission(
            { userId: auth.userId, orgId: auth.orgId },
            permission
          );
        } catch (err) {
          if (err instanceof PermissionDeniedError) {
            throw forbidden("auth.permission_denied", `Missing permission: ${err.permission}`);
          }
          throw err;
        }
      }
    };
  });
};

async function resolveAuth(
  request: FastifyRequest,
  clerk: ClerkClient
): Promise<AuthContext> {
  const requestState = await clerk.authenticateRequest(toWebRequest(request));

  if (!requestState.isSignedIn) {
    throw unauthorized("auth.unauthenticated", "Sign-in required.");
  }
  const clerkAuth = requestState.toAuth();
  const clerkUserId = clerkAuth.userId;

  const supabase = getDb();
  const { data: userRow, error } = await supabase
    .from("users")
    .select("id, active_organization_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (error) throw error;
  if (!userRow) {
    throw forbidden(
      "auth.no_platform_user",
      "No platform user exists for this Clerk identity. The Clerk webhook may not have fired yet."
    );
  }
  const orgId = (userRow as { active_organization_id: string | null }).active_organization_id;
  if (!orgId) {
    throw forbidden("auth.no_active_org", "No active organization selected for this user.");
  }

  const { data: membership, error: membershipErr } = await supabase
    .from("organization_memberships")
    .select("status")
    .eq("user_id", (userRow as { id: string }).id)
    .eq("org_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipErr) throw membershipErr;
  if (!membership) {
    throw forbidden(
      "auth.no_active_membership",
      "No active membership in the selected organization."
    );
  }

  return {
    clerkUserId,
    userId: (userRow as { id: string }).id,
    orgId
  };
}

function toWebRequest(request: FastifyRequest): Request {
  const url = `${request.protocol}://${request.host}${request.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    }
  }
  return new Request(url, {
    method: request.method,
    headers
  });
}

export default fp(authPlugin, { name: "auth" });
