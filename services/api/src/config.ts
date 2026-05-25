import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8080),
  HOST: z.string().default("0.0.0.0"),

  CORS_ORIGINS: z
    .string()
    .default(
      "http://localhost:3000,http://localhost:3001,http://localhost:3002,http://localhost:5173"
    )
    .transform((s) => s.split(",").map((o) => o.trim()).filter(Boolean)),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_LEADS_TABLE: z.string().default("public_leads"),

  // Postgres connection string for pg-boss. Same DB as Supabase; pg-boss
  // uses its own schema. See docs/architecture/queueing-email-analytics.md
  // for the same-DB-as-Supabase rationale.
  DATABASE_URL: z.string().min(1),

  RESEND_API_KEY: z.string().min(1),
  LEADS_NOTIFY_TO: z.string().email(),
  LEADS_NOTIFY_FROM: z.string().min(1),

  CLERK_SECRET_KEY: z.string().min(1),
  CLERK_PUBLISHABLE_KEY: z.string().min(1),
  CLERK_FRONTEND_API_DOMAIN: z.string().optional(),

  BUILD_COMMIT: z.string().default("dev"),
  BUILD_TIME: z.string().default(() => new Date().toISOString()),
  BUILD_VERSION: z.string().default("0.1.0")
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function loadConfig(): Config {
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

export function resetConfig(): void {
  cached = undefined;
}
