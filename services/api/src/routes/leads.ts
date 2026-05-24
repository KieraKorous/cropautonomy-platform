import type { LeadInterest, LeadSource, PublicLead } from "@gaia/domain";
import { capturePublicLead } from "@gaia/leads";
import type { FastifyPluginAsync } from "fastify";
import { uuidv7 } from "uuidv7";
import { z } from "zod";
import { badRequest, serviceUnavailable } from "../lib/errors.js";

const interestValues = [
  "farm_or_grower",
  "agricultural_business",
  "research_institution",
  "robotics_collaborator",
  "investor_or_partner",
  "technical_contributor",
  "other"
] as const satisfies readonly LeadInterest[];

const sourceValues = ["cropautonomy.com", "gaiabots.ai"] as const satisfies readonly LeadSource[];

const leadBody = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320),
  organization: z.string().trim().max(200).optional(),
  interest: z.enum(interestValues),
  message: z.string().trim().max(4000).optional(),
  consent: z.literal(true, {
    errorMap: () => ({ message: "Consent is required." })
  }),
  source: z.enum(sourceValues)
});

const leadsRoutes: FastifyPluginAsync = async (app) => {
  app.post("/v1/leads", async (request, reply) => {
    const parsed = leadBody.safeParse(request.body);
    if (!parsed.success) {
      throw badRequest(
        "leads.invalid_input",
        "Lead submission is missing or has invalid fields.",
        {
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
            code: i.code
          }))
        }
      );
    }

    const lead: PublicLead = parsed.data;

    try {
      await capturePublicLead(lead);
    } catch (err) {
      request.log.error(
        { err, requestId: request.id, source: lead.source },
        "lead capture failed"
      );
      throw serviceUnavailable(
        "leads.capture_failed",
        "Lead capture is temporarily unavailable. Please try again shortly."
      );
    }

    reply.status(201);
    return {
      id: uuidv7(),
      createdAt: new Date().toISOString()
    };
  });
};

export default leadsRoutes;
