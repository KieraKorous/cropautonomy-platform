// POST /api/webhooks/clerk
//
// Mirrors Clerk identity into public.users so the rest of the schema (captures,
// memberships, audit) can reference our internal uuid. Wire this URL in the
// Clerk dashboard under Webhooks; sign it with CLERK_WEBHOOK_SECRET.

import { Webhook } from "svix";
import { getServiceSupabase } from "../../../../lib/supabase";

export const runtime = "nodejs";

interface ClerkUserPayload {
  id: string;
  email_addresses?: Array<{ id: string; email_address: string }>;
  primary_email_address_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  image_url?: string | null;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

export async function POST(request: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return Response.json(
      { error: "CLERK_WEBHOOK_SECRET is not set." },
      { status: 500 }
    );
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");
  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: "Missing svix headers." }, { status: 400 });
  }

  const rawBody = await request.text();
  const wh = new Webhook(secret);
  let evt: ClerkWebhookEvent;
  try {
    evt = wh.verify(rawBody, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature
    }) as ClerkWebhookEvent;
  } catch {
    return Response.json({ error: "Invalid signature." }, { status: 401 });
  }

  const supabase = getServiceSupabase();

  switch (evt.type) {
    case "user.created":
    case "user.updated": {
      const primaryEmail = evt.data.email_addresses?.find(
        (entry) => entry.id === evt.data.primary_email_address_id
      )?.email_address;
      if (!primaryEmail) {
        return Response.json({ ok: true, skipped: "no_primary_email" });
      }
      const displayName =
        [evt.data.first_name, evt.data.last_name].filter(Boolean).join(" ") || null;

      const { error } = await supabase
        .from("users")
        .upsert(
          {
            clerk_user_id: evt.data.id,
            email: primaryEmail,
            display_name: displayName,
            avatar_url: evt.data.image_url ?? null
          },
          { onConflict: "clerk_user_id" }
        );
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[clerk webhook] upsert users failed", error);
        return Response.json({ error: "Upsert failed." }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
    case "user.deleted": {
      // Soft delete posture: leave the users row in place so historical
      // captures/audit attribution stays intact. If hard delete is required
      // later, cascade through organization_memberships first.
      return Response.json({ ok: true, skipped: "user.deleted noop" });
    }
    default:
      return Response.json({ ok: true, ignored: evt.type });
  }
}
