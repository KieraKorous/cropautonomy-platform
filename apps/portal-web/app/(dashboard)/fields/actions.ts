"use server";

import { revalidatePath } from "next/cache";
import {
  assignEntities,
  createField,
  createZone,
  deleteField,
  deleteZone,
  unassignEntities,
  updateField,
  updateZone,
  type FieldSummary,
  type FieldWrite,
  type ZoneSummary,
  type ZoneWrite
} from "../../../lib/api";

// Create a field, then refresh the grid (+ the overview/sidebar counts, which
// read the field list on the dashboard layout) so the new card appears.
export async function createFieldAction(
  body: FieldWrite & { name: string; farmId: string }
): Promise<FieldSummary> {
  const field = await createField(body);
  revalidatePath("/fields");
  revalidatePath("/");
  return field;
}

// Edit any subset of a field's columns, then refresh so the card reflects it.
export async function updateFieldAction(
  id: string,
  patch: FieldWrite
): Promise<FieldSummary> {
  const field = await updateField(id, patch);
  revalidatePath("/fields");
  revalidatePath("/");
  return field;
}

// Permanently delete a field (409s if it still has captures), then refresh the
// grid and counts.
export async function deleteFieldAction(id: string): Promise<void> {
  await deleteField(id);
  revalidatePath("/fields");
  revalidatePath("/");
}

// Assign or unassign a field to/from a single team (the field modal's team
// selector toggles these per team). Requires teams.assign (manager+).
export async function setFieldTeamAction(
  fieldId: string,
  teamId: string,
  assigned: boolean
): Promise<void> {
  const item = [{ resourceType: "field" as const, resourceId: fieldId }];
  if (assigned) await assignEntities(teamId, item);
  else await unassignEntities(teamId, item);
  revalidatePath("/fields");
}

// --- Zones ----------------------------------------------------------------

export async function createZoneAction(
  body: ZoneWrite & { fieldId: string; name: string }
): Promise<ZoneSummary> {
  const zone = await createZone(body);
  revalidatePath("/fields");
  return zone;
}

export async function updateZoneAction(id: string, patch: ZoneWrite): Promise<ZoneSummary> {
  const zone = await updateZone(id, patch);
  revalidatePath("/fields");
  return zone;
}

export async function deleteZoneAction(id: string): Promise<void> {
  await deleteZone(id);
  revalidatePath("/fields");
}
