// HTTP client for services/vision.
//
// Vision is a stateless pipeline executor: this client sends the resolved
// pipeline spec (list of stages with their model + config) inline alongside
// the image bytes. The worker is responsible for looking up the pipeline
// from public.pipelines / pipeline_stages before calling this.
//
// Error taxonomy maps vision's HTTP status codes to typed JS errors so the
// analysis handler can decide retry vs fail:
//   VisionNotConfiguredError — 503 from vision (a required stage's creds missing).
//     Retryable: yes, once config is fixed.
//   VisionUpstreamError      — 502 from vision (a stage failed transiently).
//     Retryable: yes.
//   VisionBadRequestError    — 4xx other than 503 (bad payload, unknown stage).
//     Retryable: no — needs human attention.

export type StageRole =
  | "detection"
  | "classification"
  | "refinement"
  | "filter"
  | "summary";

export interface VisionStageSpec {
  role: StageRole;
  model_name: string;
  model_version: string;
  config: Record<string, unknown>;
  enabled: boolean;
  required: boolean;
}

export interface VisionPipelineSpec {
  name: string;
  version: string;
  stages: VisionStageSpec[];
}

export interface VisionInferenceRequest {
  captureId: string;
  task: string;
  pipeline: VisionPipelineSpec;
}

export interface VisionBoundingBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

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

export type Severity = "low" | "medium" | "high";

export interface VisionDetection {
  category: string | null;
  subcategory: string | null;
  confidence: number;
  bounding_box: VisionBoundingBox | null;
  // Crop-intelligence domain. null is treated as 'plant' by the worker (the
  // historical behavior for species/object detections).
  finding_type: FindingType | null;
  severity: Severity | null;
  severity_pct: number | null;
  segmentation: Record<string, unknown> | null;
  provenance: Record<string, string>;
  payload: Record<string, unknown>;
}

export interface VisionStageReport {
  role: StageRole;
  model_name: string;
  model_version: string;
  skipped: boolean;
  skip_reason: string | null;
  duration_ms: number;
  output_metadata: Record<string, unknown>;
}

export interface VisionInferenceResponse {
  capture_id: string;
  pipeline_name: string;
  pipeline_version: string;
  task: string;
  detections: VisionDetection[];
  duration_ms: number;
  stage_reports: VisionStageReport[];
  // Outputs of the optional summary stage; null when no summary stage ran or it
  // was skipped/unconfigured. observation_type/severity are best-effort tags.
  summary: string | null;
  details: string | null;
  observation_type: string | null;
  severity: string | null;
}

export class VisionNotConfiguredError extends Error {}
export class VisionUpstreamError extends Error {}
export class VisionBadRequestError extends Error {}

export interface VisionClientOptions {
  baseUrl: string;
  timeoutMs: number;
}

export class VisionClient {
  constructor(private readonly opts: VisionClientOptions) {}

  async infer(
    request: VisionInferenceRequest,
    image: { bytes: Uint8Array; mimeType: string; filename?: string }
  ): Promise<VisionInferenceResponse> {
    const body = new FormData();
    body.append(
      "request",
      JSON.stringify({
        capture_id: request.captureId,
        task: request.task,
        pipeline: request.pipeline
      })
    );
    body.append(
      "image",
      new Blob([image.bytes], { type: image.mimeType }),
      image.filename ?? "capture"
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.opts.timeoutMs);

    let response: Response;
    try {
      response = await fetch(`${this.opts.baseUrl}/v1/inference`, {
        method: "POST",
        body,
        signal: controller.signal
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new VisionUpstreamError(`vision request failed: ${reason}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 503) {
      const detail = await safeDetail(response);
      throw new VisionNotConfiguredError(`vision 503: ${detail}`);
    }
    if (response.status === 502) {
      const detail = await safeDetail(response);
      throw new VisionUpstreamError(`vision 502: ${detail}`);
    }
    if (response.status >= 500) {
      const detail = await safeDetail(response);
      throw new VisionUpstreamError(`vision ${response.status}: ${detail}`);
    }
    if (response.status >= 400) {
      const detail = await safeDetail(response);
      throw new VisionBadRequestError(`vision ${response.status}: ${detail}`);
    }

    return (await response.json()) as VisionInferenceResponse;
  }
}

async function safeDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    return body.detail ?? response.statusText;
  } catch {
    return response.statusText;
  }
}
