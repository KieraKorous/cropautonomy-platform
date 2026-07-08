// POST /api/webhooks/clerk
//
// Mirrors Clerk identity into public.users so the rest of the schema (captures,
// memberships, audit) can reference our internal uuid. Wire this URL in the
// Clerk dashboard under Webhooks; sign it with CLERK_WEBHOOK_SECRET.

import { clerkClient } from "@clerk/nextjs/server";
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
  // Carried over from the Clerk invitation on accept — the org the user was
  // invited to and the role they should hold. See services/api members routes.
  public_metadata?: {
    invited_org_id?: string;
    invited_role_key?: string;
    active_org_id?: string;
  } | null;
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

      const { data: upserted, error } = await supabase
        .from("users")
        .upsert(
          {
            clerk_user_id: evt.data.id,
            email: primaryEmail,
            display_name: displayName,
            avatar_url: evt.data.image_url ?? null
          },
          { onConflict: "clerk_user_id" }
        )
        .select("id")
        .single();
      if (error) {
        // eslint-disable-next-line no-console
        console.error("[clerk webhook] upsert users failed", error);
        return Response.json({ error: "Upsert failed." }, { status: 500 });
      }

      // Invitation acceptance: if this user was invited to an org (org + role
      // ride in the Clerk invitation's public_metadata), join them now so they
      // have an active membership + active org. Without this an invited user
      // signs in but the API rejects them for having no membership.
      if (evt.type === "user.created") {
        const invitedOrgId = evt.data.public_metadata?.invited_org_id;
        if (invitedOrgId) {
          const platformUserId = (upserted as { id: string }).id;
          const accepted = await acceptInvitation(
            supabase,
            platformUserId,
            invitedOrgId,
            evt.data.public_metadata?.invited_role_key ?? "viewer"
          );
          if (accepted) {
            try {
              const clerk = await clerkClient();
              await clerk.users.updateUserMetadata(evt.data.id, {
                publicMetadata: {
                  active_org_id: invitedOrgId,
                  platform_user_id: platformUserId
                }
              });
            } catch (metaErr) {
              // Best-effort: the DB membership is the source of truth. The JWT
              // template reads active_org_id from Clerk, so log loudly — a miss
              // here means the user's next request may need a metadata resync.
              // eslint-disable-next-line no-console
              console.error("[clerk webhook] patch Clerk metadata failed", metaErr);
            }
          }
        }
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

// Join an invited user to their org with the invited role. Idempotent: a
// duplicate membership (webhook retry) is ignored, and the active org is only
// set when the user has none yet. Returns true if the membership is in place.
async function acceptInvitation(
  supabase: ReturnType<typeof getServiceSupabase>,
  platformUserId: string,
  orgId: string,
  roleKey: string
): Promise<boolean> {
  const { data: role, error: roleErr } = await supabase
    .from("roles")
    .select("id")
    .eq("key", roleKey)
    .eq("is_system", true)
    .is("org_id", null)
    .maybeSingle();
  if (roleErr || !role) {
    // eslint-disable-next-line no-console
    console.error("[clerk webhook] invited role not found", { roleKey, roleErr });
    return false;
  }

  const { error: insErr } = await supabase.from("organization_memberships").insert({
    org_id: orgId,
    user_id: platformUserId,
    role_id: (role as { id: string }).id,
    status: "active",
    joined_at: new Date().toISOString()
  });
  // 23505 = the membership already exists (retry) — treat as success.
  if (insErr && (insErr as { code?: string }).code !== "23505") {
    // eslint-disable-next-line no-console
    console.error("[clerk webhook] create membership failed", insErr);
    return false;
  }

  // First org becomes the active org; don't clobber an existing selection.
  const { data: userRow } = await supabase
    .from("users")
    .select("active_organization_id")
    .eq("id", platformUserId)
    .maybeSingle();
  const currentOrg = (userRow as { active_organization_id: string | null } | null)?.active_organization_id;
  if (!currentOrg) {
    const { error: updErr } = await supabase
      .from("users")
      .update({ active_organization_id: orgId })
      .eq("id", platformUserId);
    if (updErr) {
      // eslint-disable-next-line no-console
      console.error("[clerk webhook] set active org failed", updErr);
    }
  }

  return true;
}
