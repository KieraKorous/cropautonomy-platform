import PgBoss from "pg-boss";
import { loadConfig } from "./config.js";

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
  // eslint-disable-next-line no-console
  console.log("pg-boss started; no handlers registered yet (v0 stub)");

  // Handlers land here as the platform grows:
  //   await boss.work("analysis.run", handleAnalysisRun);
  //   await boss.work("email.send", handleEmailSend);
  //   await boss.work("user.sync", handleUserSync);
  //   await boss.work("capture.finalize", handleCaptureFinalize);

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
