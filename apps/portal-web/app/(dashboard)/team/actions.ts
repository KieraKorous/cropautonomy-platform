"use server";

import { revalidatePath } from "next/cache";
import {
  addTeamMember,
  assignEntities,
  createTeam,
  deleteTeam,
  getTeam,
  removeTeamMember,
  unassignEntities,
  updateTeam,
  type AssignmentItem,
  type TeamDetail,
  type TeamSummary,
  type TeamWrite
} from "../../../lib/api";

// Re-fetch a team's roster + assignments for the detail modal. Read-only, so no
// revalidate — the modal calls this on open and after each mutation to refresh.
export async function getTeamAction(id: string): Promise<TeamDetail> {
  return getTeam(id);
}

// Create a team, then refresh the grid (+ the layout counts).
export async function createTeamAction(
  body: TeamWrite & { name: string }
): Promise<TeamSummary> {
  const team = await createTeam(body);
  revalidatePath("/team");
  revalidatePath("/");
  return team;
}

// Edit a team's name/description/color, then refresh.
export async function updateTeamAction(
  id: string,
  patch: TeamWrite
): Promise<TeamSummary> {
  const team = await updateTeam(id, patch);
  revalidatePath("/team");
  revalidatePath("/");
  return team;
}

// Permanently delete a team, then refresh the grid + counts.
export async function deleteTeamAction(id: string): Promise<void> {
  await deleteTeam(id);
  revalidatePath("/team");
  revalidatePath("/");
}

export async function addTeamMemberAction(teamId: string, userId: string): Promise<void> {
  await addTeamMember(teamId, userId);
  revalidatePath("/team");
  revalidatePath("/");
}

export async function removeTeamMemberAction(teamId: string, userId: string): Promise<void> {
  await removeTeamMember(teamId, userId);
  revalidatePath("/team");
  revalidatePath("/");
}

export async function assignEntitiesAction(
  teamId: string,
  assignments: AssignmentItem[],
  cascade?: "farm_descendants"
): Promise<void> {
  await assignEntities(teamId, assignments, cascade);
  revalidatePath("/team");
  revalidatePath("/");
}

export async function unassignEntitiesAction(
  teamId: string,
  assignments: AssignmentItem[]
): Promise<void> {
  await unassignEntities(teamId, assignments);
  revalidatePath("/team");
  revalidatePath("/");
}
