// Single pg-boss client for the API process. Used for enqueueing background
// jobs (analysis, email, etc.) consumed by services/workers. The API does
// not register handlers — it's a producer only.
//
// pg-boss schema migration happens on first start() in either the API or
// the worker; whichever runs first wins. Same DATABASE_URL both sides.

import PgBoss from "pg-boss";

let cached: PgBoss | null = null;
let started = false;

export interface QueueOptions {
  connectionString: string;
}

export async function getBoss(opts: QueueOptions): Promise<PgBoss> {
  if (cached && started) return cached;
  if (!cached) {
    cached = new PgBoss({
      connectionString: opts.connectionString,
      application_name: "gaia-api"
    });
    cached.on("error", (err) => {
      // eslint-disable-next-line no-console
      console.error("pg-boss (api) error:", err);
    });
  }
  if (!started) {
    await cached.start();
    started = true;
  }
  return cached;
}

export async function stopBoss(): Promise<void> {
  if (cached && started) {
    await cached.stop({ graceful: true, wait: true, timeout: 10_000 });
  }
  cached = null;
  started = false;
}
