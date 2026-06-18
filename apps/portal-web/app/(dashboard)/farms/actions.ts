"use server";

import { revalidatePath } from "next/cache";
import tzlookup from "tz-lookup";
import {
  createFarm,
  deleteFarm,
  updateFarm,
  type FarmSummary,
  type FarmWrite
} from "../../../lib/api";

// Resolve the IANA timezone for a coordinate (e.g. a geocoded farm address), so
// the form can auto-fill the timezone dropdown. Runs server-side to keep the
// tz-lookup boundary data out of the client bundle. Returns null on bad input.
export async function timezoneForCoordsAction(
  lat: number,
  lng: number
): Promise<string | null> {
  try {
    return tzlookup(lat, lng);
  } catch {
    return null;
  }
}

// Create a farm, then refresh the grid (+ the overview/sidebar counts, which
// read the farm list on the dashboard layout) so the new card appears.
export async function createFarmAction(
  body: FarmWrite & { name: string }
): Promise<FarmSummary> {
  const farm = await createFarm(body);
  revalidatePath("/farms");
  revalidatePath("/");
  return farm;
}

// Edit any subset of a farm's fields, then refresh so the card reflects it.
export async function updateFarmAction(
  id: string,
  patch: FarmWrite
): Promise<FarmSummary> {
  const farm = await updateFarm(id, patch);
  revalidatePath("/farms");
  revalidatePath("/");
  return farm;
}

// Permanently delete a farm (409s if it still has fields), then refresh the grid
// and counts.
export async function deleteFarmAction(id: string): Promise<void> {
  await deleteFarm(id);
  revalidatePath("/farms");
  revalidatePath("/");
}
