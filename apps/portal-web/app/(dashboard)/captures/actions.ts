"use server";

import { revalidatePath } from "next/cache";
import {
  assignEntities,
  createAnnotation,
  discardCapture,
  reanalyzeCapture,
  unassignEntities,
  updateCaptureDetails,
  type AnnotationInput,
  type CaptureDetailsPatch
} from "../../../lib/api";

// Soft-discards a capture, then refreshes the table. The capture stays in the
// DB + Storage; it just drops out of the default list. Permanent deletion lives
// on the settings page.
export async function discardCaptureAction(id: string): Promise<void> {
  await discardCapture(id);
  revalidatePath("/captures");
}

// Re-queues analysis for a failed capture, then refreshes the table so the row
// flips back to "Analyzing".
export async function reanalyzeCaptureAction(id: string): Promise<void> {
  await reanalyzeCapture(id);
  revalidatePath("/captures");
}

// Reviewer corrections to the AI-filled details. Refreshes the detail page so
// the persisted values are reflected.
export async function updateCaptureDetailsAction(
  id: string,
  patch: CaptureDetailsPatch
): Promise<void> {
  await updateCaptureDetails(id, patch);
  revalidatePath(`/captures/${id}`);
}

// Confirm / reject / correct / add a finding on a capture. Appends a
// capture_annotations row, then refreshes the detail page so the new review
// state shows.
export async function createAnnotationAction(
  id: string,
  input: AnnotationInput
): Promise<void> {
  await createAnnotation(id, input);
  revalidatePath(`/captures/${id}`);
}

// Assign or unassign a capture to/from a single team (the detail modal's team
// selector toggles these per team). Requires teams.assign (manager+).
export async function setCaptureTeamAction(
  captureId: string,
  teamId: string,
  assigned: boolean
): Promise<void> {
  const item = [{ resourceType: "capture" as const, resourceId: captureId }];
  if (assigned) await assignEntities(teamId, item);
  else await unassignEntities(teamId, item);
  revalidatePath("/captures");
  revalidatePath("/recordings");
}

