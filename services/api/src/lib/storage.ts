// Storage layout for capture media. Server-chosen path; see
// docs/architecture/capture-pipeline.md § Storage layout.

export const CAPTURES_BUCKET = "scan-originals";

export function capturePath(orgId: string, captureId: string, extension: string) {
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  return `org/${orgId}/capture/${captureId}.${safeExt}`;
}
