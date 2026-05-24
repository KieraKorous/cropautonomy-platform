import { z } from "zod";

// =============================================================================
// Envelope
// =============================================================================

export const envelopeBaseSchema = z.object({
  type: z.string(),
  version: z.number().int().positive(),
  emittedAt: z.string().datetime({ offset: true }),
  emittedBy: z.string().optional()
});

export type RealtimeEventEnvelope<T extends string, P> = {
  type: T;
  version: number;
  payload: P;
  emittedAt: string;
  emittedBy?: string;
};

// =============================================================================
// Reusable payload fragments
// =============================================================================

const locationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracyMeters: z.number().optional()
});

// =============================================================================
// Capture session lifecycle (channel: captureSessionState)
// =============================================================================

export const captureSessionStartedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.started"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    orgId: z.string().uuid(),
    operatorUserId: z.string(),
    farmId: z.string().uuid().optional(),
    fieldId: z.string().uuid().optional(),
    cropTypeId: z.string().uuid().optional(),
    startedAt: z.string().datetime({ offset: true }),
    initialLocation: locationSchema.optional(),
    plannedDurationMinutes: z.number().positive().optional()
  })
});

export const captureSessionLocationV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.location"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    location: locationSchema,
    headingDegrees: z.number().optional(),
    speedMps: z.number().optional(),
    at: z.string().datetime({ offset: true })
  })
});

export const captureSessionPausedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.paused"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    pausedAt: z.string().datetime({ offset: true }),
    reason: z
      .enum(["operator", "low_battery", "connectivity_lost", "other"])
      .optional()
  })
});

export const captureSessionResumedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.resumed"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    resumedAt: z.string().datetime({ offset: true })
  })
});

export const captureSessionEndedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.ended"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    endedAt: z.string().datetime({ offset: true }),
    totalCaptures: z.number().int().nonnegative(),
    reason: z.enum(["operator", "battery_critical", "error"])
  })
});

export const captureRecordedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.recorded"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    captureId: z.string().uuid(),
    mediaType: z.enum(["photo", "burst_frame", "video"]),
    capturedAt: z.string().datetime({ offset: true }),
    location: locationSchema.optional(),
    thumbnailDataUrl: z.string().optional()
  })
});

// =============================================================================
// WebRTC signaling (channel: captureSessionSignal)
// =============================================================================

export const signalViewerJoinV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.viewer.join"),
  version: z.literal(1),
  payload: z.object({
    viewerId: z.string(),
    viewerUserId: z.string(),
    joinedAt: z.string().datetime({ offset: true })
  })
});

export const signalViewerLeaveV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.viewer.leave"),
  version: z.literal(1),
  payload: z.object({
    viewerId: z.string(),
    leftAt: z.string().datetime({ offset: true })
  })
});

export const signalOfferV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.offer"),
  version: z.literal(1),
  payload: z.object({
    from: z.string(),
    to: z.string(),
    sdp: z.string()
  })
});

export const signalAnswerV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.answer"),
  version: z.literal(1),
  payload: z.object({
    from: z.string(),
    to: z.string(),
    sdp: z.string()
  })
});

export const signalIceCandidateV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.ice_candidate"),
  version: z.literal(1),
  payload: z.object({
    from: z.string(),
    to: z.string(),
    candidate: z.record(z.unknown())
  })
});

export const signalPublisherTerminateV1 = envelopeBaseSchema.extend({
  type: z.literal("signal.publisher.terminate"),
  version: z.literal(1),
  payload: z.object({
    reason: z.enum(["session_ended", "error", "operator"])
  })
});

// =============================================================================
// Scan analysis (channel: scanProgress / scanDetection)
// =============================================================================

export const scanStartedV1 = envelopeBaseSchema.extend({
  type: z.literal("scan.started"),
  version: z.literal(1),
  payload: z.object({
    scanId: z.string().uuid(),
    captureId: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true })
  })
});

export const scanProgressV1 = envelopeBaseSchema.extend({
  type: z.literal("scan.progress"),
  version: z.literal(1),
  payload: z.object({
    scanId: z.string().uuid(),
    framesProcessed: z.number().int().nonnegative(),
    framesTotal: z.number().int().nonnegative(),
    percentComplete: z.number().min(0).max(100)
  })
});

