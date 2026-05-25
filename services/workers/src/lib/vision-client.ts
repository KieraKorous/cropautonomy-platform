// HTTP client for services/vision. Multipart POST of (request JSON + image blob)
// per the contract in services/vision/src/vision/main.py.
//
// Errors are typed so the analysis handler can decide retry vs fail:
//   VisionNotConfiguredError — 503 from vision (e.g. PlantNet key missing).
//     Retryable: yes, once config is fixed.
//   VisionUpstreamError      — 502 from vision (provider failed).
//     Retryable: yes, transient.
//   VisionBadRequestError    — 4xx from vision other than 503.
//     Retryable: no — the payload itself is wrong.

export interface VisionInferenceRequest {
  captureId: string;
  modelName: string;
  modelVersion: string;
  task: string;
  maxResults?: number;
}

export interface VisionDetection {
  category: string;
  subcategory: string | null;
  confidence: number;
  bounding_box: { x: number; y: number; w: number; h: number } | null;
  payload: Record<string, unknown>;
}

export interface VisionInferenceResponse {
  capture_id: string;
  model_name: string;
  model_version: string;
  task: string;
  detections: VisionDetection[];
  duration_ms: number;
  provider_metadata: Record<string, unknown>;
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
        model_name: request.modelName,
        model_version: request.modelVersion,
        task: request.task,
        max_results: request.maxResults ?? 10
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
