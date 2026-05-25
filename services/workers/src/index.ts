import PgBoss from "pg-boss";
import { loadConfig } from "./config.js";
import { makeAnalysisHandler } from "./handlers/analysis.js";
import { QUEUE_NAMES } from "./queues.js";

async function main() {
  const config = loadConfig();
  const boss = new PgBoss({
    connectionString: config.DATABASE_URL,
    application_name: "gaia-workers"
  });

  boss.on("error", (err) => {
    // eslint-disable-next-line no-console
    console.error("pg-boss error:", err);
  });

  await boss.start();

  // Ensure queues exist before workers attach. pg-boss 10 requires explicit
  // queue creation; createQueue is idempotent so this is safe at every boot.
  await boss.createQueue(QUEUE_NAMES.scanAnalysisRequested);

  await boss.work(
    QUEUE_NAMES.scanAnalysisRequested,
    { batchSize: 1, includeMetadata: false },
    makeAnalysisHandler(config)
  );

  // eslint-disable-next-line no-console
  console.log(
    `pg-boss started; handlers registered: ${QUEUE_NAMES.scanAnalysisRequested}`
  );

  const shutdown = async (signal: string) => {
    // eslint-disable-next-line no-console
    console.log(`received ${signal}, stopping pg-boss...`);
    try {
      await boss.stop({ graceful: true, wait: true, timeout: 30_000 });
      process.exit(0);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("error during shutdown:", err);
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("fatal:", err);
  process.exit(1);
});
