import { getDb } from "../lib/db.js";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  badRequest,
  conflict,
  forbidden,
  notFound
} from "../lib/errors.js";
import { getBoss } from "../lib/queue.js";
import { loadConfig } from "../config.js";
import { CAPTURES_BUCKET, capturePath } from "../lib/storage.js";
import { publishBestEffort } from "../lib/live.js";
import { channels } from "@gaia/realtime/channels";
import { QUEUE_NAMES } from "@gaia/workers/queues";
import {
  applyTeamFilter,
  canSeeResource,
  resolveTeamScope
} from "../lib/team-scope.js";

// Operator observation taxonomy — kept in sync with the captures.observation_type
// and captures.severity check constraints in
// packages/db/migrations/0016_capture_annotations_and_recordings.sql.
const OBSERVATION_TYPE = z.enum([
  "pest",
  "disease",
  "weed",
  "nutrient",
  "irrigation",
  "damage",
  "growth_stage",
  "other"
]);
const SEVERITY = z.enum(["low", "medium", "high"]);

const reserveSchema = z.object({
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  zoneId: z.string().uuid().nullable().optional(),
  cropTypeId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().nullable().optional(),
  // Optional team to file this capture under. The caller must be a member of it
  // (self-assignment only — gated in the handler, not by teams.assign).
  teamId: z.string().uuid().nullable().optional(),
  // The device that produced this capture (e.g. the paired phone running the
  // field app). Recorded as captures.source_device_id so capture activity —
  // including capture-only sessions, which carry no started_by_device_id — is
  // attributable to a device. See org_device_activity (migration 0022).
  deviceId: z.string().uuid().nullable().optional(),
  // The scout task this capture was collected against. Tags captures.scout_task_id
  // and advances the task open → in_progress on first capture. See 0027_scout_tasks.sql.
  scoutTaskId: z.string().uuid().nullable().optional(),
  source: z.enum([
    "field_capture_pwa",
    "bulk_upload",
    "portal_recording",
    "gaia_r",
    "gaia_d",
    "gaia_s",
    "integration"
  ]),
  mediaType: z.enum(["photo", "burst_frame", "video"]),
  // 'observation' (default) vs 'session_recording' (a saved live-feed video).
  kind: z.enum(["observation", "session_recording"]).optional(),
  burstIndex: z.number().int().nonnegative().nullable().optional(),
  videoDurationMs: z.number().int().nonnegative().nullable().optional(),
  mimeType: z.string().min(1).max(128),
  sizeBytes: z.number().int().positive().max(2 * 1024 * 1024 * 1024),
  checksumSha256: z.string().length(64).nullable().optional(),
  capturedAt: z.string().datetime({ offset: true }),
  location: z
    .object({
      lat: z.number(),
      lng: z.number(),
      accuracyMeters: z.number().optional()
    })
    .nullable()
    .optional(),
  headingDegrees: z.number().nullable().optional(),
  // Note: observation description / type / severity are NOT set here. They are
  // produced automatically by the analysis pipeline's summary stage, not
  // hand-entered at capture time.
  metadata: z.record(z.unknown()).optional()
});

const finalizeSchema = z.object({
  actualSizeBytes: z.number().int().positive(),
  actualChecksumSha256: z.string().length(64).optional(),
  thumbnailDataUrl: z.string().optional()
});

// Reviewer corrections to the AI-filled capture details. The pipeline fills
// these automatically (summary stage); this endpoint lets a reviewer override
// them. Every field optional; only provided keys are written. Empty-string
// summary clears it (stored as null); null clears the structured fields.
const updateSchema = z
  .object({
    summary: z.string().max(4000).optional(),
    details: z.string().max(8000).optional(),
    observationType: OBSERVATION_TYPE.nullable().optional(),
    severity: SEVERITY.nullable().optional()
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "At least one field must be provided."
  });

// --- Annotations (Phase 3 confirm loop) ---------------------------------------
// Finding domain — kept in sync with analysis_results.finding_type /
// capture_annotations.finding_type (migration 0024).
const FINDING_TYPE = z.enum([
  "plant",
  "disease",
  "pest",
  "weed",
  "nutrient",
  "irrigation",
  "soil",
  "damage",
  "growth_stage",
  "other"
]);
const CONFIRMATION_LEVEL = z.enum(["field_visual", "expert_visual", "lab_confirmed"]);
// The four human-annotation sources (capture_annotations.source, migration 0008).
const ANNOTATION_SOURCE = z.enum([
  "human_confirmed_seed",
  "human_corrected_seed",
  "human_rejected_seed",
  "human_de_novo"
]);
const NORM_BBOX = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().gt(0).max(1),
  h: z.number().gt(0).max(1)
});

