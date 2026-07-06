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
  // Scientific name (PlantNet species, e.g. "Citrus sinensis"), from the top
  // detection. The common name for the same organism, when known.
  plantType: string | null;
  commonName: string | null;
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
  // Ids of the teams this capture is filed under (a capture may be on several).
  // Empty = unassigned (org-visible). Drives the detail modal's team selector.
  teamIds: string[];
}

// A finding domain — the crop-intelligence category of a detection. Superset of
// ObservationType plus 'plant' and 'soil'. Mirrors analysis_results.finding_type.
export type FindingType =
  | "plant"
  | "disease"
  | "pest"
  | "weed"
  | "nutrient"
  | "irrigation"
  | "soil"
  | "damage"
  | "growth_stage"
  | "other";

// Normalized 0..1 bounding box in image space.
export interface BoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// One per-detection finding for a capture (from analysis_results). Issue
// findings (disease/pest/…) come from the analysis pipeline's findings stage;
// 'plant' findings are the species/object detections.
export interface Finding {
  id: string;
  findingType: FindingType;
  category: string;
  subcategory: string | null;
  confidence: number;
  severity: Severity | null;
  // Measured severity: % of tissue affected (0..100), or null when N/A.
  severityPct: number | null;
  boundingBox: BoundingBox | null;
  segmentation: Record<string, unknown> | null;
  provenance: Record<string, unknown>;
  // Short model-authored reason (from the LLM findings stage), when present.
  note: string | null;
  createdAt: string;
}

// A human annotation event on a capture (the confirm loop's output).
export type AnnotationSource =
  | "human_confirmed_seed"
  | "human_corrected_seed"
  | "human_rejected_seed"
  | "human_de_novo";

export type ConfirmationLevel = "field_visual" | "expert_visual" | "lab_confirmed";

export interface Annotation {
  id: string;
  // The model finding this acts on; null for de novo / negative annotations.
  analysisResultId: string | null;
  annotatorUserId: string;
  source: AnnotationSource;
  findingType: FindingType | null;
  category: string | null;
  subcategory: string | null;
  boundingBox: BoundingBox | null;
  isNegative: boolean;
  annotatorConfidence: number | null;
  confirmationLevel: ConfirmationLevel;
  notes: string | null;
  createdAt: string;
}

// Body for creating an annotation. For confirm/reject the server backfills
// category/finding_type/bbox from the referenced result, so only source +
// analysisResultId are needed.
export interface AnnotationInput {
  source: AnnotationSource;
  analysisResultId?: string | null;
  findingType?: FindingType | null;
  category?: string | null;
  subcategory?: string | null;
  boundingBox?: BoundingBox | null;
  severity?: Severity | null;
  isNegative?: boolean;
  confirmationLevel?: ConfirmationLevel;
  annotatorConfidence?: number | null;
  notes?: string | null;
}

export interface CaptureDetailResponse {
  capture: CaptureSummary;
  // Other captures sharing the same identified plant type (newest first).
  related: CaptureSummary[];
  // Per-detection findings for this capture (issues + species/objects).
  findings: Finding[];
  // Human annotations on this capture (confirm/reject/correct/add), oldest first.
  annotations: Annotation[];
  // Whether the caller may annotate (drives the review controls).
  canAnnotate: boolean;
}

interface ListCapturesResponse {
  captures: CaptureSummary[];
  limit: number;
  offset: number;
  // Whether the caller may file captures onto teams (teams.assign, manager+).
  // Drives the detail modal's team selector. Optional so pre-change callers and
  // the detail endpoint (which omits it) stay valid.
  canAssignTeams?: boolean;
}

export function listCaptures(
  params: {
    limit?: number;
    offset?: number;
    discarded?: boolean;
    kind?: CaptureKind;
    // Narrow to captures assigned to one team (the Team filter). Access is
    // already team-scoped server-side; this only further filters the view.
    teamId?: string;
  } = {}
): Promise<ListCapturesResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set("limit", String(params.limit));
  if (params.offset != null) search.set("offset", String(params.offset));
  if (params.discarded != null) search.set("discarded", String(params.discarded));
  if (params.kind != null) search.set("kind", params.kind);
  if (params.teamId != null) search.set("teamId", params.teamId);
  const query = search.toString();
  return apiFetch<ListCapturesResponse>(`/v1/captures${query ? `?${query}` : ""}`);
}

