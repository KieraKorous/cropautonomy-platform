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
}

export interface ListLiveSessionsResponse {
  orgId: string;
  sessions: LiveSessionSummary[];
}

export function listLiveSessions(): Promise<ListLiveSessionsResponse> {
  return apiFetch<ListLiveSessionsResponse>("/v1/capture-sessions/live");
}