// One human annotation event on a capture: confirm / reject / correct a model
// finding, or add one de novo. Mirrors the capture_annotations check constraints
// (has_signal, negative_shape) so bad shapes are rejected before the insert.
const annotationSchema = z
  .object({
    source: ANNOTATION_SOURCE,
    // The model finding this acts on. Required for confirm/correct/reject;
    // must be omitted for de novo.
    analysisResultId: z.string().uuid().nullable().optional(),
    findingType: FINDING_TYPE.nullable().optional(),
    category: z.string().min(1).max(200).nullable().optional(),
    subcategory: z.string().max(200).nullable().optional(),
    boundingBox: NORM_BBOX.nullable().optional(),
    severity: SEVERITY.nullable().optional(),
    // "no plants present" — a training negative. Carries no bbox or seed link.
    isNegative: z.boolean().optional().default(false),
    confirmationLevel: CONFIRMATION_LEVEL.optional().default("field_visual"),
    annotatorConfidence: z.number().min(0).max(1).nullable().optional(),
    notes: z.string().max(2000).nullable().optional()
  })
  // Seed actions reference a result; de novo must not. (When a seed action omits
  // category/bbox the server backfills them from the referenced result.)
  .refine(
    (v) =>
      v.source === "human_de_novo"
        ? v.analysisResultId == null
        : v.analysisResultId != null,
    {
      message: "confirm/reject/correct require analysisResultId; de novo must omit it.",
      path: ["analysisResultId"]
    }
  )
  // has_signal: a positive annotation needs a category (unless it copies one
  // from a referenced result); a negative needs none.
  .refine(
    (v) =>
      v.isNegative ||
      v.analysisResultId != null ||
      (v.category != null && v.category.trim().length > 0),
    { message: "category is required unless isNegative or a seed is referenced.", path: ["category"] }
  )
  // negative_shape: a negative carries no bbox and no seed link.
  .refine((v) => !v.isNegative || (v.boundingBox == null && v.analysisResultId == null), {
    message: "A negative annotation cannot carry a bounding box or analysisResultId.",
    path: ["isNegative"]
  });

const listQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(500).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
  // false (default) → only live captures; true → only discarded (settings view).
  discarded: z.coerce.boolean().default(false),
  // Optional kind filter — the portal Recordings section passes
  // kind=session_recording; the captures grid defaults to observations.
  kind: z.enum(["observation", "session_recording"]).optional(),
  // Optional team narrow (portal TeamFilter). Restricts to captures assigned to
  // this team, within the caller's already team-scoped visibility.
  teamId: z.string().uuid().optional(),
  // "my teams only" restrict (map/overview). Scopes admins to their own teams
  // instead of everything; no-op for non-admins (already scoped).
  mine: z.coerce.boolean().default(false)
});

// Statuses whose storage object exists and can be signed for viewing.
const VIEWABLE_STATUSES = new Set([
  "uploaded",
  "analysis_queued",
  "analysis_running",
  "analyzed"
]);

interface CaptureListRow {
  id: string;
  status: string;
  status_message: string | null;
  media_type: string;
  captured_at: string;
  uploaded_at: string | null;
  inferred_species: string | null;
  inferred_common_name: string | null;
  inferred_summary: string | null;
  inferred_details: string | null;
  description: string | null;
  observation_type: string | null;
  severity: string | null;
  kind: string;
  thumbnail_path: string | null;
  storage_path: string;
  size_bytes: number | null;
  video_duration_ms: number | null;
  farm_id: string | null;
  field_id: string | null;
  zone_id: string | null;
  session_id: string | null;
  analysis_job_id: string | null;
  discarded_at: string | null;
  captured_by_user_id: string | null;
  // PostgREST embeds the to-one user row (the capturer) as an object under this
  // alias, so the list can show "who captured this" without a client-side join.
  captured_by: { display_name: string | null; email: string } | null;
}

// Columns selected for the summary shape returned by the list and single-capture
// endpoints. Kept in one place so the row interface and selects stay in sync.
const CAPTURE_SELECT =
  "id, status, status_message, media_type, captured_at, uploaded_at, inferred_species, inferred_common_name, inferred_summary, inferred_details, description, observation_type, severity, kind, thumbnail_path, storage_path, size_bytes, video_duration_ms, farm_id, field_id, zone_id, session_id, analysis_job_id, discarded_at, captured_by_user_id, captured_by:users!captured_by_user_id ( display_name, email )";

// Same columns plus org_id, for the single-capture handlers that tenant-check
// before mapping. `as const` keeps it a literal so the typed client can parse it.
const CAPTURE_SELECT_WITH_ORG = `${CAPTURE_SELECT}, org_id` as const;

// Map a DB row → API summary, attaching an already-signed image URL (or null).
function toCaptureSummary(row: CaptureListRow, imageUrl: string | null) {
  return {
    id: row.id,
    status: row.status,
    statusMessage: row.status_message,
    mediaType: row.media_type,
    capturedAt: row.captured_at,
    uploadedAt: row.uploaded_at,
    plantType: row.inferred_species,
    commonName: row.inferred_common_name,
    summary: row.inferred_summary,
    details: row.inferred_details,
    description: row.description,
    observationType: row.observation_type,
    severity: row.severity,
    kind: row.kind,
    imageUrl,
    farmId: row.farm_id,
    fieldId: row.field_id,
    zoneId: row.zone_id,
    sessionId: row.session_id,
    sizeBytes: row.size_bytes,
    videoDurationMs: row.video_duration_ms,
    analysisJobId: row.analysis_job_id,
    discardedAt: row.discarded_at,
    capturedById: row.captured_by_user_id,
    // display_name → email → null, matching how sessions/devices name their users.
    capturedByName: row.captured_by?.display_name ?? row.captured_by?.email ?? null
  };
}

// Per-detection analysis results (findings) for the capture detail page. These
// were previously write-only (worker inserts, nothing read them back). See
// docs/architecture/capture-analysis-intelligence.md § Phase 2.
const FINDING_SELECT =
  "id, finding_type, category, subcategory, confidence, severity, severity_pct, bounding_box, segmentation, provenance, payload, created_at";

