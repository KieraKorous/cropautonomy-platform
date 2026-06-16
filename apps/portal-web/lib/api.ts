import { auth } from "@clerk/nextjs/server";

// Server-side client for services/api (api.cropautonomy.com). The portal never
// touches the database directly — all tenant data flows through this API with
// the caller's Clerk session token. See apps/portal-web/.env.example § API base
// and docs/architecture/api-architecture.md.

// Name must match the build pipeline (deploy.yml + portal Dockerfile inline
// NEXT_PUBLIC_API_BASE_URL at build time). Trailing slash would produce
// `//v1/...` and a route.not_found 404, so strip it.
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080").replace(
  /\/+$/,
  ""
);

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { getToken } = await auth();
  const token = await getToken();

  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  if (!response.ok) {
    // services/api wraps errors as { error: { code, message } }.
    let detail = response.statusText;
    let code: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
        message?: string;
      };
      detail = body?.error?.message ?? body?.message ?? detail;
      code = body?.error?.code;
    } catch {
      // non-JSON error body — keep the status text
    }
    throw new ApiError(response.status, detail, code);
  }

  return (await response.json()) as T;
}

// --- Captures -------------------------------------------------------------

export type CaptureStatus =
  | "pending_upload"
  | "uploading"
  | "uploaded"
  | "analysis_queued"
  | "analysis_running"
  | "analyzed"
  | "failed";

export type ObservationType =
  | "pest"
  | "disease"
  | "weed"
  | "nutrient"
  | "irrigation"
  | "damage"
  | "growth_stage"
  | "other";

export type Severity = "low" | "medium" | "high";

export type CaptureKind = "observation" | "session_recording";

export interface CaptureSummary {
  id: string;
  status: CaptureStatus;
  statusMessage: string | null;
  mediaType: "photo" | "burst_frame" | "video";
  kind: CaptureKind;
  capturedAt: string;
  uploadedAt: string | null;
  plantType: string | null;
  // Model-authored agronomic brief (short). AI-filled, reviewer-editable.
  summary: string | null;
  // Model-authored in-depth analysis (what's healthy vs. what's wrong).
  // AI-filled, reviewer-editable. Longer than `summary`.
  details: string | null;
  // Operator-authored free-form notes, edited on the detail page.
  description: string | null;
  observationType: ObservationType | null;
  severity: Severity | null;
  imageUrl: string | null;
  fieldId: string | null;
  sessionId: string | null;
  sizeBytes: number | null;
  videoDurationMs: number | null;
  analysisJobId: string | null;
  discardedAt: string | null;
}

export interface CaptureDetailResponse {
  capture: CaptureSummary;
  // Other captures sharing the same identified plant type (newest first).
  related: CaptureSummary[];
}

interface ListCapturesResponse {
  captures: CaptureSummary[];
  limit: number;
  offset: number;
}

export function listCaptures(
  params: {
    limit?: number;
    offset?: number;
    discarded?: boolean;
    kind?: CaptureKind;
  } = {}
): Promise<ListCapturesResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.discarded != null) search.set("discarded", String(params.discarded));
  if (params.kind != null) search.set("kind", params.kind);
  const query = search.toString();
  return apiFetch<ListCapturesResponse>(`/v1/captures${query ? `?${query}` : ""}`);
}

// Session recordings (kind='session_recording') for the Recordings section.
export function listRecordings(
  params: { limit?: number; offset?: number } = {}
): Promise<ListCapturesResponse> {
  return listCaptures({ ...params, kind: "session_recording" });
}

// Single capture for the /captures/{id} detail page, with same-plant siblings
// for the bottom bar. 404s (ApiError) when the id is unknown or cross-tenant.
export function getCapture(
  id: string,
  params: { relatedLimit?: number } = {}
): Promise<CaptureDetailResponse> {
  const query = params.relatedLimit != null ? `?relatedLimit=${params.relatedLimit}` : "";
  return apiFetch<CaptureDetailResponse>(`/v1/captures/${id}${query}`);
}

// Reviewer corrections to the AI-filled capture details. The analysis pipeline
// fills these automatically; this lets a reviewer override any of them. Any
// subset; empty-string summary clears it, null clears the structured fields.
export interface CaptureDetailsPatch {
  summary?: string;
  details?: string;
  observationType?: ObservationType | null;
  severity?: Severity | null;
}

