import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import { ZodError } from "zod";
import { ApiError, type ApiErrorEnvelope } from "../lib/errors.js";

const errorHandlerPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      const envelope: ApiErrorEnvelope = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {})
        }
      };
      reply.status(error.statusCode).send(envelope);
      return;
    }

    if (error instanceof ZodError) {
      const envelope: ApiErrorEnvelope = {
        error: {
          code: "validation.invalid_input",
          message: "Request body failed validation.",
          details: {
            issues: error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
              code: i.code
            }))
          }
        }
      };
      reply.status(400).send(envelope);
      return;
    }

    if (error.validation) {
      const envelope: ApiErrorEnvelope = {
        error: {
          code: "validation.invalid_input",
          message: error.message,
          details: { issues: error.validation }
        }
      };
      reply.status(400).send(envelope);
      return;
    }

    request.log.error(
      { err: error, requestId: request.id },
      "unhandled error"
    );
    const envelope: ApiErrorEnvelope = {
      error: {
        code: "server.internal_error",
        message: "An unexpected error occurred. Reference the request id when reporting.",
        details: { requestId: request.id }
      }
    };
    reply.status(500).send(envelope);
  });

  app.setNotFoundHandler((request, reply) => {
    const envelope: ApiErrorEnvelope = {
      error: {
        code: "route.not_found",
        message: `No route matches ${request.method} ${request.url}.`
      }
    };
    reply.status(404).send(envelope);
  });
};

export default fp(errorHandlerPlugin, { name: "error-handler" });
