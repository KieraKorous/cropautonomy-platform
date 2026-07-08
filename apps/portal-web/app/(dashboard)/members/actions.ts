"use server";

import { revalidatePath } from "next/cache";
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
export type ActionResult = { ok: true } | { ok: false; error: string };

function toError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

// Change a member's role and/or status, then refresh the roster + layout counts.
export async function updateMemberAction(
  userId: string,
  patch: { roleKey?: string; status?: "active" | "suspended" }
): Promise<ActionResult> {
  try {
    await updateMember(userId, patch);
    revalidatePath("/members");
    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Soft-remove a member from the org, then refresh.
export async function removeMemberAction(userId: string): Promise<ActionResult> {
  try {
    await removeMember(userId);
    revalidatePath("/members");
    revalidatePath("/");
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
    revalidatePath("/members");
    return { ok: true, invitation };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}

// Revoke a pending invitation, then refresh.
export async function revokeInvitationAction(id: string): Promise<ActionResult> {
  try {
    await revokeInvitation(id);
    revalidatePath("/members");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: toError(err) };
  }
}