interface FindingRow {
  id: string;
  finding_type: string;
  category: string;
  subcategory: string | null;
  confidence: number | string;
  severity: string | null;
  severity_pct: number | string | null;
  bounding_box: { x: number; y: number; w: number; h: number } | null;
  segmentation: Record<string, unknown> | null;
  provenance: Record<string, unknown> | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

// numeric columns can arrive as strings from PostgREST; coerce to number.
const num = (v: number | string | null): number | null =>
  v == null ? null : typeof v === "number" ? v : Number(v);

function toFinding(row: FindingRow) {
  return {
    id: row.id,
    findingType: row.finding_type,
    category: row.category,
    subcategory: row.subcategory,
    confidence: num(row.confidence) ?? 0,
    severity: row.severity,
    severityPct: num(row.severity_pct),
    boundingBox: row.bounding_box,
    segmentation: row.segmentation ?? null,
    provenance: row.provenance ?? {},
    // Short reason emitted by the LLM findings stage (rides in payload.note).
    note: typeof row.payload?.note === "string" ? row.payload.note : null,
    createdAt: row.created_at
  };
}

// Human annotations on a capture (the confirm loop's durable output).
const ANNOTATION_SELECT =
  "id, analysis_result_id, annotator_user_id, source, finding_type, category, subcategory, bounding_box, is_negative, annotator_confidence, confirmation_level, notes, created_at";

interface AnnotationRow {
  id: string;
  analysis_result_id: string | null;
  annotator_user_id: string;
  source: string;
  finding_type: string | null;
  category: string | null;
  subcategory: string | null;
  bounding_box: { x: number; y: number; w: number; h: number } | null;
  is_negative: boolean;
  annotator_confidence: number | string | null;
  confirmation_level: string;
  notes: string | null;
  created_at: string;
}

function toAnnotation(row: AnnotationRow) {
  return {
    id: row.id,
    analysisResultId: row.analysis_result_id,
    annotatorUserId: row.annotator_user_id,
    source: row.source,
    findingType: row.finding_type,
    category: row.category,
    subcategory: row.subcategory,
    boundingBox: row.bounding_box,
    isNegative: row.is_negative,
    annotatorConfidence: num(row.annotator_confidence),
    confirmationLevel: row.confirmation_level,
    notes: row.notes,
    createdAt: row.created_at
  };
}

const mimeToExt: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm"
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

// A storage_path is real once finalize has run; "pending" is the placeholder
// written at reservation time before the object exists.
const isRealPath = (path: string | null): path is string =>
  !!path && path !== "pending";

// Team ids grouped by capture id, for attaching to capture summaries so the
// detail modal can show + edit which teams a capture belongs to.
async function loadTeamIdsByResource(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  type: string,
  ids: string[]
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase
    .from("team_assignments")
    .select("resource_id, team_id")
    .eq("org_id", orgId)
    .eq("resource_type", type)
    .in("resource_id", ids);
  if (error) throw error;
  for (const r of (data ?? []) as Array<{ resource_id: string; team_id: string }>) {
    const list = map.get(r.resource_id) ?? [];
    list.push(r.team_id);
    map.set(r.resource_id, list);
  }
  return map;
}

// Resolved farm/field/zone names for a batch of captures, so the portal capture
// detail + list modal can show where a capture came from without a client-side
// join against the fields/farms lists. Ids not in the caller's org resolve to
// undefined (defensive — cross-tenant ids never reach here).
interface CaptureContextNames {
  farmNames: Map<string, string>;
  fieldNames: Map<string, string>;
  zoneNames: Map<string, string>;
}

async function loadContextNames(
  supabase: ReturnType<typeof getDb>,
  orgId: string,
  rows: Array<{ farm_id: string | null; field_id: string | null; zone_id: string | null }>
): Promise<CaptureContextNames> {
  const uniq = (vals: Array<string | null>) =>
    [...new Set(vals.filter((v): v is string => !!v))];
  const farmIds = uniq(rows.map((r) => r.farm_id));
  const fieldIds = uniq(rows.map((r) => r.field_id));
  const zoneIds = uniq(rows.map((r) => r.zone_id));

  const nameMap = async (table: string, ids: string[]): Promise<Map<string, string>> => {
    const map = new Map<string, string>();
    if (ids.length === 0) return map;
    const { data, error } = await supabase
      .from(table)
      .select("id, name")
      .eq("org_id", orgId)
      .in("id", ids);
    if (error) throw error;
    for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
      map.set(r.id, r.name);
    }
    return map;
  };

  const [farmNames, fieldNames, zoneNames] = await Promise.all([
    nameMap("farms", farmIds),
    nameMap("fields", fieldIds),
    nameMap("zones", zoneIds)
  ]);
  return { farmNames, fieldNames, zoneNames };
}

// Attach resolved farm/field/zone names to a capture summary shape.
function withContextNames<T extends { farmId: string | null; fieldId: string | null; zoneId: string | null }>(
  summary: T,
  names: CaptureContextNames
): T & { farmName: string | null; fieldName: string | null; zoneName: string | null } {
  return {
    ...summary,
    farmName: summary.farmId ? names.farmNames.get(summary.farmId) ?? null : null,
    fieldName: summary.fieldId ? names.fieldNames.get(summary.fieldId) ?? null : null,
    zoneName: summary.zoneId ? names.zoneNames.get(summary.zoneId) ?? null : null
  };
}

const capturesRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    "/v1/captures",
    { preHandler: app.requireAuth("captures.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("captures.invalid_query", "Invalid capture list query.", {
          issues: parsed.error.issues
        });
      }
      const { limit, offset, discarded, kind, teamId, mine } = parsed.data;
      const supabase = getDb();

      let query = supabase
        .from("captures")
        .select(CAPTURE_SELECT)
        .eq("org_id", caller.orgId);
      query = discarded
        ? query.not("discarded_at", "is", null)
        : query.is("discarded_at", null);
      if (kind) query = query.eq("kind", kind);

      // Team access boundary (+ optional ?teamId= narrow). No-op for admins
      // unless ?mine=true (map "my teams only" restrict).
      const scope = await resolveTeamScope(
        supabase,
        request.permissions!,
        { userId: caller.userId, orgId: caller.orgId },
        { forceOwnTeams: mine }
      );
      query = (
        await applyTeamFilter(query, supabase, caller.orgId, "capture", scope, {
          teamId
        })
      ).query;

      const { data, error } = await query
        .order("captured_at", { ascending: false })
        .range(offset, offset + limit - 1);
      if (error) throw error;

      // Cast through unknown: the embedded `captured_by` is a to-one object at
      // runtime, but PostgREST's generated types widen it to an array.
      const rows = (data ?? []) as unknown as CaptureListRow[];

      // Batch-sign the viewable objects in one round-trip. Prefer the thumbnail
      // when present; fall back to the original. Rows still pending upload have
      // no real object yet and get a null imageUrl.
      const pathByRow = new Map<string, string>();
      for (const row of rows) {
        if (!VIEWABLE_STATUSES.has(row.status)) continue;
        const path = row.thumbnail_path ?? row.storage_path;
        if (!path || path === "pending") continue;
        pathByRow.set(row.id, path);
      }

      const signedByPath = new Map<string, string>();
      const uniquePaths = [...new Set(pathByRow.values())];
      if (uniquePaths.length > 0) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(CAPTURES_BUCKET)
          .createSignedUrls(uniquePaths, 60 * 60);
        if (signErr) throw signErr;
        for (const item of signed ?? []) {
          if (item.signedUrl && !item.error && item.path) {
            signedByPath.set(item.path, item.signedUrl);
          }
        }
      }

      // Team assignments for these captures (drives the detail modal's team
      // selector) + whether the caller may edit them (teams.assign, manager+).
      const teamsByCapture = await loadTeamIdsByResource(
        supabase,
        caller.orgId,
        "capture",
        rows.map((r) => r.id)
      );
      const canAssignTeams = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "teams.assign"
      );

      // Resolve farm/field/zone names so the captures grid + detail modal can show
      // where each capture came from.
      const names = await loadContextNames(supabase, caller.orgId, rows);

      return {
        captures: rows.map((row) => {
          const path = pathByRow.get(row.id);
          return {
            ...withContextNames(
              toCaptureSummary(row, path ? (signedByPath.get(path) ?? null) : null),
              names
            ),
            teamIds: teamsByCapture.get(row.id) ?? []
          };
        }),
        limit,
        offset,
        canAssignTeams
      };
    }
  );

  // Single capture detail for the portal's /captures/{id} page. Returns the
  // capture with a signed full-size image (not the thumbnail) plus a `related`
  // list of other captures sharing the same identified species — drives the
  // detail page's same-plant bottom bar. Org-scoped; 404 across tenants.
  app.get<{ Params: { id: string }; Querystring: { relatedLimit?: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select(CAPTURE_SELECT_WITH_ORG)
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      const capture = row as unknown as CaptureListRow & { org_id: string };

      // Team access boundary: a capture on a team the caller isn't on is 404,
      // same as cross-tenant. No-op for admins.
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      if (!(await canSeeResource(supabase, caller.orgId, "capture", id, scope))) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      // Same-species siblings (excluding self). Only fetch when this capture has
      // an identified species; otherwise there's nothing to relate it to.
      const relatedLimit = Math.min(
        Math.max(Number(request.query.relatedLimit ?? 12) || 12, 1),
        50
      );
      let relatedRows: CaptureListRow[] = [];
      if (capture.inferred_species) {
        let relQuery = supabase
          .from("captures")
          .select(CAPTURE_SELECT)
          .eq("org_id", caller.orgId)
          .eq("inferred_species", capture.inferred_species)
          .neq("id", id)
          .is("discarded_at", null);
        // Related siblings honor the same team boundary as the list.
        relQuery = (
          await applyTeamFilter(relQuery, supabase, caller.orgId, "capture", scope)
        ).query;
        const { data: rel, error: relErr } = await relQuery
          .order("captured_at", { ascending: false })
          .limit(relatedLimit);
        if (relErr) throw relErr;
        relatedRows = (rel ?? []) as unknown as CaptureListRow[];
      }

      // Sign the detail image (full-size original) and the related thumbnails in
      // one batch. The detail image prefers the original; related prefer thumbs.
      const pathByRow = new Map<string, string>();
      if (VIEWABLE_STATUSES.has(capture.status) && isRealPath(capture.storage_path)) {
        pathByRow.set(capture.id, capture.storage_path);
      }
      for (const rel of relatedRows) {
        if (!VIEWABLE_STATUSES.has(rel.status)) continue;
        const path = rel.thumbnail_path ?? rel.storage_path;
        if (!isRealPath(path)) continue;
        pathByRow.set(rel.id, path);
      }

      const signedByPath = new Map<string, string>();
      const uniquePaths = [...new Set(pathByRow.values())];
      if (uniquePaths.length > 0) {
        const { data: signed, error: signErr } = await supabase.storage
          .from(CAPTURES_BUCKET)
          .createSignedUrls(uniquePaths, 60 * 60);
        if (signErr) throw signErr;
        for (const item of signed ?? []) {
          if (item.signedUrl && !item.error && item.path) {
            signedByPath.set(item.path, item.signedUrl);
          }
        }
      }

      const sign = (rowId: string): string | null => {
        const path = pathByRow.get(rowId);
        return path ? (signedByPath.get(path) ?? null) : null;
      };

      // Per-detection findings for this capture (issues + species/objects), most
      // relevant first. Org scoping is transitive: we already verified the
      // capture belongs to the caller's org above.
      const { data: findingData, error: findingsErr } = await supabase
        .from("analysis_results")
        .select(FINDING_SELECT)
        .eq("capture_id", id)
        .order("finding_type", { ascending: true })
        .order("confidence", { ascending: false });
      if (findingsErr) throw findingsErr;
      const findings = ((findingData ?? []) as FindingRow[]).map(toFinding);

      // Human annotations on this capture (confirm/reject/correct/add), oldest
      // first so the UI can show the latest state per finding.
      const { data: annotationData, error: annotationsErr } = await supabase
        .from("capture_annotations")
        .select(ANNOTATION_SELECT)
        .eq("capture_id", id)
        .order("created_at", { ascending: true });
      if (annotationsErr) throw annotationsErr;
      const annotations = ((annotationData ?? []) as AnnotationRow[]).map(toAnnotation);

      // Whether this caller may confirm/correct/reject/add (drives the review UI).
      const canAnnotate = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "analysis.annotate"
      );

      // Team assignments for this capture + its related siblings, so their
      // summaries carry teamIds like the list endpoint does.
      const teamsByCapture = await loadTeamIdsByResource(
        supabase,
        caller.orgId,
        "capture",
        [capture.id, ...relatedRows.map((r) => r.id)]
      );

      // Resolve this capture's farm/field/zone names for the detail metadata block.
      const names = await loadContextNames(supabase, caller.orgId, [capture]);

      return {
        capture: {
          ...withContextNames(toCaptureSummary(capture, sign(capture.id)), names),
          teamIds: teamsByCapture.get(capture.id) ?? []
        },
        related: relatedRows.map((rel) => ({
          ...toCaptureSummary(rel, sign(rel.id)),
          teamIds: teamsByCapture.get(rel.id) ?? []
        })),
        findings,
        annotations,
        canAnnotate
      };
    }
  );

  // Create a human annotation on a capture: confirm / reject / correct a model
  // finding, or add one de novo. This is the confirm loop that builds the
  // labeled corpus. Append-only — each action is a new capture_annotations row,
  // so inter-annotator disagreement is preserved. Requires analysis.annotate.
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/annotations",
    { preHandler: app.requireAuth("analysis.annotate") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const parsed = annotationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("annotations.invalid_input", "Invalid annotation body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      // Capture must exist in the caller's org.
      const { data: capRow, error: capErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (capErr) throw capErr;
      if (!capRow || (capRow as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      // Seed actions reference a result that must belong to this capture. Copy
      // its category / finding_type / bbox when the client omits them, so a
      // confirm or reject needs only the analysisResultId.
      let category = body.category ?? null;
      let findingType: string | null = body.findingType ?? null;
      let boundingBox = body.boundingBox ?? null;
      if (body.analysisResultId) {
        const { data: ar, error: arErr } = await supabase
          .from("analysis_results")
          .select("id, category, finding_type, bounding_box")
          .eq("id", body.analysisResultId)
          .eq("capture_id", id)
          .maybeSingle();
        if (arErr) throw arErr;
        if (!ar) {
          throw badRequest(
            "annotations.result_not_found",
            "analysisResultId does not belong to this capture."
          );
        }
        const seed = ar as {
          category: string | null;
          finding_type: string | null;
          bounding_box: { x: number; y: number; w: number; h: number } | null;
        };
        if (category == null) category = seed.category;
        if (findingType == null) findingType = seed.finding_type;
        if (boundingBox == null) boundingBox = seed.bounding_box;
      }

      if (!body.isNegative && (category == null || category.trim().length === 0)) {
        throw badRequest("annotations.missing_category", "A category is required.");
      }

      const payload: Record<string, unknown> = {};
      if (body.severity) payload.severity = body.severity;

      const { data: inserted, error: insErr } = await supabase
        .from("capture_annotations")
        .insert({
          org_id: caller.orgId,
          capture_id: id,
          analysis_result_id: body.analysisResultId ?? null,
          annotator_user_id: caller.userId,
          source: body.source,
          finding_type: findingType,
          category: body.isNegative ? null : category,
          subcategory: body.subcategory ?? null,
          bounding_box: boundingBox,
          is_negative: body.isNegative,
          annotator_confidence: body.annotatorConfidence ?? null,
          confirmation_level: body.confirmationLevel,
          notes: body.notes ?? null,
          payload
        })
        .select(ANNOTATION_SELECT)
        .single();
      if (insErr) throw insErr;

      return { annotation: toAnnotation(inserted as AnnotationRow) };
    }
  );

  // Reviewer corrections to the AI-filled capture details (brief summary,
  // observation type, severity). Org-scoped; requires captures.update.
  app.patch<{ Params: { id: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid capture update body.", {
          issues: parsed.error.issues
        });
      }
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      // Only write the keys the caller supplied. Empty-string summary clears it;
      // null clears the structured fields. These overwrite the AI-filled values.
      const patch: Record<string, string | null> = {};
      if (parsed.data.summary !== undefined) {
        patch.inferred_summary = parsed.data.summary.trim() || null;
      }
      if (parsed.data.details !== undefined) {
        patch.inferred_details = parsed.data.details.trim() || null;
      }
      if (parsed.data.observationType !== undefined) {
        patch.observation_type = parsed.data.observationType ?? null;
      }
      if (parsed.data.severity !== undefined) {
        patch.severity = parsed.data.severity ?? null;
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update(patch)
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, ...patch };
    }
  );

  app.post(
    "/v1/captures",
    { preHandler: app.requireAuth("captures.create") },
    async (request, reply) => {
      const caller = request.auth!;
      const parsed = reserveSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid capture reservation body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      await validateOrgScoped(caller.orgId, body);

      // A capture may only be self-filed under a team the operator belongs to.
      if (body.teamId) {
        const { data: mem, error: memErr } = await supabase
          .from("team_memberships")
          .select("team_id")
          .eq("org_id", caller.orgId)
          .eq("team_id", body.teamId)
          .eq("user_id", caller.userId)
          .maybeSingle();
        if (memErr) throw memErr;
        if (!mem) {
          throw forbidden(
            "captures.not_team_member",
            "You can only file a capture under a team you belong to."
          );
        }
      }

      const extension =
        mimeToExt[body.mimeType.toLowerCase()] ??
        body.mimeType.split("/")[1]?.toLowerCase() ??
        "bin";

      const { data: capture, error: insertErr } = await supabase
        .from("captures")
        .insert({
          org_id: caller.orgId,
          farm_id: body.farmId ?? null,
          field_id: body.fieldId ?? null,
          zone_id: body.zoneId ?? null,
          crop_type_id: body.cropTypeId ?? null,
          session_id: body.sessionId ?? null,
          source_device_id: body.deviceId ?? null,
          scout_task_id: body.scoutTaskId ?? null,
          source: body.source,
          kind: body.kind ?? "observation",
          captured_by_user_id: caller.userId,
          media_type: body.mediaType,
          burst_index: body.burstIndex ?? null,
          video_duration_ms: body.videoDurationMs ?? null,
          mime_type: body.mimeType,
          size_bytes: body.sizeBytes,
          checksum_sha256: body.checksumSha256 ?? null,
          storage_bucket: CAPTURES_BUCKET,
          storage_path: "pending",
          captured_at: body.capturedAt,
          location: body.location
            ? `SRID=4326;POINT(${body.location.lng} ${body.location.lat})`
            : null,
          gps_accuracy_meters: body.location?.accuracyMeters ?? null,
          heading_degrees: body.headingDegrees ?? null,
          status: "pending_upload",
          metadata: body.metadata ?? {}
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      const captureId = (capture as { id: string }).id;
      const path = capturePath(caller.orgId, captureId, extension);

      const { error: pathErr } = await supabase
        .from("captures")
        .update({ storage_path: path })
        .eq("id", captureId);
      if (pathErr) throw pathErr;

      // First capture against a scout task advances it open → in_progress. Only
      // touches 'open' tasks (never resurrects a done task); best-effort — a
      // failure here must not fail the reservation the client is waiting on.
      if (body.scoutTaskId) {
        const { data: advanced, error: advErr } = await supabase
          .from("scout_tasks")
          .update({ status: "in_progress" })
          .eq("id", body.scoutTaskId)
          .eq("org_id", caller.orgId)
          .eq("status", "open")
          .select("id")
          .maybeSingle();
        if (advErr) {
          request.log.warn({ err: advErr, scoutTaskId: body.scoutTaskId }, "scout task advance failed (non-fatal)");
        } else if (advanced) {
          await publishBestEffort(request.log, channels.orgScoutTasks(caller.orgId), {
            type: "scout.task.changed",
            version: 1,
            payload: {
              taskId: body.scoutTaskId,
              orgId: caller.orgId,
              status: "in_progress",
              changeType: "status_changed"
            }
          });
        }
      }

      // File under the chosen team (membership already verified above).
      if (body.teamId) {
        const { error: assignErr } = await supabase
          .from("team_assignments")
          .upsert(
            {
              team_id: body.teamId,
              org_id: caller.orgId,
              resource_type: "capture",
              resource_id: captureId,
              assigned_by_user_id: caller.userId
            },
            { onConflict: "team_id,resource_type,resource_id", ignoreDuplicates: true }
          );
        if (assignErr) throw assignErr;
        await publishBestEffort(request.log, channels.orgTeams(caller.orgId), {
          type: "team.assignment.changed",
          version: 1,
          payload: {
            orgId: caller.orgId,
            teamId: body.teamId,
            resourceType: "capture",
            resourceId: captureId,
            changeType: "assigned"
          }
        });
      }

      const { data: signed, error: signErr } = await supabase.storage
        .from(CAPTURES_BUCKET)
        .createSignedUploadUrl(path);
      if (signErr) throw signErr;

      const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      reply.status(201);
      return {
        captureId,
        storagePath: path,
        uploadUrl: signed.signedUrl,
        uploadToken: signed.token,
        uploadMethod: "put" as const,
        uploadHeaders: { "content-type": body.mimeType, "x-upsert": "false" },
        expiresAt
      };
    }
  );

  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/finalize",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const parsed = finalizeSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("captures.invalid_input", "Invalid finalize body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      const { data: captureRow, error: loadErr } = await supabase
        .from("captures")
        .select(
          "id, org_id, storage_path, storage_bucket, status, mime_type, media_type, kind, captured_at, session_id, captured_by_user_id"
        )
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!captureRow) throw notFound("captures.not_found", "Capture not found.");

      const capture = captureRow as {
        id: string;
        org_id: string;
        storage_path: string;
        storage_bucket: string;
        status: string;
        mime_type: string;
        media_type: string;
        kind: string;
        captured_at: string;
        session_id: string | null;
        captured_by_user_id: string;
      };

      if (capture.org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      if (capture.captured_by_user_id !== caller.userId) {
        throw forbidden(
          "captures.not_operator",
          "Capture belongs to a different operator."
        );
      }
      if (capture.status !== "pending_upload" && capture.status !== "uploading") {
        throw conflict(
          "captures.invalid_transition",
          `Capture cannot be finalized in status '${capture.status}'.`
        );
      }

      const folder = capture.storage_path.split("/").slice(0, -1).join("/");
      const filename = capture.storage_path.split("/").pop();
      const { data: listing, error: listErr } = await supabase.storage
        .from(capture.storage_bucket)
        .list(folder, { search: filename ?? undefined });
      if (listErr) throw listErr;
      const stored = listing?.find((item) => item.name === filename);
      if (!stored) {
        throw conflict(
          "captures.storage_missing",
          "Storage object not found at the expected path."
        );
      }
      const storedSize = (stored.metadata as { size?: number } | null)?.size ?? 0;
      if (storedSize !== body.actualSizeBytes) {
        throw conflict(
          "captures.size_mismatch",
          `Storage size mismatch (expected ${body.actualSizeBytes}, found ${storedSize}).`
        );
      }

      let thumbnailPath: string | null = null;
      if (body.thumbnailDataUrl) {
        thumbnailPath = await uploadThumbnail(
          capture.storage_bucket,
          capture.storage_path,
          body.thumbnailDataUrl
        );
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update({
          status: "uploaded",
          uploaded_at: new Date().toISOString(),
          size_bytes: body.actualSizeBytes,
          checksum_sha256: body.actualChecksumSha256 ?? null,
          thumbnail_path: thumbnailPath
        })
        .eq("id", id);
      if (updateErr) throw updateErr;

      // Session recordings (video) get a whole-clip description via the
      // 'video_summary' task (default-video@v1 samples frames + asks Claude).
      // Other videos have no analysis path yet and are stored raw.
      const isRecording =
        capture.media_type === "video" && capture.kind === "session_recording";
      if (capture.media_type === "video" && !isRecording) {
        return {
          captureId: id,
          analysisJobId: null,
          status: "uploaded",
          thumbnailPath
        };
      }
      const analysisTask = isRecording ? "video_summary" : "plant_classification";

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .insert({
          org_id: caller.orgId,
          capture_id: id,
          status: "queued"
        })
        .select("id")
        .single();
      if (jobErr) throw jobErr;

      const jobId = (job as { id: string }).id;

      const { error: linkErr } = await supabase
        .from("captures")
        .update({
          analysis_job_id: jobId,
          status: "analysis_queued"
        })
        .eq("id", id);
      if (linkErr) throw linkErr;

      // Announce the new capture on the org-wide feed so open list views (the
      // captures page) pick it up live, without waiting for a refresh.
      await publishBestEffort(request.log, channels.orgCaptures(caller.orgId), {
        type: "capture.changed",
        version: 1,
        payload: {
          captureId: id,
          orgId: caller.orgId,
          status: "analysis_queued",
          changeType: "created"
        }
      });

      // Enqueue the analysis job. The DB row is already 'queued'; this hands
      // off to the worker, which transitions to 'running' when picked up.
      // pg-boss send is idempotent on its own job id; the DB analysis_jobs row
      // is the durable record. A send failure here means the worker won't run
      // unless we re-queue; surface as 500 so the client retries finalize.
      try {
        const boss = await getBoss({ connectionString: loadConfig().DATABASE_URL });
        await boss.send(QUEUE_NAMES.scanAnalysisRequested, {
          captureId: id,
          analysisJobId: jobId,
          orgId: caller.orgId,
          task: analysisTask
        });
      } catch (queueErr) {
        request.log.error(
          { err: queueErr, captureId: id, analysisJobId: jobId },
          "failed to enqueue scan.analysis.requested"
        );
        throw queueErr;
      }

      return {
        captureId: id,
        analysisJobId: jobId,
        status: "analysis_queued",
        thumbnailPath
      };
    }
  );

  // Soft discard — hides the capture from the default list without deleting the
  // row or its Storage object. Reversible (clear discarded_at). Idempotent.
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/discard",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      const discardedAt = new Date().toISOString();
      const { error: updateErr } = await supabase
        .from("captures")
        .update({ discarded_at: discardedAt })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, discardedAt };
    }
  );

  // Recover — reverses a discard by clearing discarded_at, returning the capture
  // to the default list. Idempotent (recovering a live capture is a no-op).
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/recover",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }

      const { error: updateErr } = await supabase
        .from("captures")
        .update({ discarded_at: null })
        .eq("id", id);
      if (updateErr) throw updateErr;

      return { captureId: id, recovered: true };
    }
  );

  // Re-queue analysis for a capture whose analysis previously failed. The
  // Storage object already exists, so this just inserts a fresh analysis_jobs
  // row, points the capture back at it, and re-enqueues the worker — the same
  // tail as finalize. Only 'failed' captures are retryable (the active-job
  // unique index in 0004 forbids re-queuing one that's still in flight).
  app.post<{ Params: { id: string } }>(
    "/v1/captures/:id/reanalyze",
    { preHandler: app.requireAuth("captures.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id, status, media_type, kind")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      const reanalyzeRow = row as {
        status: string;
        media_type: string;
        kind: string;
      };
      if (reanalyzeRow.status !== "failed") {
        throw conflict(
          "captures.invalid_transition",
          `Only failed captures can be re-analyzed (status '${reanalyzeRow.status}').`
        );
      }
      // Route recordings to the video pipeline, everything else to plants.
      const reanalyzeTask =
        reanalyzeRow.media_type === "video" && reanalyzeRow.kind === "session_recording"
          ? "video_summary"
          : "plant_classification";

      const { data: job, error: jobErr } = await supabase
        .from("analysis_jobs")
        .insert({ org_id: caller.orgId, capture_id: id, status: "queued" })
        .select("id")
        .single();
      if (jobErr) throw jobErr;
      const jobId = (job as { id: string }).id;

      const { error: linkErr } = await supabase
        .from("captures")
        .update({
          analysis_job_id: jobId,
          status: "analysis_queued",
          status_message: null
        })
        .eq("id", id);
      if (linkErr) throw linkErr;

      try {
        const boss = await getBoss({ connectionString: loadConfig().DATABASE_URL });
        await boss.send(QUEUE_NAMES.scanAnalysisRequested, {
          captureId: id,
          analysisJobId: jobId,
          orgId: caller.orgId,
          task: reanalyzeTask
        });
      } catch (queueErr) {
        request.log.error(
          { err: queueErr, captureId: id, analysisJobId: jobId },
          "failed to enqueue scan.analysis.requested (reanalyze)"
        );
        throw queueErr;
      }

      // Reflect the re-queue on the org-wide feed so list views update the row's
      // status back to analyzing without a refresh.
      await publishBestEffort(request.log, channels.orgCaptures(caller.orgId), {
        type: "capture.changed",
        version: 1,
        payload: {
          captureId: id,
          orgId: caller.orgId,
          status: "analysis_queued",
          changeType: "analyzing"
        }
      });

      return { captureId: id, analysisJobId: jobId, status: "analysis_queued" };
    }
  );

  // Permanent delete — removes the Storage object(s) and the capture row. Only
  // discarded captures are purgeable. analysis_jobs / analysis_results cascade
  // on the captures FK (0004). Requires captures.delete (manager and up).
  app.delete<{ Params: { id: string } }>(
    "/v1/captures/:id",
    { preHandler: app.requireAuth("captures.delete") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("captures.invalid_id", "Invalid capture id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data: row, error: loadErr } = await supabase
        .from("captures")
        .select("id, org_id, storage_bucket, storage_path, thumbnail_path, discarded_at")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!row || (row as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("captures.not_found", "Capture not found.");
      }
      const capture = row as {
        storage_bucket: string;
        storage_path: string;
        thumbnail_path: string | null;
        discarded_at: string | null;
      };
      if (!capture.discarded_at) {
        throw conflict(
          "captures.not_discarded",
          "Only discarded captures can be permanently deleted."
        );
      }

      // Remove Storage objects first. Skip the "pending" placeholder path of
      // captures that never finished uploading.
      const paths: string[] = [];
      if (capture.storage_path && capture.storage_path !== "pending") {
        paths.push(capture.storage_path);
      }
      if (capture.thumbnail_path) paths.push(capture.thumbnail_path);
      if (paths.length > 0) {
        const { error: removeErr } = await supabase.storage
          .from(capture.storage_bucket)
          .remove(paths);
        if (removeErr) throw removeErr;
      }

      const { error: deleteErr } = await supabase
        .from("captures")
        .delete()
        .eq("id", id);
      if (deleteErr) throw deleteErr;

      return { captureId: id, deleted: true };
    }
  );
};

