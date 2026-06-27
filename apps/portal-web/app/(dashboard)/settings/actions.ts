"use server";

import { revalidatePath } from "next/cache";
import { deleteCapture, listDiscardedCaptures, recoverCapture } from "../../../lib/api";

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

// Recovers a discarded capture or recording (clears discarded_at), then refreshes
// settings plus both lists it could reappear in.
export async function recoverCaptureAction(id: string): Promise<void> {
  await recoverCapture(id);
  revalidatePath("/settings");
  revalidatePath("/captures");
  revalidatePath("/recordings");
}
