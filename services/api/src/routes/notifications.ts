import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, notFound } from "../lib/errors.js";

// Notifications — the per-user inbox behind the portal bell. Every row belongs to
// one user (public.notifications.user_id); the producer (lib/notifications.ts)
// fans an event out to one row per recipient. Reads are always scoped to the
// caller, so a member can only ever see their own inbox.

const UUID_RE = /^[0-9a-f-]{36}$/i;

const listQuerySchema = z.object({
  // "true" → only unread (read_at is null and not dismissed).
  unread: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  limit: z.coerce.number().int().positive().max(100).default(20),
  offset: z.coerce.number().int().nonnegative().default(0)
});

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  action_url: string | null;
  read_at: string | null;
  dismissed_at: string | null;
  created_at: string;
}

const SELECT =
  "id, type, title, body, payload, action_url, read_at, dismissed_at, created_at";

function toSummary(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    payload: row.payload,
    actionUrl: row.action_url,
    readAt: row.read_at,
    dismissedAt: row.dismissed_at,
    createdAt: row.created_at
  };
}

const notificationsRoutes: FastifyPluginAsync = async (app) => {
  // GET /v1/notifications — the caller's inbox, newest first, + live unread count.
  app.get(
    "/v1/notifications",
    { preHandler: app.requireAuth("notifications.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = listQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw badRequest("notifications.invalid_query", "Invalid query.", {
          issues: parsed.error.issues
        });
      }
      const { unread, limit, offset } = parsed.data;
      const supabase = getDb();

      // Dismissed rows are hidden from every listing (they're the "clear" action).
      let query = supabase
        .from("notifications")
        .select(SELECT)
        .eq("user_id", caller.userId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit);
      if (unread) query = query.is("read_at", null);

      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as NotificationRow[];

      // Fetch one extra row to know whether there's another page.
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;

      const { count, error: countErr } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", caller.userId)
        .is("read_at", null)
        .is("dismissed_at", null);
      if (countErr) throw countErr;

      return {
        notifications: page.map(toSummary),
        unreadCount: count ?? 0,
        hasMore
      };
    }
  );

  // POST /v1/notifications/:id/read — mark one as read.
  app.post<{ Params: { id: string } }>(
    "/v1/notifications/:id/read",
    { preHandler: app.requireAuth("notifications.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("notifications.invalid_id", "Invalid notification id.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("user_id", caller.userId)
        .is("read_at", null)
        .select(SELECT)
        .maybeSingle();
      if (error) throw error;

      // Not found OR already read — confirm ownership before 404'ing so an
      // already-read row is idempotently OK, not an error.
      if (!data) {
        const { data: exists, error: existsErr } = await supabase
          .from("notifications")
          .select(SELECT)
          .eq("id", id)
          .eq("user_id", caller.userId)
          .maybeSingle();
        if (existsErr) throw existsErr;
        if (!exists) throw notFound("notifications.not_found", "Notification not found.");
        return { notification: toSummary(exists as NotificationRow) };
      }
      return { notification: toSummary(data as NotificationRow) };
    }
  );

  // POST /v1/notifications/read-all — mark every unread as read.
  app.post(
    "/v1/notifications/read-all",
    { preHandler: app.requireAuth("notifications.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();
      const { data, error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", caller.userId)
        .is("read_at", null)
        .is("dismissed_at", null)
        .select("id");
      if (error) throw error;
      return { updated: (data ?? []).length };
    }
  );

  // POST /v1/notifications/:id/dismiss — remove one from every listing.
  app.post<{ Params: { id: string } }>(
    "/v1/notifications/:id/dismiss",
    { preHandler: app.requireAuth("notifications.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) {
        throw badRequest("notifications.invalid_id", "Invalid notification id.");
      }
      const caller = request.auth!;
      const supabase = getDb();
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("notifications")
        .update({ dismissed_at: now, read_at: now })
        .eq("id", id)
        .eq("user_id", caller.userId)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound("notifications.not_found", "Notification not found.");
      return { ok: true };
    }
  );
};

export default notificationsRoutes;
