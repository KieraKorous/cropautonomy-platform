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

export interface CaptureSummary {
  id: string;
  status: CaptureStatus;
  statusMessage: string | null;
  mediaType: "photo" | "burst_frame" | "video";
  capturedAt: string;
  uploadedAt: string | null;
  plantType: string | null;
  imageUrl: string | null;
  fieldId: string | null;
  sizeBytes: number | null;
  analysisJobId: string | null;
  discardedAt: string | null;
}

interface ListCapturesResponse {
  captures: CaptureSummary[];
  limit: number;
  offset: number;
}

export function listCaptures(
  params: { limit?: number; offset?: number; discarded?: boolean } = {}
): Promise<ListCapturesResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.discarded != null) search.set("discarded", String(params.discarded));
  const query = search.toString();
  return apiFetch<ListCapturesResponse>(`/v1/captures${query ? `?${query}` : ""}`);
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
