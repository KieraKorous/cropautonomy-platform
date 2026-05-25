import base from "@gaia/config/next";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
export default {
  ...base,
  // Standalone output ships the minimal node_modules + a server.js entrypoint
  // for the GKE container image. Marketing apps stay on Vercel and don't need
  // this, so we set it here in the portal override rather than the shared
  // packages/config/next.config.mjs.
  output: "standalone",
  // pnpm monorepo: tell Next to trace deps from the workspace root so the
  // standalone bundle includes @gaia/* packages, not just apps/portal-web/.
  outputFileTracingRoot: path.join(__dirname, "../..")
};
