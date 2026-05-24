// Channel name helpers. The only legal constructors of realtime channel name
// strings. Consumers must use these so the transport swap stays a one-package
// change. See docs/architecture/realtime-strategy.md and
// docs/architecture/realtime-package-spec.md.

export const channels = {
  // Device channels
  deviceHeartbeat: (orgId: string, deviceId: string) =>
    `org.${orgId}.device.${deviceId}.heartbeat`,
  deviceTelemetry: (orgId: string, deviceId: string) =>
    `org.${orgId}.device.${deviceId}.telemetry`,

  // Scan analysis channels
  scanProgress: (orgId: string, scanId: string) =>
    `org.${orgId}.scan.${scanId}.progress`,
  scanDetection: (orgId: string, scanId: string) =>
    `org.${orgId}.scan.${scanId}.detection`,

  // Capture session channels
  captureSessionState: (orgId: string, sessionId: string) =>
    `org.${orgId}.capture.${sessionId}.state`,
  captureSessionSignal: (orgId: string, sessionId: string) =>
    `org.${orgId}.capture.${sessionId}.signal`,

  // Org-wide fanout channels
  orgNotifications: (orgId: string) => `org.${orgId}.notifications`,
  orgActiveSessions: (orgId: string) => `org.${orgId}.capture.active`
} as const;

export type ChannelName = string;
