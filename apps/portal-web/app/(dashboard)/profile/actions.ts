"use server";

import {
  ApiError,
  createOrganization,
  setActiveOrganization,
  type MyOrganization
} from "../../../lib/api";

// Server actions RETURN their outcome instead of throwing — Next scrubs thrown
// server-action messages in production. Mirrors app/(dashboard)/members/actions.ts;
// callers invoke router.refresh() after a successful result rather than
// revalidatePath() (which runs outside Clerk middleware context).
export type ActionResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// Create a new organization; the caller becomes its Owner and it becomes active.
export async function createOrganizationAction(
  name: string
): Promise<{ ok: true; organization: MyOrganization } | { ok: false; error: string }> {
  try {
    const { organization } = await createOrganization(name);
    return { ok: true, organization };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Switch the caller's active organization to one they already belong to.
export async function setActiveOrganizationAction(orgId: string): Promise<ActionResult> {
  try {
    await setActiveOrganization(orgId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
