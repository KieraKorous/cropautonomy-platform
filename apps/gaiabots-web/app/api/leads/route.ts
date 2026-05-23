import type { PublicLead } from "@gaia/domain";
import { capturePublicLead } from "@gaia/leads";
import { NextResponse } from "next/server";

const validInterests = new Set<PublicLead["interest"]>([
  "farm_or_grower",
  "agricultural_business",
  "research_institution",
  "robotics_collaborator",
  "investor_or_partner",
  "technical_contributor",
  "other"
]);

export async function POST(request: Request) {
  const formData = await request.formData();
  const lead = parseLead(formData);

  if (!lead) {
    return NextResponse.json({ error: "Invalid lead submission." }, { status: 400 });
  }

  try {
    await capturePublicLead(lead);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Lead capture is not configured." }, { status: 503 });
  }
}

function parseLead(formData: FormData): PublicLead | null {
  const name = asString(formData.get("name"));
  const email = asString(formData.get("email"));
  const organization = asString(formData.get("organization"));
  const interest = asString(formData.get("interest")) as PublicLead["interest"];
  const message = asString(formData.get("message"));
  const consent = formData.get("consent") === "on";

  if (!name || !email || !validInterests.has(interest) || !consent) {
    return null;
  }

  return {
    name,
    email,
    organization,
    interest,
    message,
    consent,
    source: "gaiabots.ai"
  };
}

function asString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : undefined;
}
