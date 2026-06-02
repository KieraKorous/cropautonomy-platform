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

  // Device commands — directed back-channel to a single phone (live granted /
  // rejected, disconnect, reconnect). The phone subscribes; the portal/API
  // publishes.
  deviceCommands: (orgId: string, deviceId: string) =>
    `org.${orgId}.device.${deviceId}.commands`,
  // Pairing handshake — the portal watches this until the phone claims the code.
  devicePairing: (orgId: string, pairingId: string) =>
    `org.${orgId}.pairing.${pairingId}`,

  // Org-wide fanout channels
  orgNotifications: (orgId: string) => `org.${orgId}.notifications`,
  orgActiveSessions: (orgId: string) => `org.${orgId}.capture.active`,
  // Pending go-live requests — the Live screen's request panel watches this.
  liveRequests: (orgId: string) => `org.${orgId}.live.requests`
} as const;

export type ChannelName = string;
