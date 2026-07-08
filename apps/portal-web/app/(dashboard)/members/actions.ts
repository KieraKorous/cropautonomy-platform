"use server";

import {
  ApiError,
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMember,
  type MemberInvitation
} from "../../../lib/api";

// Server actions RETURN their outcome instead of throwing. In production Next
// scrubs the message off any error a server action throws (replacing it with an
// opaque digest), so a thrown failure reaches the UI as "an error occurred" with
// no cause. Returning the error as data keeps the real message intact.
//
// These deliberately do NOT call revalidatePath(): revalidating inside a server
// action forces a re-render of the route *within the action's execution scope*,
// which runs outside Clerk's middleware async-context — so the re-render's
// auth() call throws "can't detect clerkMiddleware()". Callers instead invoke
// router.refresh() on the client after a successful result, which re-fetches the
// route through middleware normally. See proxy.ts.
export type ActionResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// Change a member's role and/or status.
export async function updateMemberAction(
  userId: string,
  patch: { roleKey?: string; status?: "active" | "suspended" }
): Promise<ActionResult> {
  try {
    await updateMember(userId, patch);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Soft-remove a member from the org.
export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    await removeMember(userId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Invite an email at a role. Returns the invitation on success, or the real
// failure reason (Clerk/config/permission) so the modal can show it.
export type InviteResult =
  | { ok: true; invitation: MemberInvitation }
  | { ok: false; error: string };

export async function inviteMemberAction(
  email: string,
  roleKey: string
): Promise<InviteResult> {
  try {
    const invitation = await inviteMember(email, roleKey);
    return { ok: true, invitation };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Revoke a pending invitation.
export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  try {
    await revokeInvitation(id);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