// Session recordings (kind='session_recording') for the Recordings section.
export function listRecordings(
  params: { limit?: number; offset?: number; teamId?: string } = {}
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

// Create a human annotation on a capture (confirm / reject / correct / add).
// Appends a capture_annotations row — the human-verified label feeding the
// training corpus. Requires analysis.annotate.
export function createAnnotation(
  captureId: string,
  input: AnnotationInput
): Promise<{ annotation: Annotation }> {
  return apiFetch(`/v1/captures/${captureId}/annotations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
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

// Every discarded item — captures and recordings alike — drives the single
// settings cleanup view. Both are captures, so they share one endpoint.
export function listDiscardedCaptures(): Promise<ListCapturesResponse> {
  return apiFetch<ListCapturesResponse>("/v1/captures?discarded=true");
}

// Recover (un-discard) a capture or recording, returning it to its list.
export function recoverCapture(
  id: string
): Promise<{ captureId: string; recovered: boolean }> {
  return apiFetch(`/v1/captures/${id}/recover`, { method: "POST" });
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

export function listLiveSessions(
  params: { teamId?: string } = {}
): Promise<ListLiveSessionsResponse> {
  const query = params.teamId ? `?teamId=${params.teamId}` : "";
  return apiFetch<ListLiveSessionsResponse>(`/v1/capture-sessions/live${query}`);
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
  // Latest real activity: the most recent capture the device produced or live
  // session it drove. null if it has never been used. Distinct from lastSeenAt
  // (stamped only at pairing today). From the org_device_activity rollup.
  lastUsedAt: string | null;
  // True when the field app is capturing/streaming on the device right now (an
  // active capture session with a fresh heartbeat). Drives the Active/Inactive
  // activity status in the portal.
  live: boolean;
  // Ids of the teams this device is assigned to (a device may be on several).
  // Empty = unassigned (org-visible). Drives the detail modal's team selector.
  teamIds: string[];
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
  params: { includeRetired?: boolean; teamId?: string } = {}
): Promise<ListDevicesResponse> {
  const search = new URLSearchParams();
  if (params.includeRetired) search.set("includeRetired", "true");
  if (params.teamId != null) search.set("teamId", params.teamId);
  const query = search.toString();
  return apiFetch<ListDevicesResponse>(`/v1/devices${query ? `?${query}` : ""}`);
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
  description: string | null;
  areaAcres: number | null;
  boundary: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
  // The field's crop — free text the operator typed, null when none.
  crop: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListFieldsResponse {
  orgId: string;
  // Whether the current user may create/edit/delete fields (fields.update).
  canManage: boolean;
  fields: FieldSummary[];
}

// The fields a field create/edit form writes. The boundary is an axis-aligned
// rectangle the operator draws from length × width; `centroid` is its center and
// `areaAcres` its derived size. All three are written together (or cleared
// together with null). Every field optional on update; `name` + `farmId` are
// required on create (enforced by createField's typing).
export interface FieldWrite {
  name?: string;
  farmId?: string;
  description?: string | null;
  areaAcres?: number | null;
  centroid?: { lat: number; lng: number } | null;
  boundary?: GeoJsonPolygon | null;
  // Free-text crop; null/empty clears it.
  crop?: string | null;
}

// The operator's org-scoped fields for the Overview map + acreage stats + the
// /fields management page.
export function listFields(
  params: { teamId?: string } = {}
): Promise<ListFieldsResponse> {
  const query = params.teamId ? `?teamId=${params.teamId}` : "";
  return apiFetch<ListFieldsResponse>(`/v1/fields${query}`);
}

// Create a field under a farm. Requires fields.create (manager+).
export function createField(body: FieldWrite & { name: string; farmId: string }): Promise<FieldSummary> {
  return apiFetch<FieldSummary>("/v1/fields", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Edit any subset of a field's columns. centroid:null clears the pin;
// { lat, lng } rewrites it. Requires fields.update (manager+).
export function updateField(id: string, patch: FieldWrite): Promise<FieldSummary> {
  return apiFetch<FieldSummary>(`/v1/fields/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

// Permanent delete. 409s if the field still has captures. Requires
// fields.delete (owner only, per the current role grants).
export function deleteField(id: string): Promise<{ fieldId: string; deleted: boolean }> {
  return apiFetch(`/v1/fields/${id}`, { method: "DELETE" });
}

// --- Zones ----------------------------------------------------------------

// One zone (sub-area within a field) with its boundary serialized as GeoJSON.
// Mirrors the /v1/zones response (services/api/src/routes/zones.ts).
export interface ZoneSummary {
  id: string;
  fieldId: string;
  name: string;
  description: string | null;
  boundary: GeoJsonPolygon | null;
  createdAt: string;
  updatedAt: string;
}

interface ListZonesResponse {
  orgId: string;
  // Whether the current user may create/edit/delete zones (zones.update).
  canManage: boolean;
  zones: ZoneSummary[];
}

// The zones a create/edit form writes. `boundary` is an axis-aligned rectangle
// drawn within the parent field. `name` + `fieldId` required on create.
export interface ZoneWrite {
  fieldId?: string;
  name?: string;
  description?: string | null;
  boundary?: GeoJsonPolygon | null;
}

// The org's zones, optionally scoped to one field. Requires zones.read.
export function listZones(fieldId?: string): Promise<ListZonesResponse> {
  const qs = fieldId ? `?fieldId=${encodeURIComponent(fieldId)}` : "";
  return apiFetch<ListZonesResponse>(`/v1/zones${qs}`);
}

// Create a zone within a field. Requires zones.create (manager+).
export function createZone(body: ZoneWrite & { fieldId: string; name: string }): Promise<ZoneSummary> {
  return apiFetch<ZoneSummary>("/v1/zones", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Edit any subset of a zone's columns. Requires zones.update (manager+).
export function updateZone(id: string, patch: ZoneWrite): Promise<ZoneSummary> {
  return apiFetch<ZoneSummary>(`/v1/zones/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

// Permanent delete. Requires zones.delete (owner only, per the current grants).
export function deleteZone(id: string): Promise<{ zoneId: string; deleted: boolean }> {
  return apiFetch(`/v1/zones/${id}`, { method: "DELETE" });
}

// --- Farms ----------------------------------------------------------------

// One org farm with its location (PostGIS point → GeoJSON), plus the field
// count + total acreage aggregated server-side for the list cards. Mirrors the
// /v1/farms response (services/api/src/routes/farms.ts). `location` is null when
// no centroid has been set.
export interface FarmSummary {
  id: string;
  name: string;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  addressLocality: string | null;
  addressRegion: string | null;
  addressPostalCode: string | null;
  addressCountry: string | null;
  timezone: string | null;
  location: GeoJsonPoint | null;
  fieldCount: number;
  areaAcres: number | null;
  createdAt: string;
  updatedAt: string;
}

interface ListFarmsResponse {
  orgId: string;
  // Whether the current user may create/edit/delete farms (farms.update).
  canManage: boolean;
  farms: FarmSummary[];
}

// The fields a farm create/edit form writes. `location` is the centroid set via
// the map pin: null clears it, { lat, lng } sets it. Every field optional on
// update; `name` is required on create (enforced by createFarm's typing).
export interface FarmWrite {
  name?: string;
  description?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
  addressPostalCode?: string | null;
  addressCountry?: string | null;
  timezone?: string | null;
  location?: { lat: number; lng: number } | null;
}

// The org's farms for the /farms grid.
export function listFarms(
  params: { teamId?: string } = {}
): Promise<ListFarmsResponse> {
  const query = params.teamId ? `?teamId=${params.teamId}` : "";
  return apiFetch<ListFarmsResponse>(`/v1/farms${query}`);
}

// Create a farm. Requires farms.create (manager+).
export function createFarm(body: FarmWrite & { name: string }): Promise<FarmSummary> {
  return apiFetch<FarmSummary>("/v1/farms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// Edit any subset of a farm's fields. location:null clears the centroid;
// { lat, lng } rewrites it. Requires farms.update (manager+).
export function updateFarm(id: string, patch: FarmWrite): Promise<FarmSummary> {
  return apiFetch<FarmSummary>(`/v1/farms/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

// Permanent delete. 409s if the farm still has fields. Requires farms.delete
// (owner only, per the current role grants).
export function deleteFarm(id: string): Promise<{ farmId: string; deleted: boolean }> {
  return apiFetch(`/v1/farms/${id}`, { method: "DELETE" });
}

// --- Teams ----------------------------------------------------------------
// A sub-org access boundary. Members see/act only on their teams' entities;
// admins/owners see everything. Mirrors services/api/src/routes/teams.ts.

// The five assignable entity types (Recordings + Live are both capture_sessions).
export type TeamResourceType =
  | "farm"
  | "field"
  | "device"
  | "capture_session"
  | "capture";

export type TeamAssignmentCounts = Record<TeamResourceType, number>;

export interface TeamSummary {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  memberCount: number;
  assignmentCounts: TeamAssignmentCounts;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  addedAt: string;
}

// A team's assignments, grouped by resource type (arrays of resource ids).
export type TeamAssignments = Record<TeamResourceType, string[]>;

export interface TeamDetail {
  team: TeamSummary;
  members: TeamMember[];
  assignments: TeamAssignments;
}

interface ListTeamsResponse {
  orgId: string;
  // Whether the caller may create/edit/delete teams + manage rosters (teams.create).
  canManage: boolean;
  teams: TeamSummary[];
}

export interface TeamWrite {
  name?: string;
  description?: string | null;
  color?: string | null;
}

// An org member for the "add member" picker (services/api GET /v1/members).
export interface OrgMember {
  userId: string;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  roleKey: string | null;
  roleName: string | null;
}

interface ListMembersResponse {
  orgId: string;
  members: OrgMember[];
}

// The caller's own teams (services/api GET /v1/me/teams) — drives the Team
// filter control and the field app's capture team picker.
export interface MyTeam {
  id: string;
  name: string;
  color: string | null;
}

export function listTeams(): Promise<ListTeamsResponse> {
  return apiFetch<ListTeamsResponse>("/v1/teams");
}

export function getTeam(id: string): Promise<TeamDetail> {
  return apiFetch<TeamDetail>(`/v1/teams/${id}`);
}

export function createTeam(body: TeamWrite & { name: string }): Promise<TeamSummary> {
  return apiFetch<TeamSummary>("/v1/teams", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

export function updateTeam(id: string, patch: TeamWrite): Promise<TeamSummary> {
  return apiFetch<TeamSummary>(`/v1/teams/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export function deleteTeam(id: string): Promise<{ teamId: string; deleted: boolean }> {
  return apiFetch(`/v1/teams/${id}`, { method: "DELETE" });
}

export function addTeamMember(
  teamId: string,
  userId: string
): Promise<{ teamId: string; userId: string; added: boolean }> {
  return apiFetch(`/v1/teams/${teamId}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId })
  });
}

export function removeTeamMember(
  teamId: string,
  userId: string
): Promise<{ teamId: string; userId: string; removed: boolean }> {
  return apiFetch(`/v1/teams/${teamId}/members/${userId}`, { method: "DELETE" });
}

export interface AssignmentItem {
  resourceType: TeamResourceType;
  resourceId: string;
}

// Assign entities to a team. With cascade:'farm_descendants', each farm in the
// list also pulls in its fields, sessions, and captures. Requires teams.assign.
export function assignEntities(
  teamId: string,
  assignments: AssignmentItem[],
  cascade?: "farm_descendants"
): Promise<{ teamId: string; assigned: number }> {
  return apiFetch(`/v1/teams/${teamId}/assignments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cascade ? { assignments, cascade } : { assignments })
  });
}

export function unassignEntities(
  teamId: string,
  assignments: AssignmentItem[]
): Promise<{ teamId: string; unassigned: number }> {
  return apiFetch(`/v1/teams/${teamId}/assignments`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ assignments })
  });
}

// Active members of the caller's org (for the add-member picker).
export function listMembers(): Promise<ListMembersResponse> {
  return apiFetch<ListMembersResponse>("/v1/members");
}

// The caller's own team memberships.
export function listMyTeams(): Promise<{ teams: MyTeam[] }> {
  return apiFetch<{ teams: MyTeam[] }>("/v1/me/teams");
}
