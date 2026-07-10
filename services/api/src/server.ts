import Fastify, { type FastifyInstance } from "fastify";
import { uuidv7 } from "uuidv7";
import type { Config } from "./config.js";
import { getBoss, stopBoss } from "./lib/queue.js";
import { QUEUE_NAMES } from "@gaia/workers/queues";
import authPlugin from "./plugins/auth.js";
import corsPlugin from "./plugins/cors.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import requestIdPlugin from "./plugins/request-id.js";
import captureSessionsRoutes from "./routes/capture-sessions.js";
import capturesRoutes from "./routes/captures.js";
import devicesRoutes from "./routes/devices.js";
import farmsRoutes from "./routes/farms.js";
import fieldsRoutes from "./routes/fields.js";
import healthRoutes from "./routes/health.js";
import leadsRoutes from "./routes/leads.js";
import meRoutes from "./routes/me.js";
import membersRoutes from "./routes/members.js";
import notificationsRoutes from "./routes/notifications.js";
import organizationsRoutes from "./routes/organizations.js";
import metaRoutes from "./routes/meta.js";
import realtimeRoutes from "./routes/realtime.js";
import scoutTasksRoutes from "./routes/scout-tasks.js";
import teamsRoutes from "./routes/teams.js";
import zonesRoutes from "./routes/zones.js";

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
  await app.register(meRoutes);
  await app.register(membersRoutes);
  await app.register(organizationsRoutes);
  await app.register(leadsRoutes);
  await app.register(captureSessionsRoutes);
  await app.register(capturesRoutes);
  await app.register(devicesRoutes);
  await app.register(farmsRoutes);
  await app.register(fieldsRoutes);
  await app.register(zonesRoutes);
  await app.register(teamsRoutes);
  await app.register(scoutTasksRoutes);
  await app.register(notificationsRoutes);
  await app.register(realtimeRoutes);

  // pg-boss producer: start during boot so the first enqueue doesn't pay
  // the schema-migration cost on the request hot path. createQueue is
  // idempotent and safe to call on every boot.
  const boss = await getBoss({ connectionString: config.DATABASE_URL });
  await boss.createQueue(QUEUE_NAMES.scanAnalysisRequested);

  app.addHook("onClose", async () => {
    await stopBoss();
  });

  return app;
}
