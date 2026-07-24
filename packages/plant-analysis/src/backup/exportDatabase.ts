import type { ImageRecord } from "../types";
import { getDb } from "../database/db";
import { DB_VERSION } from "../database/schema";
import { nowIso } from "../utilities/index";
import { blobToDataUrl } from "./blobCodec";
import { EXPORT_FORMAT_VERSION, type BackupEnvelope, type SerializedImage } from "./backupTypes";

export interface ExportOptions {
  includeImages?: boolean;
}

async function serializeImages(images: ImageRecord[]): Promise<SerializedImage[]> {
  return Promise.all(
    images.map(async ({ blob, ...rest }) => ({ ...rest, dataUrl: await blobToDataUrl(blob) }))
  );
}

/** Exports the entire local database (PRD §10.19). Crop knowledge is always included. */
export async function exportAll(opts: ExportOptions = {}): Promise<BackupEnvelope> {
  const db = getDb();
  const [fields, plants, observations, results, findings, cropProfiles, growthStages, rules, sources] =
    await Promise.all([
      db.fields.toArray(),
      db.plants.toArray(),
      db.observations.toArray(),
      db.results.toArray(),
      db.findings.toArray(),
      db.cropProfiles.toArray(),
      db.growthStages.toArray(),
      db.rules.toArray(),
      db.sources.toArray()
    ]);
  const images = opts.includeImages ? await serializeImages(await db.images.toArray()) : undefined;

  return envelope("all", undefined, {
    fields,
    plants,
    observations,
    results,
    findings,
    cropProfiles,
    growthStages,
    rules,
    sources,
    images
  });
}

/** Exports one field and its full subtree (plants → observations → results → findings → images). */
export async function exportField(
  fieldId: string,
  opts: ExportOptions = {}
): Promise<BackupEnvelope> {
  const db = getDb();
  const field = await db.fields.get(fieldId);
  if (!field) throw new Error(`Field ${fieldId} not found`);

  const plants = await db.plants.where("fieldId").equals(fieldId).toArray();
  const plantIds = plants.map((p) => p.id);
  const observations = await db.observations.where("plantId").anyOf(plantIds).toArray();
  const results = await db.results.where("plantId").anyOf(plantIds).toArray();
  const findings = await db.findings
    .where("analysisResultId")
    .anyOf(results.map((r) => r.id))
    .toArray();
  const imageRecords = await db.images.where("plantId").anyOf(plantIds).toArray();

  // Crop knowledge referenced by these plants — self-contained so the field can be
  // restored (and its results re-rendered) on a device that hasn't seeded.
  const cropIds = [...new Set(plants.map((p) => p.cropProfileId))];
  const cropProfiles = (await db.cropProfiles.toArray()).filter((c) => cropIds.includes(c.cropId));
  const growthStages = (await db.growthStages.toArray()).filter((s) => cropIds.includes(s.cropId));
  const rules = (await db.rules.toArray()).filter((r) => cropIds.includes(r.cropId));
  const sources = (await db.sources.toArray()).filter((s) => cropIds.includes(s.cropId));

  const images = opts.includeImages ? await serializeImages(imageRecords) : undefined;

  return envelope("field", fieldId, {
    fields: [field],
    plants,
    observations,
    results,
    findings,
    cropProfiles,
    growthStages,
    rules,
    sources,
    images
  });
}

function envelope(
  scope: BackupEnvelope["scope"],
  fieldId: string | undefined,
  data: BackupEnvelope["data"]
): BackupEnvelope {
  return {
    exportFormatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: DB_VERSION,
    exportedAt: nowIso(),
    scope,
    fieldId,
    data
  };
}
