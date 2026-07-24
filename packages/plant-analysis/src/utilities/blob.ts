// iOS Safari stores IndexedDB Blobs as opaque references into a SQLite-backed
// BlobStore; camera / MediaRecorder / File handles can be revoked by the OS,
// which surfaces later as "error preparing Blob/File data to be stored in object
// store" on put() or "Load failed" on fetch(). Materialize to a self-contained
// Blob backed by an in-memory ArrayBuffer before persisting. Same workaround as
// apps/field-web/src/lib/db.ts.
//
// Shipped in Milestone 1 even though ImageRecord blobs only arrive in Phase 4, so
// the image repository has the helper ready.

export async function detachBlob(blob: Blob): Promise<Blob> {
  const buffer = await blob.arrayBuffer();
  return new Blob([buffer], { type: blob.type });
}
