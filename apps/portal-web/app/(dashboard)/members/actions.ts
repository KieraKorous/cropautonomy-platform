"use server";

import { revalidatePath } from "next/cache";
import {
  inviteMember,
  removeMember,
  revokeInvitation,
  updateMember,
  type MemberInvitation
} from "../../../lib/api";

// Change a member's role and/or status, then refresh the roster + layout counts.
export async function updateMemberAction(
  userId: string,
  patch: { roleKey?: string; status?: "active" | "suspended" }
): Promise<void> {
  await updateMember(userId, patch);
  revalidatePath("/members");
  revalidatePath("/");
}

// Soft-remove a member from the org, then refresh.
export async function removeMemberAction(userId: string): Promise<void> {
  await removeMember(userId);
  revalidatePath("/members");
  revalidatePath("/");
}

// Invite an email at a role. Returns the invitation so the view can show it.
export async function inviteMemberAction(
  email: string,
  roleKey: string
): Promise<MemberInvitation> {
  const invitation = await inviteMember(email, roleKey);
  revalidatePath("/members");
  return invitation;
}

// Revoke a pending invitation, then refresh.
export async function revokeInvitationAction(id: string): Promise<void> {
  await revokeInvitation(id);
  revalidatePath("/members");
}
