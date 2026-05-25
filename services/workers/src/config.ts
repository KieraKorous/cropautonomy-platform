import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1),

  // Supabase service-role access for storage + DB writes from handlers.
  // Used by @gaia/db/server and @gaia/realtime/server (both read process.env).
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // services/vision base URL inside the cluster. The analysis handler POSTs
  // /v1/inference here. No auth in v0 (cluster-internal).
  VISION_SERVICE_URL: z.string().url().default("http://localhost:8080"),
  VISION_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),

  // Storage bucket for capture originals; matches services/api lib/storage.ts.
  CAPTURES_BUCKET: z.string().default("scan-originals"),

  // Concurrency per handler.
  ANALYSIS_HANDLER_CONCURRENCY: z.coerce.number().int().positive().default(2)
});

export type WorkerConfig = z.infer<typeof schema>;

let cached: WorkerConfig | undefined;

export function loadConfig(): WorkerConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
