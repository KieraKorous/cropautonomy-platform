import { env } from "../env.js";
import { getApiToken } from "./auth.js";

export interface ReserveCaptureRequest {
  farmId?: string | null;
  fieldId?: string | null;
  zoneId?: string | null;
  cropTypeId?: string | null;
  sessionId?: string | null;
  // Team this capture is filed under. Optional: when omitted and the tech has
  // exactly one team, the server auto-assigns it.
  teamId?: string | null;
  // The paired device this capture came from, so the portal can attribute
  // activity (incl. capture-only sessions) to the device.
  deviceId?: string | null;
  source: "field_capture_pwa";
  mediaType: "photo" | "burst_frame" | "video";
  // 'observation' (default) vs a saved live-feed recording.
  kind?: "observation" | "session_recording";
  burstIndex?: number | null;
  videoDurationMs?: number | null;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string | null;
  capturedAt: string;
  location?: { lat: number; lng: number; accuracyMeters?: number } | null;
  headingDegrees?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ReserveCaptureResponse {
  captureId: string;
  storagePath: string;
  uploadUrl: string;
  uploadToken: string;
  uploadMethod: "put" | "tus";
  uploadHeaders: Record<string, string>;
  expiresAt: string;
}

export interface FinalizeCaptureRequest {
  actualSizeBytes: number;
  actualChecksumSha256?: string;
  thumbnailDataUrl?: string;
}

export interface SessionStartRequest {
  farmId?: string | null;
  fieldId?: string | null;
  cropTypeId?: string | null;
  // Team this session (and its captures) is filed under. Optional: the server
  // auto-assigns the tech's only team when omitted.
  teamId?: string | null;
  initialLocation?: { lat: number; lng: number; accuracyMeters?: number } | null;
  plannedDurationMinutes?: number;
}

export interface TeamRecord {
  id: string;
  name: string;
  color: string | null;
}

export interface MyTeamsResponse {
  teams: TeamRecord[];
}

export interface SessionStartResponse {
  sessionId: string;
  orgId: string;
  startedAt: string;
}

export interface ClaimPairingRequest {
  code: string;
  deviceName: string;
  serial: string;
}

export interface ClaimPairingResponse {
  pairingId: string;
  deviceId: string;
  deviceName: string;
  orgId: string;
}

export interface CreateLiveRequestBody {
  deviceId: string;
  farmId?: string | null;
  fieldId?: string | null;
  cropTypeId?: string | null;
}

export interface CreateLiveRequestResponse {
  requestId: string;
  expiresAt: string;
  status: string;
  orgId: string;
  // Present (and status "accepted") when the device is auto-live: the server
  // grants immediately and spawns the session, so the phone can adopt it without
  // waiting for a watcher.
  sessionId?: string | null;
}

export interface DeviceLiveConfigResponse {
  deviceId: string;
  autoLiveEnabled: boolean;
}

export interface LiveRequestStatusResponse {
  requestId: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
  sessionId: string | null;
  deviceId: string;
  orgId: string;
}

export interface FieldRecord {
  id: string;
  farmId: string;
  name: string;
  areaAcres: number | null;
  // GeoJSON Polygon { type: "Polygon", coordinates: [[[lng, lat], …]] }
  boundary: { type: "Polygon"; coordinates: number[][][] } | null;
  // GeoJSON Point { type: "Point", coordinates: [lng, lat] }
  centroid: { type: "Point"; coordinates: [number, number] } | null;
}

export interface ListFieldsResponse {
  fields: FieldRecord[];
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const url = `${env.apiBase}${path}`;
  const token = await getApiToken();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {})
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, { ...init, headers });

  if (!response.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await response.json());
    } catch {
      detail = await response.text().catch(() => "");
    }
    throw new Error(`API ${response.status} ${path}: ${detail || response.statusText}`);
  }
  return (await response.json()) as T;
}

export const api = {
  reserveCapture: (body: ReserveCaptureRequest) =>
    call<ReserveCaptureResponse>("/v1/captures", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  finalizeCapture: (id: string, body: FinalizeCaptureRequest) =>
    call<{ captureId: string; analysisJobId: string | null; status: string }>(
      `/v1/captures/${id}/finalize`,
      { method: "POST", body: JSON.stringify(body) }
    ),
  startSession: (body: SessionStartRequest) =>
    call<SessionStartResponse>("/v1/capture-sessions", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  patchSession: (
    id: string,
    action:
      | { action: "pause"; reason?: string }
      | { action: "resume" }
      | { action: "end"; reason?: string }
      | { action: "heartbeat" }
      // Operator rejoins the live wall after a supervisor disconnected them.
      | { action: "reconnect" }
  ) =>
    call<{ sessionId: string; action: string }>(`/v1/capture-sessions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(action)
    }),
  listFields: () => call<ListFieldsResponse>("/v1/fields", { method: "GET" }),
  // The caller's own teams — drives the Field Capture team selector.
  getMyTeams: () => call<MyTeamsResponse>("/v1/me/teams", { method: "GET" }),
  // Claim a pairing code minted by the portal — enrols this phone as a `phone`
  // device. Idempotent on (org, serial), so re-pairing the same phone is safe.
  claimPairing: (body: ClaimPairingRequest) =>
    call<ClaimPairingResponse>("/v1/device-pairings/claim", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  // Ask to go live. A watcher accepts on the portal Live screen, which grants the
  // session over the device-commands channel.
  createLiveRequest: (body: CreateLiveRequestBody) =>
    call<CreateLiveRequestResponse>("/v1/live-requests", {
      method: "POST",
      body: JSON.stringify(body)
    }),
  cancelLiveRequest: (id: string) =>
    call<{ requestId: string; status: string }>(`/v1/live-requests/${id}/cancel`, {
      method: "POST"
    }),
  // Poll a request's status while waiting for a watcher to decide — the reliable
  // path to going live (doesn't depend on a realtime broadcast reaching us).
  getLiveRequest: (id: string) =>
    call<LiveRequestStatusResponse>(`/v1/live-requests/${id}`, { method: "GET" }),
  // Read this device's go-live config (auto-live flag) so the field app knows
  // whether to connect to live automatically on open.
  getDeviceLiveConfig: (deviceId: string) =>
    call<DeviceLiveConfigResponse>(`/v1/devices/${deviceId}/live-config`, {
      method: "GET"
    })
};
