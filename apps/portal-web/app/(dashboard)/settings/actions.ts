"use server";

import { revalidatePath } from "next/cache";
import {
  deleteCapture,
  listDiscardedCaptures,
  listDiscardedRecordings
} from "../../../lib/api";

// Permanently deletes a single discarded capture (row + Storage object), then
// refreshes the settings view. Irreversible — the UI confirms before calling.
export async function deleteCaptureAction(id: string): Promise<void> {
  await deleteCapture(id);
  revalidatePath("/settings");
}

// Permanently deletes every discarded capture for the org. No bulk API endpoint
// yet, so this fans out one DELETE per capture; failures surface to the caller.
export async function purgeDiscardedAction(): Promise<void> {
  const { captures } = await listDiscardedCaptures();
  await Promise.all(captures.map((c) => deleteCapture(c.id)));
  revalidatePath("/settings");
}

// Permanently deletes a single discarded recording. Recordings are captures
// (kind='session_recording'), so this reuses the same delete endpoint.
export async function deleteRecordingAction(id: string): Promise<void> {
  await deleteCapture(id);
  revalidatePath("/settings");
}

// Permanently deletes every discarded recording for the org, fanning out one
// DELETE per recording. Mirrors purgeDiscardedAction for the recordings section.
export async function purgeDiscardedRecordingsAction(): Promise<void> {
  const { captures } = await listDiscardedRecordings();
  await Promise.all(captures.map((c) => deleteCapture(c.id)));
  revalidatePath("/settings");
}
