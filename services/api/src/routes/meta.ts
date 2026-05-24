import type { FastifyPluginAsync } from "fastify";
import type { Config } from "../config.js";

export interface MetaRoutesOptions {
  config: Config;
}

const metaRoutes: FastifyPluginAsync<MetaRoutesOptions> = async (app, opts) => {
  app.get("/v1/_meta/build", async () => ({
    commit: opts.config.BUILD_COMMIT,
    builtAt: opts.config.BUILD_TIME,
    version: opts.config.BUILD_VERSION
  }));
};

export default metaRoutes;
