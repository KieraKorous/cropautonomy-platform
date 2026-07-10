import type { FastifyBaseLogger } from "fastify";
import { channels } from "@gaia/realtime/channels";
import { getDb } from "./db.js";
import { publishBestEffort } from "./live.js";

// Notification producer. Writes per-user inbox rows into public.notifications and
// announces each on the org-wide orgNotifications channel so the portal bell
// updates live (every member's browser filters the broadcast by payload.userId).
//
// Producing a notification is observational, never the point of a request: a
// failure here must not fail the write that triggered it. Every function below
// swallows its own errors and logs — call sites can `await` without try/catch.

type Db = ReturnType<typeof getDb>;

// Active member user ids (public.users.id) holding ANY of the given system role
// keys in this org. Mirrors systemRoleId in routes/members.ts, batched.
export async function usersWithRoles(
  supabase: Db,
  orgId: string,
  roleKeys: string[]
): Promise<string[]> {
  const { data: roles, error: rolesErr } = await supabase
    .from("roles")
    .select("id")
    .in("key", roleKeys)
    .eq("is_system", true)
    .is("org_id", null);
  if (rolesErr) throw rolesErr;
  const roleIds = (roles as { id: string }[]).map((r) => r.id);
  if (roleIds.length === 0) return [];

  const { data: members, error: memErr } = await supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("status", "active")
    .in("role_id", roleIds);
  if (memErr) throw memErr;
  return (members as { user_id: string }[]).map((m) => m.user_id);
}

export interface NotifyInput {
  orgId: string;
  /** Recipient public.users.id list. Deduped; empties dropped. */
  userIds: string[];
  type: string;
  title: string;
  body?: string | null;
  payload?: Record<string, unknown>;
  actionUrl?: string | null;
  /** The actor — never notify someone about their own action. */
  excludeUserId?: string | null;
}

export async function notifyUsers(
  log: FastifyBaseLogger,
  input: NotifyInput
): Promise<void> {
  const recipients = Array.from(new Set(input.userIds.filter(Boolean))).filter(
    (id) => id !== input.excludeUserId
  );
  if (recipients.length === 0) return;

  const supabase = getDb();
  const rows = recipients.map((userId) => ({
    user_id: userId,
    org_id: input.orgId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    payload: input.payload ?? {},
    action_url: input.actionUrl ?? null
  }));

  const { data, error } = await supabase
    .from("notifications")
    .insert(rows)
    .select("id, user_id, created_at");
  if (error) {
    log.warn({ err: error, type: input.type }, "notifyUsers insert failed (non-fatal)");
    return;
  }

  for (const r of (data ?? []) as { id: string; user_id: string; created_at: string }[]) {
    await publishBestEffort(log, channels.orgNotifications(input.orgId), {
      type: "notification.created",
      version: 1,
      payload: {
        notificationId: r.id,
        userId: r.user_id,
        orgId: input.orgId,
        notifType: input.type,
        title: input.title,
        body: input.body ?? undefined,
        actionUrl: input.actionUrl ?? undefined,
        // Normalize PostgREST's timestamptz to a clean ISO string so the event
        // passes publish-time zod validation.
        createdAt: new Date(r.created_at).toISOString()
      }
    });
  }
}

// Notify every active member holding any of the given role keys. Convenience
// over usersWithRoles + notifyUsers; fully non-throwing.
export async function notifyRoles(
  log: FastifyBaseLogger,
  input: Omit<NotifyInput, "userIds"> & { roleKeys: string[] }
): Promise<void> {
  try {
    const supabase = getDb();
    const userIds = await usersWithRoles(supabase, input.orgId, input.roleKeys);
    await notifyUsers(log, { ...input, userIds });
  } catch (err) {
    log.warn({ err, type: input.type }, "notifyRoles failed (non-fatal)");
  }
}
