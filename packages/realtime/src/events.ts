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
// Capture session connection (channel: captureSessionState)
// Authoritative disconnect/reconnect, so every watcher's tile flips together.
// =============================================================================

export const captureSessionDisconnectedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.disconnected"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    disconnectedAt: z.string().datetime({ offset: true })
  })
});

export const captureSessionReconnectedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.session.reconnected"),
  version: z.literal(1),
  payload: z.object({
    sessionId: z.string().uuid(),
    reconnectedAt: z.string().datetime({ offset: true })
  })
});

// =============================================================================
// Device pairing (channel: devicePairing)
// =============================================================================

export const devicePairingClaimedV1 = envelopeBaseSchema.extend({
  type: z.literal("device.pairing.claimed"),
  version: z.literal(1),
  payload: z.object({
    pairingId: z.string().uuid(),
    deviceId: z.string().uuid(),
    deviceName: z.string(),
    claimedAt: z.string().datetime({ offset: true })
  })
});

// =============================================================================
// Live requests (channel: liveRequests) — the Live screen's pending panel.
// =============================================================================

export const liveRequestCreatedV1 = envelopeBaseSchema.extend({
  type: z.literal("live.request.created"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    orgId: z.string().uuid(),
    deviceId: z.string().uuid(),
    deviceName: z.string(),
    requestedByUserId: z.string(),
    farmId: z.string().uuid().optional(),
    fieldId: z.string().uuid().optional(),
    cropTypeId: z.string().uuid().optional(),
    requestedAt: z.string().datetime({ offset: true })
  })
});

export const liveRequestAcceptedV1 = envelopeBaseSchema.extend({
  type: z.literal("live.request.accepted"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    sessionId: z.string().uuid(),
    decidedByUserId: z.string(),
    decidedAt: z.string().datetime({ offset: true })
  })
});

export const liveRequestRejectedV1 = envelopeBaseSchema.extend({
  type: z.literal("live.request.rejected"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    decidedByUserId: z.string(),
    decidedAt: z.string().datetime({ offset: true })
  })
});

export const liveRequestCancelledV1 = envelopeBaseSchema.extend({
  type: z.literal("live.request.cancelled"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    cancelledAt: z.string().datetime({ offset: true })
  })
});

// =============================================================================
// Device commands (channel: deviceCommands) — directed at one phone.
// =============================================================================

export const deviceCommandLiveGrantedV1 = envelopeBaseSchema.extend({
  type: z.literal("device.command.live_granted"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    orgId: z.string().uuid(),
    sessionId: z.string().uuid(),
    grantedAt: z.string().datetime({ offset: true })
  })
});

export const deviceCommandLiveRejectedV1 = envelopeBaseSchema.extend({
  type: z.literal("device.command.live_rejected"),
  version: z.literal(1),
  payload: z.object({
    requestId: z.string().uuid(),
    deviceId: z.string().uuid(),
    rejectedAt: z.string().datetime({ offset: true })
  })
});

export const deviceCommandDisconnectV1 = envelopeBaseSchema.extend({
  type: z.literal("device.command.disconnect"),
  version: z.literal(1),
  payload: z.object({
    deviceId: z.string().uuid(),
    sessionId: z.string().uuid(),
    disconnectedAt: z.string().datetime({ offset: true })
  })
});

export const deviceCommandReconnectV1 = envelopeBaseSchema.extend({
  type: z.literal("device.command.reconnect"),
  version: z.literal(1),
  payload: z.object({
    deviceId: z.string().uuid(),
    sessionId: z.string().uuid(),
    reconnectedAt: z.string().datetime({ offset: true })
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
    // Crop-intelligence domain of the detection (plant / disease / pest / …).
    // Optional so pre-0024 consumers/producers stay valid. See
    // docs/architecture/capture-analysis-intelligence.md.
    findingType: z.string().optional(),
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
// Capture feed (channel: orgCaptures) — org-wide per-capture fanout so list
// views (the captures page) refresh live. Deliberately thin: it carries the
// capture's identity + status, not the full row. Consumers re-fetch the
// authoritative capture(s) rather than reconstruct from the event.
// =============================================================================

export const captureChangedV1 = envelopeBaseSchema.extend({
  type: z.literal("capture.changed"),
  version: z.literal(1),
  payload: z.object({
    captureId: z.string().uuid(),
    orgId: z.string().uuid(),
    status: z.string(),
    // Why it changed, so consumers can react selectively: "created" = a new row
    // entered the list; "analyzing"/"analyzed"/"failed" = lifecycle transitions.
    changeType: z.enum(["created", "analyzing", "analyzed", "failed"])
  })
});

// =============================================================================
// Team feed (channel: orgTeams) — org-wide per-assignment fanout so open list
// views + the Live wall re-fetch when an entity's team set changes (which may
// change who can see it). Thin, like capture.changed: identity + what changed,
// not the row. Consumers re-fetch the authoritative rows.
// =============================================================================

export const teamAssignmentChangedV1 = envelopeBaseSchema.extend({
  type: z.literal("team.assignment.changed"),
  version: z.literal(1),
  payload: z.object({
    orgId: z.string().uuid(),
    teamId: z.string().uuid(),
    resourceType: z.enum([
      "farm",
      "field",
      "device",
      "capture_session",
      "capture",
      "scout_task"
    ]),
    resourceId: z.string().uuid(),
    changeType: z.enum(["assigned", "unassigned"])
  })
});

// =============================================================================
// Scout-task feed (channel: orgScoutTasks) — org-wide per-task fanout so the
// scout list refreshes live. Thin, like capture.changed: identity + status +
// why it changed. Consumers re-fetch the authoritative task(s).
// =============================================================================

export const scoutTaskChangedV1 = envelopeBaseSchema.extend({
  type: z.literal("scout.task.changed"),
  version: z.literal(1),
  payload: z.object({
    taskId: z.string().uuid(),
    orgId: z.string().uuid(),
    status: z.enum(["open", "in_progress", "done"]),
    changeType: z.enum(["created", "updated", "status_changed", "deleted"])
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
  captureSessionDisconnectedV1,
  captureSessionReconnectedV1,
  devicePairingClaimedV1,
  liveRequestCreatedV1,
  liveRequestAcceptedV1,
  liveRequestRejectedV1,
  liveRequestCancelledV1,
  deviceCommandLiveGrantedV1,
  deviceCommandLiveRejectedV1,
  deviceCommandDisconnectV1,
  deviceCommandReconnectV1,
  scanStartedV1,
  scanProgressV1,
  scanDetectionV1,
  scanCompletedV1,
  scanFailedV1,
  captureChangedV1,
  teamAssignmentChangedV1,
  scoutTaskChangedV1
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
  | Omit<z.infer<typeof captureSessionDisconnectedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureSessionReconnectedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof devicePairingClaimedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof liveRequestCreatedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof liveRequestAcceptedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof liveRequestRejectedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof liveRequestCancelledV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof deviceCommandLiveGrantedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof deviceCommandLiveRejectedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof deviceCommandDisconnectV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof deviceCommandReconnectV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanStartedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanProgressV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanDetectionV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanCompletedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scanFailedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof captureChangedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof teamAssignmentChangedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string }
  | Omit<z.infer<typeof scoutTaskChangedV1>, "emittedAt" | "emittedBy"> & { emittedBy?: string };

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
