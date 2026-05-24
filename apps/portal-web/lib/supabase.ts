import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

// Service-role client for portal route handlers. Bypasses RLS — never expose
// to the browser. Reads from process.env at first call.
export function getServiceSupabase(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for portal API routes."
    );
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export const CAPTURES_BUCKET = "scan-originals";

export function capturePath(orgId: string, captureId: string, extension: string) {
  // Server-chosen path — see docs/architecture/capture-pipeline.md § Storage layout.
  const safeExt = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "bin";
  return `org/${orgId}/capture/${captureId}.${safeExt}`;
}
