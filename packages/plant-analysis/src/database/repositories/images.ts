import type { ImageRecord, PlantColorAnalysis } from "../../types";
import { detachBlob, newId, nowIso } from "../../utilities/index";
import { getDb } from "../db";

// Image capture/compression UI lands in Phase 10, but the storage primitive is
// ready: blobs are detached (arrayBuffer round-trip) before put() to survive iOS
// Safari's blob revocation.

export async function saveImage(
  input: Omit<ImageRecord, "id" | "createdAt" | "blob">,
  blob: Blob
): Promise<ImageRecord> {
  const record: ImageRecord = {
    ...input,
    id: newId("img"),
    blob: await detachBlob(blob),
    createdAt: nowIso()
  };
  await getDb().images.put(record);
  return record;
}

export async function listImagesByPlant(plantId: string): Promise<ImageRecord[]> {
  return getDb()
    .images.where("[plantId+createdAt]")
    .between([plantId, ""], [plantId, "￿"])
    .reverse()
    .toArray();
}

/** Attaches (or clears) on-demand color analysis for an image. */
export async function setImageAnalysis(
  id: string,
  analysis: PlantColorAnalysis | undefined
): Promise<void> {
  await getDb().images.update(id, { analysis });
}

export async function deleteImage(id: string): Promise<void> {
  await getDb().images.delete(id);
}
