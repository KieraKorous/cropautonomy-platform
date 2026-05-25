import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";

export interface CorsPluginOptions {
  config: Config;
}

// In dev, allow any localhost / *.localhost / *.lvh.me origin on any port.
// lvh.me resolves to 127.0.0.1 and supports subdomain cookies, which is how
// the cross-subdomain Clerk session is exercised locally
// (field.lvh.me <-> app.lvh.me share .lvh.me-scoped cookies).
// In prod, only the explicit CORS_ORIGINS allowlist applies.
const DEV_PATTERNS: readonly RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.localhost(:\d+)?$/,
  /^https?:\/\/lvh\.me(:\d+)?$/,
  /^https?:\/\/[a-z0-9-]+\.lvh\.me(:\d+)?$/
];

const corsPlugin: FastifyPluginAsync<CorsPluginOptions> = async (app, opts) => {
  const allowed = new Set(opts.config.CORS_ORIGINS);
  const isDev = opts.config.NODE_ENV !== "production";

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowed.has(origin)) {
        cb(null, true);
        return;
      }
      if (isDev && DEV_PATTERNS.some((re) => re.test(origin))) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id"
    ],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600
  });
};

export default fp(corsPlugin, { name: "cors" });
