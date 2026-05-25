// Centralized queue name constants + payload schemas. Both producers
// (services/api) and consumers (services/workers) import from here so the
// contract has exactly one source of truth.
//
// Queue names follow the realtime event type naming where applicable, so
// pg-boss queues align with the realtime channels that report their progress.

import { z } from "zod";

export const QUEUE_NAMES = {
  scanAnalysisRequested: "scan.analysis.requested"
} as const;

export const scanAnalysisRequestedSchema = z.object({
  captureId: z.string().uuid(),
  analysisJobId: z.string().uuid(),
  orgId: z.string().uuid(),

  // Optional explicit model override. When omitted, the handler picks the
  // production model for the task from model_versions.
  modelName: z.string().optional(),
  modelVersion: z.string().optional(),
  task: z
    .enum([
      "plant_classification",
      "stand_count",
      "tree_count",
      "weed_detection",
      "disease_detection",
      "stage_classification"
    ])
    .default("plant_classification")
});

export type ScanAnalysisRequested = z.infer<typeof scanAnalysisRequestedSchema>;
