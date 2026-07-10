"use server";

import { revalidatePath } from "next/cache";
import { assignEntities, discardCapture, reanalyzeCapture } from "../../../lib/api";

// Bulk operations over a selection of captures/recordings. Recordings are just
// captures (kind='session_recording'), so all of these run against the capture
// endpoints. Each revalidates both list pages so the toolbar works from either.
// Per-item failures are tolerated (allSettled) — one bad id shouldn't abort the
// whole batch.

function revalidateLists() {
  revalidatePath("/captures");
  revalidatePath("/recordings");
}

export async function bulkDiscardAction(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => discardCapture(id)));
  revalidateLists();
}

// File every selected item onto one team in a single call — assignEntities
// already takes a list. Requires teams.assign (manager+); the API enforces it.
export async function bulkAssignTeamAction(ids: string[], teamId: string): Promise<void> {
  if (ids.length === 0) return;
  await assignEntities(
    teamId,
    ids.map((id) => ({ resourceType: "capture" as const, resourceId: id }))
  );
  revalidateLists();
}

// Re-queue analysis for the selected failed captures. Callers pass only failed
// ids; a non-failed capture 409s, which allSettled swallows harmlessly.
export async function bulkReanalyzeAction(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.allSettled(ids.map((id) => reanalyzeCapture(id)));
  revalidateLists();
}