async function validateOrgScoped(
  orgId: string,
  body: z.infer<typeof reserveSchema>
) {
  const checks: Array<{ table: string; id: string; label: string }> = [];
  if (body.farmId) checks.push({ table: "farms", id: body.farmId, label: "farm" });
  if (body.fieldId) checks.push({ table: "fields", id: body.fieldId, label: "field" });
  if (body.zoneId) checks.push({ table: "zones", id: body.zoneId, label: "zone" });
  if (body.cropTypeId)
    checks.push({ table: "crop_types", id: body.cropTypeId, label: "crop type" });
  if (body.sessionId)
    checks.push({
      table: "capture_sessions",
      id: body.sessionId,
      label: "capture session"
    });
  if (body.deviceId)
    checks.push({ table: "devices", id: body.deviceId, label: "device" });
  if (body.scoutTaskId)
    checks.push({ table: "scout_tasks", id: body.scoutTaskId, label: "scout task" });
  if (checks.length === 0) return;

  const supabase = getDb();
  for (const check of checks) {
    const { data, error } = await supabase
      .from(check.table)
      .select("id")
      .eq("id", check.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      throw notFound(
        "references.not_found",
        `Referenced ${check.label} does not exist in this organization.`
      );
    }
  }
}

async function uploadThumbnail(
  bucket: string,
  originalPath: string,
  dataUrl: string
): Promise<string> {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    throw badRequest("captures.invalid_thumbnail", "Invalid thumbnail data URL.");
  }
  const [, contentType, base64] = match;
  const bytes = Buffer.from(base64, "base64");
  const thumbPath = originalPath.replace(/\.[^.]+$/, "") + "_thumb.jpg";
  const supabase = getDb();
  const { error } = await supabase.storage
    .from(bucket)
    .upload(thumbPath, bytes, { contentType, upsert: true });
  if (error) throw error;
  return thumbPath;
}

export default capturesRoutes;
