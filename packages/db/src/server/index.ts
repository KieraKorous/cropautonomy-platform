// Server-side Supabase client.
//
// Wraps @supabase/supabase-js with the SERVICE ROLE key. Use only in:
//   - Next.js route handlers / server actions (portal app.cropautonomy.com)
//   - pg-boss worker code
//   - Edge / Fastify services running with the service role credential
//
// NEVER import this from browser code. The service role key bypasses RLS and
// must never reach the client. Bundlers do not stop you from importing it -
// the import path discipline is enforced by review.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.ts";

let cached: SupabaseClient<Database> | undefined;

export interface ServerClientOptions {
  url?: string;
  serviceRoleKey?: string;
}

/**
 * Get a cached service-role Supabase client. Caches per-process because the
 * client maintains an internal fetch agent; recreating it on every request is
 * wasteful and breaks connection reuse.
 */
export function getServerSupabase(options: ServerClientOptions = {}): SupabaseClient<Database> {
  if (cached) return cached;

  const url = options.url ?? process.env.SUPABASE_URL;
  const key = options.serviceRoleKey ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "@gaia/db/server: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }

  cached = createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: { "x-application-name": "cropautonomy-platform" }
    }
  });

  return cached;
}

/**
 * Reset the cached client. Useful for tests; rarely needed at runtime.
 */
export function resetServerSupabase(): void {
  cached = undefined;
}

export type { Database };
