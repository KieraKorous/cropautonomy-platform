"use server";

import { revalidatePath } from "next/cache";
import {
  ApiError,
  assignEntities,
  completeScoutTask,
  createScoutTask,
  deleteScoutTask,
  unassignEntities,
  updateScoutTask,
  type ScoutTaskStatus,
  type ScoutTaskWrite
} from "../../../lib/api";

// A throw inside a server action is masked by Next in production ("An error
// occurred in the Server Components render…"), which hides the real cause. So
// actions that a form surfaces to the user RETURN the error instead of throwing.
export type ActionResult = { ok: true } | { ok: false; error: string };

function toActionError(err: unknown): string {
  if (err instanceof ApiError) {
    // Include the API's code + request id so a masked 500 is still traceable.
    return err.code ? `${err.message} (${err.code})` : err.message;
  }
  return err instanceof Error ? err.message : "Unknown error.";
}

// Create a scout task, then refresh the board. Managers+ only (server-enforced).
export async function createScoutTaskAction(
  body: ScoutTaskWrite & { title: string; teamIds?: string[] }
): Promise<ActionResult> {
  try {
    await createScoutTask(body);
  } catch (err) {
    return { ok: false, error: toActionError(err) };
  }
  revalidatePath("/scout-list");
  return { ok: true };
}

// Edit a task's body/assignee/field/due/priority, then refresh.
export async function updateScoutTaskAction(
  id: string,
  patch: ScoutTaskWrite
): Promise<void> {
  await updateScoutTask(id, patch);
  revalidatePath("/scout-list");
}

// Change a task's status (open → in_progress → done). The assignee may complete
// their own task; broader edits need scout_tasks.update (server-enforced).
export async function completeScoutTaskAction(
  id: string,
  status: ScoutTaskStatus
): Promise<void> {
  await completeScoutTask(id, status);
  revalidatePath("/scout-list");
}

export async function deleteScoutTaskAction(id: string): Promise<void> {
  await deleteScoutTask(id);
  revalidatePath("/scout-list");
}

// Assign or unassign a task to/from a single team (the team selector toggles
// these per team). Requires teams.assign (manager+).
export async function setScoutTaskTeamAction(
  taskId: string,
  teamId: string,
  assigned: boolean
): Promise<void> {
  const item = [{ resourceType: "scout_task" as const, resourceId: taskId }];
  if (assigned) await assignEntities(teamId, item);
  else await unassignEntities(teamId, item);
  revalidatePath("/scout-list");
}