export const scanDetectionV1 = envelopeBaseSchema.extend({
  type: z.literal("scan.detection"),
  version: z.literal(1),
  payload: z.object({
    scanId: z.string().uuid(),
    detectionId: z.string().uuid(),
    category: z.string(),
    confidence: z.number().min(0).max(1),
    location: z
      .object({
        lat: z.number(),
        lng: z.number()
      })
      .optional(),
    thumbnailUrl: z.string().url().optional()
  })
});

export const scanCompletedV1 = envelopeBaseSchema.extend({
  type: z.literal("scan.completed"),
  version: z.literal(1),
  payload: z.object({
    scanId: z.string().uuid(),
    completedAt: z.string().datetime({ offset: true }),
    detectionCount: z.number().int().nonnegative(),
    durationMs: z.number().int().nonnegative()
  })
});

export const scanFailedV1 = envelopeBaseSchema.extend({
  type: z.literal("scan.failed"),
  version: z.literal(1),
  payload: z.object({
    scanId: z.string().uuid(),
    failedAt: z.string().datetime({ offset: true }),
    error: z.string(),
    retryable: z.boolean()
  })
});

// =============================================================================
// Registry — every event the platform knows about. Adding a new schema is the
// one place that wires it into both publish-time and receive-time validation.
// =============================================================================

const allSchemas = [
  captureSessionStartedV1,
  captureSessionLocationV1,
  captureSessionPausedV1,
  captureSessionResumedV1,
  captureSessionEndedV1,
  captureRecordedV1,
  signalViewerJoinV1,
  signalViewerLeaveV1,
  signalOfferV1,
  signalAnswerV1,
  signalIceCandidateV1,
  signalPublisherTerminateV1,
  scanStartedV1,
  scanProgressV1,
  scanDetectionV1,
  scanCompletedV1,
  scanFailedV1
] as const;

type AnyEventSchema = (typeof allSchemas)[number];

const registry = new Map<string, AnyEventSchema>();
for (const schema of allSchemas) {
  // type + version uniquely identify a schema
  const def = schema.shape.type as z.ZodLiteral<string>;
  const ver = schema.shape.version as z.ZodLiteral<number>;
  registry.set(registryKey(def.value, ver.value), schema);
}

function registryKey(type: string, version: number) {
  return `${type}@${version}`;
}

export type RealtimeEvent = z.infer<AnyEventSchema>;

// Input shape: payload + type + version. Envelope fields (emittedAt, emittedBy)
// are stamped by the publisher.
export type RealtimeEventInput =
  | Omit<z.infer<typeof captureSessionStartedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureSessionLocationV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureSessionPausedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureSessionResumedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureSessionEndedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureRecordedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalViewerJoinV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalViewerLeaveV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalOfferV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalAnswerV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalIceCandidateV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof signalPublisherTerminateV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanStartedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanProgressV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanDetectionV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanCompletedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanFailedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string };

export function stampEnvelope(input: RealtimeEventInput): RealtimeEvent {
  return {
    ...input,
    emittedAt: new Date().toISOString()
  } as RealtimeEvent;
}

export function validateForPublish(input: RealtimeEventInput): RealtimeEvent {
  const stamped = stampEnvelope(input);
  const schema = registry.get(registryKey(stamped.type, stamped.version));
  if (!schema) {
    throw new Error(
      `Unknown realtime event type+version: ${stamped.type}@${stamped.version}`
    );
  }
  // zod throws on invalid
  return schema.parse(stamped) as RealtimeEvent;
}

export function validateReceived(raw: unknown): RealtimeEvent | null {
  // Soft validate at receive time: unknown types/versions are logged and dropped,
  // not thrown, so a consumer running an older schema doesn't crash on a newer event.
  if (
    typeof raw !== "object" ||
    raw === null ||
    typeof (raw as { type?: unknown }).type !== "string" ||
    typeof (raw as { version?: unknown }).version !== "number"
  ) {
    return null;
  }
  const candidate = raw as { type: string; version: number };
  const schema = registry.get(registryKey(candidate.type, candidate.version));
  if (!schema) return null;
  const result = schema.safeParse(raw);
  if (!result.success) return null;
  return result.data as RealtimeEvent;
}