export function updateCaptureDetails(
  id: string,
  patch: CaptureDetailsPatch
): Promise<{ captureId: string } & Record<string, unknown>> {
  return apiFetch(`/v1/captures/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

// --- Portal recordings (watcher records the live WebRTC stream) -----------

export interface ReserveCaptureBody {
  sessionId?: string | null;
  fieldId?: string | null;
  farmId?: string | null;
  source: "portal_recording";
  mediaType: "video";
  kind: "session_recording";
  videoDurationMs?: number | null;
  mimeType: string;
  sizeBytes: number;
  capturedAt: string;
}

export interface ReserveCaptureResult {
  captureId: string;
  storagePath: string;
  uploadUrl: string;
  uploadToken: string;
  uploadHeaders: Record<string, string>;
  expiresAt: string;
}

export function reserveCapture(
  body: ReserveCaptureBody
): Promise<ReserveCaptureResult> {
  return apiFetch<ReserveCaptureResult>("/v1/captures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function finalizeCapture(
  id: string,
  body: { actualSizeBytes: number }
): Promise<{ captureId: string; analysisJobId: string | null; status: string }> {
  return apiFetch(`/v1/captures/${id}/finalize`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Soft-discard: hides the capture from the default list. Reversible server-side.
export function discardCapture(
  id: string
): Promise<{ captureId: string; discardedAt: string }> {
  return apiFetch(`/v1/captures/${id}/discard`, { method: "POST" });
}

// Re-queue analysis for a capture whose analysis failed. The image already
// exists in Storage, so this just hands the worker a fresh job; the capture
// returns to 'analysis_queued'. Only valid for 'failed' captures (409 otherwise).
export function reanalyzeCapture(
  id: string
): Promise<{ captureId: string; analysisJobId: string; status: CaptureStatus }> {
  return apiFetch(`/v1/captures/${id}/reanalyze`, { method: "POST" });
}

// Only discarded captures appear here — drives the settings cleanup view.
export function listDiscardedCaptures(): Promise<ListCapturesResponse> {
  return apiFetch<ListCapturesResponse>("/v1/captures?discarded=true");
}

// Permanent delete (row + Storage object). Requires captures.delete (manager+).
export function deleteCapture(
  id: string
): Promise<{ captureId: string; deleted: boolean }> {
  return apiFetch(`/v1/captures/${id}`, { method: "DELETE" });
}

// --- Live sessions --------------------------------------------------------

export type LiveSessionStatus = "starting" | "live" | "paused";

// One in-flight Field Capture session = one camera on the Live wall.
export interface LiveSessionSummary {
  sessionId: string;
  status: LiveSessionStatus;
  operatorUserId: string | null;
  operatorName: string;
  // Device name from the devices page; "Unknown" when the device has no name.
  deviceName: string;
  fieldName: string | null;
  farmName: string | null;
  startedAt: string;
  // Non-null while a watcher has authoritatively disconnected this camera. The
  // session stays on the wall (still "active"); the tile shows a Reconnect CTA.
  disconnectedAt: string | null;
}

export interface ListLiveSessionsResponse {
  orgId: string;
  sessions: LiveSessionSummary[];
}

export function listLiveSessions(): Promise<ListLiveSessionsResponse> {
  return apiFetch<ListLiveSessionsResponse>("/v1/capture-sessions/live");
}

// Authoritative disconnect/reconnect — signals the publishing phone to stop or
// resume sending media. Persisted on the session, so it survives reload for
// every watcher. Any watcher may run it (not just the operator).
export function setSessionConnection(
  sessionId: string,
  connected: boolean
): Promise<{ sessionId: string; action: string }> {
  return apiFetch(`/v1/capture-sessions/${sessionId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: connected ? "reconnect" : "disconnect" })
  });
}

// --- Device pairing -------------------------------------------------------

export interface CreateDevicePairingResponse {
  pairingId: string;
  code: string;
  expiresAt: string;
  orgId: string;
}

// Portal "Connect phone camera": mints a short code the operator's phone claims
// from the Field PWA. The QR encodes field.cropautonomy.com/pair?code=<code>.
export function createDevicePairing(): Promise<CreateDevicePairingResponse> {
  return apiFetch<CreateDevicePairingResponse>("/v1/device-pairings", { method: "POST" });
}

export interface DevicePairingStatus {
  pairingId: string;
  status: "pending" | "claimed" | "expired" | "cancelled";
  deviceId: string | null;
  expiresAt: string;
}

// Poll fallback while the dialog waits for the phone to claim the code (the
// realtime devicePairing channel is the primary signal).
export function getDevicePairing(pairingId: string): Promise<DevicePairingStatus> {
  return apiFetch<DevicePairingStatus>(`/v1/device-pairings/${pairingId}`);
}

// --- Devices --------------------------------------------------------------

export type DeviceFamily =
  | "gaia_r"
  | "gaia_d"
  | "gaia_s"
  | "phone"
  | "third_party"
  | "simulator";

