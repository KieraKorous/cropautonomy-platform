import cors from "@fastify/cors";
import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import type { Config } from "../config.js";

export interface CorsPluginOptions {
  config: Config;
}

const corsPlugin: FastifyPluginAsync<CorsPluginOptions> = async (app, opts) => {
  const allowed = new Set(opts.config.CORS_ORIGINS);

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
