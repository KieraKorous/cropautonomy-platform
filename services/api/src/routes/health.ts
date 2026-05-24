import type { FastifyPluginAsync } from "fastify";

const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/healthz", async () => ({ status: "ok" }));

  app.get("/readyz", async () => {
    // v0: liveness suffices. When downstream checks matter, add Supabase
    // and Resend reachability probes here and fail the route if either is
    // unavailable so Kubernetes can hold readiness off the pod.
    return { status: "ok" };
  });
};

export default healthRoutes;