// Operator-chosen card visual, stored in device metadata. Either one of our
// glyphs tinted with a palette color, or an uploaded image (square data URL).
export type DeviceAppearance =
  | { type: "icon"; icon: string; color: string }
  | { type: "image"; image: string };

export type DeviceStatus =
  | "unregistered"
  | "active"
  | "inactive"
  | "maintenance"
  | "retired";

// A registered device in the org's fleet. `nickname` is the operator-given label
// (stored in metadata); `displayName` is the name set at registration.
export interface Device {
  id: string;
  deviceFamily: DeviceFamily;
  serialNumber: string;
  displayName: string | null;
  nickname: string | null;
  firmwareVersion: string | null;
  status: DeviceStatus;
  // Operator-chosen card visual; null = the family default glyph.
  appearance: DeviceAppearance | null;
  // When true, the device streams live without watcher approval.
  autoLiveEnabled: boolean;
  registeredByName: string | null;
  registeredAt: string | null;
  lastSeenAt: string | null;
}

interface ListDevicesResponse {
  orgId: string;
  // Whether the current user may edit/retire/delete devices and toggle auto-live.
  canManage: boolean;
  devices: Device[];
}

// The org's device registry for the Devices grid. Retired devices are hidden
// unless includeRetired is set.
export function listDevices(
  params: { includeRetired?: boolean } = {}
): Promise<ListDevicesResponse> {
  const query = params.includeRetired ? "?includeRetired=true" : "";
  return apiFetch<ListDevicesResponse>(`/v1/devices${query}`);
}

// Rename (name + nickname) and/or change status (retire → 'retired',
// reactivate → 'active'). Returns the updated device. Requires devices.update.
export function updateDevice(
  id: string,
  body: {
    displayName?: string;
    nickname?: string | null;
    status?: DeviceStatus;
    autoLiveEnabled?: boolean;
    // null clears the override, reverting to the family default glyph.
    appearance?: DeviceAppearance | null;
  }
): Promise<Device> {
  return apiFetch<Device>(`/v1/devices/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Permanent deregister. Captures/sessions keep their (nulled) device link;
// telemetry + live requests cascade away. Requires devices.deregister.
export function deleteDevice(
  id: string
): Promise<{ deviceId: string; deleted: boolean }> {
  return apiFetch(`/v1/devices/${id}`, { method: "DELETE" });
}

// --- Live requests --------------------------------------------------------

export interface LiveRequestSummary {
  requestId: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "expired";
  deviceId: string;
  deviceName: string;
  requestedByName: string;
  requestedAt: string;
  expiresAt: string;
}

export interface ListLiveRequestsResponse {
  orgId: string;
  requests: LiveRequestSummary[];
}

// Pending go-live requests for the Live screen's request panel.
export function listLiveRequests(
  status: LiveRequestSummary["status"] = "pending"
): Promise<ListLiveRequestsResponse> {
  return apiFetch<ListLiveRequestsResponse>(`/v1/live-requests?status=${status}`);
}

// Accept → spawns a live capture_session and tells the phone to start publishing.
export function acceptLiveRequest(
  requestId: string
): Promise<{ requestId: string; sessionId: string }> {
  return apiFetch(`/v1/live-requests/${requestId}/accept`, { method: "POST" });
}

export function rejectLiveRequest(
  requestId: string
): Promise<{ requestId: string; status: string }> {
  return apiFetch(`/v1/live-requests/${requestId}/reject`, { method: "POST" });
}

// --- Identity -------------------------------------------------------------

// The signed-in caller's platform identity. The portal reads name/email/avatar
// from Clerk directly; this supplies what Clerk can't — the active org name and
// the caller's role. See services/api/src/routes/me.ts.
export interface MeResponse {
  userId: string;
  orgId: string;
  org: { id: string; name: string };
  role: { key: string; name: string };
  user: { displayName: string | null; email: string | null; avatarUrl: string | null };
}

export function getMe(): Promise<MeResponse> {
  return apiFetch<MeResponse>("/v1/me");
}

// --- Fields ---------------------------------------------------------------

interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: number[][][];
}
interface GeoJsonPoint {
  type: "Point";
  coordinates: [number, number];
}

// One org field with PostGIS geometry serialized as GeoJSON. Mirrors the
// /v1/fields response (services/api/src/routes/fields.ts). `boundary`/`centroid`
// are null when the field has no geometry recorded yet.
export interface FieldSummary {
  id: string;
  farmId: string;
  name: string;
  areaAcres: number | null;
  boundary: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
}

interface ListFieldsResponse {
  fields: FieldSummary[];
}

// The operator's org-scoped fields for the Overview map + acreage stats.
export function listFields(): Promise<ListFieldsResponse> {
  return apiFetch<ListFieldsResponse>("/v1/fields");
}
