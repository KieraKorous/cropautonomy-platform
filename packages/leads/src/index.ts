import type { PublicLead } from "@gaia/domain";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export async function capturePublicLead(lead: PublicLead) {
  const results = await Promise.allSettled([persistLead(lead), notifyLead(lead)]);
  const failed = results.filter((result) => result.status === "rejected");

  if (failed.length > 0) {
    throw new Error("Lead capture failed.");
  }
}

async function persistLead(lead: PublicLead) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_LEADS_TABLE ?? "public_leads";

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("Supabase lead capture is not configured.");
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  const { error } = await supabase.from(table).insert({
    name: lead.name,
    email: lead.email,
    organization: lead.organization,
    interest: lead.interest,
    message: lead.message,
    consent: lead.consent,
    source: lead.source
  });

  if (error) {
    throw error;
  }
}

async function notifyLead(lead: PublicLead) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.LEADS_NOTIFY_TO;
  const from = process.env.LEADS_NOTIFY_FROM;

  if (!apiKey || !to || !from) {
    throw new Error("Resend lead notification is not configured.");
  }

  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `New ${lead.source} lead: ${lead.name}`,
    text: [
      `Source: ${lead.source}`,
      `Name: ${lead.name}`,
      `Email: ${lead.email}`,
      `Organization: ${lead.organization ?? "Not provided"}`,
      `Interest: ${lead.interest}`,
      `Consent: ${lead.consent ? "yes" : "no"}`,
      "",
      lead.message ? `Message:\n${lead.message}` : "Message: Not provided"
    ].join("\n")
  });

  if (error) {
    throw error;
  }
}
