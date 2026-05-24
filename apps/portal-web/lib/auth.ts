import { auth } from "@clerk/nextjs/server";
import { getServiceSupabase } from "./supabase.js";

export interface AuthorizedCaller {
  clerkUserId: string;
  userId: string; // public.users.id
  orgId: string; // public.organizations.id (active org)
  roleKey: string;
}

const TECHNICIAN_OR_HIGHER = new Set([
  "owner",
  "admin",
  "manager",
  "technician"
]);

// Resolves the request's Clerk session to a platform user + active org +
// effective role. Throws shaped errors that route handlers translate to HTTP.
export async function requireTechnician(): Promise<AuthorizedCaller> {
  const { userId: clerkUserId } = await auth();
  if (!clerkUserId) {
    throw new HttpError(401, "Sign-in required.");
  }

  const supabase = getServiceSupabase();

  const { data: userRow, error: userErr } = await supabase
    .from("users")
    .select("id, active_organization_id")
    .eq("clerk_user_id", clerkUserId)
    .maybeSingle();
  if (userErr) throw userErr;
  if (!userRow) {
    throw new HttpError(
      403,
      "No platform user exists for this Clerk identity. The Clerk webhook may not have fired yet."
    );
  }
  if (!userRow.active_organization_id) {
    throw new HttpError(403, "No active organization selected for this user.");
  }

  const orgId = userRow.active_organization_id as string;

  const { data: membership, error: membershipErr } = await supabase
    .from("organization_memberships")
    .select("role_id, status, roles!inner(key)")
    .eq("user_id", userRow.id)
    .eq("organization_id", orgId)
    .eq("status", "active")
    .maybeSingle();
  if (membershipErr) throw membershipErr;
  if (!membership) {
    throw new HttpError(403, "No active membership in the selected organization.");
  }

  const roleKey = (membership.roles as unknown as { key: string }).key;
  if (!TECHNICIAN_OR_HIGHER.has(roleKey)) {
    throw new HttpError(403, "Insufficient role for capture operations.");
  }

  return {
    clerkUserId,
    userId: userRow.id as string,
    orgId,
    roleKey
  };
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function toErrorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  // eslint-disable-next-line no-console
  console.error(error);
  return Response.json({ error: "Internal error." }, { status: 500 });
}
