import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { uuidv7 } from "uuidv7";

const HEADER = "x-request-id";

const requestIdPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    const incoming = request.headers[HEADER];
    const id = typeof incoming === "string" && incoming.length > 0 ? incoming : uuidv7();
    request.id = id;
    reply.header(HEADER, id);
  });
};

export default fp(requestIdPlugin, { name: "request-id" });
