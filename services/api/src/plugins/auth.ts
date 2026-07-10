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

// A signed-in user resolved WITHOUT requiring an active organization. Used by the
// org-onboarding endpoints (list my orgs / switch / create) which a user with no
// active org must still be able to call — requireAuth would 403 them first.
export interface UserContext {
  clerkUserId: string;
  /** Internal public.users.id uuid. */
  userId: string;
  /** Active organization uuid, or null if none is selected yet. */
  activeOrgId: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    userAuth?: UserContext;
    permissions?: PermissionResolver;
  }
  interface FastifyInstance {
    requireAuth: (permission?: PermissionKey) => preHandlerHookHandler;
    requireUser: () => preHandlerHookHandler;
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

  app.decorate("requireUser", (): preHandlerHookHandler => {
    return async (request, _reply) => {
      request.userAuth = await resolveUser(request, clerk);
    };
  });
};

// Authenticate the Clerk session and resolve the platform user, but do NOT
// require an active org. resolveAuth builds on this and adds the org checks.
async function resolveUser(
  request: FastifyRequest,
  clerk: ClerkClient
): Promise<UserContext> {
  const requestState = await clerk.authenticateRequest(toWebRequest(request));

  if (!requestState.isSignedIn) {
    throw unauthorized("auth.unauthenticated", "Sign-in required.");
  }
  const clerkUserId = requestState.toAuth().userId;

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

  return {
    clerkUserId,
    userId: (userRow as { id: string }).id,
    activeOrgId: (userRow as { active_organization_id: string | null }).active_organization_id
  };
}

async function resolveAuth(
  request: FastifyRequest,
  clerk: ClerkClient
): Promise<AuthContext> {
  const user = await resolveUser(request, clerk);

  if (!user.activeOrgId) {
    throw forbidden("auth.no_active_org", "No active organization selected for this user.");
  }

  const supabase = getDb();
  const { data: membership, error: membershipErr } = await supabase
    .from("organization_memberships")
    .select("status")
    .eq("user_id", user.userId)
    .eq("org_id", user.activeOrgId)
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
    clerkUserId: user.clerkUserId,
    userId: user.userId,
    orgId: user.activeOrgId
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
