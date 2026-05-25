import Fastify, { type FastifyInstance } from "fastify";
import { uuidv7 } from "uuidv7";
import type { Config } from "./config.js";
import authPlugin from "./plugins/auth.js";
import corsPlugin from "./plugins/cors.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import requestIdPlugin from "./plugins/request-id.js";
import captureSessionsRoutes from "./routes/capture-sessions.js";
import capturesRoutes from "./routes/captures.js";
import fieldsRoutes from "./routes/fields.js";
import healthRoutes from "./routes/health.js";
import leadsRoutes from "./routes/leads.js";
import metaRoutes from "./routes/meta.js";
import realtimeRoutes from "./routes/realtime.js";

export async function buildServer(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === "production" ? "info" : "debug",
      ...(config.NODE_ENV === "development"
        ? {
            transport: {
              target: "pino-pretty",
              options: { translateTime: "HH:MM:ss.l", ignore: "pid,hostname" }
            }
          }
        : {})
    },
    genReqId: (req) => {
      const incoming = req.headers["x-request-id"];
      if (typeof incoming === "string" && incoming.length > 0) return incoming;
      return uuidv7();
    },
    bodyLimit: 1 * 1024 * 1024,
    trustProxy: true
  });

  await app.register(errorHandlerPlugin);
  await app.register(requestIdPlugin);
  await app.register(corsPlugin, { config });
  await app.register(authPlugin, { config });

  await app.register(healthRoutes);
  await app.register(metaRoutes, { config });
  await app.register(leadsRoutes);
  await app.register(captureSessionsRoutes);
  await app.register(capturesRoutes);
  await app.register(fieldsRoutes);
  await app.register(realtimeRoutes);

  return app;
}
