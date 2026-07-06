import { randomInt } from "node:crypto";
import { channels } from "@gaia/realtime/channels";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { getDb } from "../lib/db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { createLiveSession, ensureOrgScoped, publishBestEffort } from "../lib/live.js";
import { applyTeamFilter, resolveTeamScope } from "../lib/team-scope.js";

const UUID_RE = /^[0-9a-f-]{36}$/i;

// Pairing codes are short and human-typeable (the operator may key them in by
// hand off the portal screen). Unambiguous alphabet — no 0/O/1/I/L.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const PAIRING_TTL_MS = 10 * 60 * 1000; // 10 minutes to claim a code
const LIVE_REQUEST_TTL_MS = 3 * 60 * 1000; // 3 minutes for a watcher to decide

function generateCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return out;
}

const claimSchema = z.object({
  code: z.string().min(4).max(12),
  deviceName: z.string().min(1).max(80),
  serial: z.string().min(8).max(64)
});

const createRequestSchema = z.object({
  deviceId: z.string().uuid(),
  farmId: z.string().uuid().nullable().optional(),
  fieldId: z.string().uuid().nullable().optional(),
  cropTypeId: z.string().uuid().nullable().optional()
});

// Device edits from the portal: rename (display_name + metadata.nickname),
// status changes (retire / reactivate), and the auto-live switch. 'unregistered'
// is intentionally not a settable status — it's only the pre-claim initial state.
// Operator-chosen card visual, persisted in device metadata. Either one of the
// portal's glyphs tinted with a palette color, or an uploaded square image kept
// as a capped data URL (resized client-side before it reaches us).
const appearanceSchema = z
  .discriminatedUnion("type", [
    z.object({
      type: z.literal("icon"),
      icon: z.string().min(1).max(40),
      color: z.string().min(1).max(40)
    }),
    z.object({
      type: z.literal("image"),
      // ~400 KB ceiling on the data URL — the client downsizes to a small square.
      image: z.string().min(1).max(400_000)
    })
  ])
  .nullable();

const updateDeviceSchema = z.object({
  displayName: z.string().min(1).max(80).optional(),
  nickname: z.string().max(80).nullable().optional(),
  status: z.enum(["active", "inactive", "maintenance", "retired"]).optional(),
  autoLiveEnabled: z.boolean().optional(),
  appearance: appearanceSchema.optional()
});

// Mirror of the discriminated union above, for typing the metadata round-trip.
type DeviceAppearance =
  | { type: "icon"; icon: string; color: string }
  | { type: "image"; image: string };

// Columns selected by the list/patch device queries.
const DEVICE_SELECT =
  "id, device_family, serial_number, display_name, firmware_version, status, auto_live_enabled, registered_at, last_seen_at, metadata, registered_by:users!registered_by_user_id(display_name, email)";

// Shape selected by the list/patch device queries (registered_by is the joined
// user row, or null if the registrant was removed).
interface DeviceRow {
  id: string;
  device_family: string;
  serial_number: string;
  display_name: string | null;
  firmware_version: string | null;
  status: string;
  auto_live_enabled: boolean;
  registered_at: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  registered_by: { display_name: string | null; email: string } | null;
}

// One row of the org_device_activity(uuid) rollup (migration 0022).
interface DeviceActivityRow {
  device_id: string;
  last_used_at: string | null;
  is_live: boolean;
}

// One device row → the portal-facing summary. nickname lives in metadata;
// registeredByName falls back through display_name → email → "Unknown".
function toDeviceSummary(row: DeviceRow) {
  const nickname = (row.metadata?.nickname as string | undefined) ?? null;
  const appearance = (row.metadata?.appearance as DeviceAppearance | undefined) ?? null;
  return {
    id: row.id,
    deviceFamily: row.device_family,
    serialNumber: row.serial_number,
    displayName: row.display_name,
    nickname,
    appearance,
    firmwareVersion: row.firmware_version,
    status: row.status,
    autoLiveEnabled: row.auto_live_enabled,
    registeredByName: row.registered_by?.display_name ?? row.registered_by?.email ?? null,
    registeredAt: row.registered_at,
    lastSeenAt: row.last_seen_at
  };
}

const devicesRoutes: FastifyPluginAsync = async (app) => {
  // ────────────────────────────────────────────────────────────────────────
  // Pairing: the portal mints a code, the phone claims it.
  // ────────────────────────────────────────────────────────────────────────

  // POST /v1/device-pairings — portal "Connect phone camera". Mints a pending
  // code; the QR/link the portal shows encodes field.cropautonomy.com/pair?code=
  app.post(
    "/v1/device-pairings",
    { preHandler: app.requireAuth("devices.register") },
    async (request, reply) => {
      const caller = request.auth!;
      const supabase = getDb();
      const now = Date.now();
      const expiresAt = new Date(now + PAIRING_TTL_MS).toISOString();

      // Retry on the (rare) chance the random code collides with a live pending one.
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = generateCode();
        const { data, error } = await supabase
          .from("device_pairings")
          .insert({
            org_id: caller.orgId,
            code,
            created_by_user_id: caller.userId,
            expires_at: expiresAt
          })
          .select("id")
          .single();
        if (!error) {
          reply.status(201);
          return { pairingId: (data as { id: string }).id, code, expiresAt, orgId: caller.orgId };
        }
        lastErr = error;
      }
      throw lastErr;
    }
  );

  // GET /v1/device-pairings/:id — poll fallback while waiting for the claim
  // (the portal primarily learns via the devicePairing realtime channel).
  app.get<{ Params: { id: string } }>(
    "/v1/device-pairings/:id",
    { preHandler: app.requireAuth("devices.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("device_pairings.invalid_id", "Invalid pairing id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("device_pairings")
        .select("id, org_id, status, device_id, expires_at, claimed_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound("device_pairings.not_found", "Pairing not found.");
      const row = data as {
        id: string;
        org_id: string;
        status: string;
        device_id: string | null;
        expires_at: string;
        claimed_at: string | null;
      };
      if (row.org_id !== caller.orgId) {
        throw notFound("device_pairings.not_found", "Pairing not found.");
      }
      const expired = row.status === "pending" && new Date(row.expires_at).getTime() < Date.now();
      return {
        pairingId: row.id,
        status: expired ? "expired" : row.status,
        deviceId: row.device_id,
        expiresAt: row.expires_at
      };
    }
  );

  // POST /v1/device-pairings/claim — the PHONE (Field PWA) claims a code. Upserts
  // a `phone` device row and links it to the pairing. Idempotent on re-pair via
  // the (org_id, device_family, serial_number) unique index.
  app.post(
    "/v1/device-pairings/claim",
    { preHandler: app.requireAuth("devices.register") },
    async (request, _reply) => {
      const caller = request.auth!;
      const parsed = claimSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("device_pairings.invalid_input", "Invalid claim body.", {
          issues: parsed.error.issues
        });
      }
      const { code, deviceName, serial } = parsed.data;
      const supabase = getDb();

      const { data: pairingData, error: pairingErr } = await supabase
        .from("device_pairings")
        .select("id, org_id, status, expires_at")
        .eq("code", code)
        .eq("status", "pending")
        .maybeSingle();
      if (pairingErr) throw pairingErr;
      if (!pairingData) {
        throw notFound("device_pairings.invalid_code", "No pending pairing for that code.");
      }
      const pairing = pairingData as {
        id: string;
        org_id: string;
        status: string;
        expires_at: string;
      };
      if (pairing.org_id !== caller.orgId) {
        // The phone is signed into a different org than the code was minted in.
        throw forbidden("device_pairings.org_mismatch", "Pairing belongs to another organization.");
      }
      if (new Date(pairing.expires_at).getTime() < Date.now()) {
        await supabase.from("device_pairings").update({ status: "expired" }).eq("id", pairing.id);
        throw conflict("device_pairings.expired", "Pairing code has expired.");
      }

      const nowIso = new Date().toISOString();
      const { data: deviceData, error: deviceErr } = await supabase
        .from("devices")
        .upsert(
          {
            org_id: caller.orgId,
            device_family: "phone",
            serial_number: serial,
            display_name: deviceName,
            status: "active",
            registered_at: nowIso,
            registered_by_user_id: caller.userId,
            last_seen_at: nowIso
          },
          { onConflict: "org_id,device_family,serial_number" }
        )
        .select("id, display_name")
        .single();
      if (deviceErr) throw deviceErr;
      const device = deviceData as { id: string; display_name: string };

      const { error: updateErr } = await supabase
        .from("device_pairings")
        .update({
          status: "claimed",
          device_id: device.id,
          claimed_by_user_id: caller.userId,
          claimed_at: nowIso
        })
        .eq("id", pairing.id)
        .eq("status", "pending");
      if (updateErr) throw updateErr;

      await publishBestEffort(
        request.log,
        channels.devicePairing(caller.orgId, pairing.id),
        {
          type: "device.pairing.claimed",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: {
            pairingId: pairing.id,
            deviceId: device.id,
            deviceName: device.display_name ?? deviceName,
            claimedAt: nowIso
          }
        }
      );

      return {
        pairingId: pairing.id,
        deviceId: device.id,
        deviceName: device.display_name ?? deviceName,
        orgId: caller.orgId
      };
    }
  );

  // ────────────────────────────────────────────────────────────────────────
  // Device registry: list, edit (rename / retire), delete. Drives the portal
  // Devices page. All org-scoped; writes gated on devices.update/deregister.
  // ────────────────────────────────────────────────────────────────────────

  // GET /v1/devices — the org's device registry for the portal grid. Hides
  // retired devices unless ?includeRetired=true. Returns the full per-device
  // shape so the detail modal needs no follow-up fetch.
  app.get<{ Querystring: { includeRetired?: string; teamId?: string } }>(
    "/v1/devices",
    { preHandler: app.requireAuth("devices.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();
      const includeRetired = request.query.includeRetired === "true";

      let query = supabase
        .from("devices")
        .select(DEVICE_SELECT)
        .eq("org_id", caller.orgId)
        .order("created_at", { ascending: false });
      if (!includeRetired) query = query.neq("status", "retired");

      // Team access boundary (+ optional ?teamId= narrow). No-op for admins.
      const scope = await resolveTeamScope(supabase, request.permissions!, {
        userId: caller.userId,
        orgId: caller.orgId
      });
      query = (
        await applyTeamFilter(query, supabase, caller.orgId, "device", scope, {
          teamId: request.query.teamId
        })
      ).query;

      const { data, error } = await query;
      if (error) throw error;

      // Whether this caller may edit/retire/delete devices and flip the auto-live
      // switch — lets the portal render management controls (the cached permission
      // set was already loaded for the devices.read check above).
      const canManage = await request.permissions!.hasPermission(
        { userId: caller.userId, orgId: caller.orgId },
        "devices.update"
      );

      // Per-device activity (last used + currently-live) derived from captures +
      // capture_sessions. Best-effort: if the rollup errors, fall back to no
      // activity rather than failing the whole registry list.
      const activity = new Map<string, { lastUsedAt: string | null; live: boolean }>();
      const { data: activityRows, error: activityErr } = await supabase.rpc(
        "org_device_activity",
        { p_org_id: caller.orgId }
      );
      if (activityErr) {
        request.log.warn({ err: activityErr }, "org_device_activity rollup failed");
      } else {
        for (const r of (activityRows ?? []) as DeviceActivityRow[]) {
          activity.set(r.device_id, { lastUsedAt: r.last_used_at, live: r.is_live });
        }
      }

      const rows = (data ?? []) as unknown as DeviceRow[];
      const devices = rows.map((row) => {
        const act = activity.get(row.id);
        return {
          ...toDeviceSummary(row),
          lastUsedAt: act?.lastUsedAt ?? null,
          live: act?.live ?? false
        };
      });
      return { orgId: caller.orgId, canManage, devices };
    }
  );

  // PATCH /v1/devices/:id — rename (display_name + metadata.nickname) and/or
  // change status (retire / reactivate). One endpoint for every device edit.
  app.patch<{ Params: { id: string } }>(
    "/v1/devices/:id",
    { preHandler: app.requireAuth("devices.update") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("devices.invalid_id", "Invalid device id.");
      const parsed = updateDeviceSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("devices.invalid_input", "Invalid device update.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      if (
        body.displayName === undefined &&
        body.nickname === undefined &&
        body.status === undefined &&
        body.autoLiveEnabled === undefined &&
        body.appearance === undefined
      ) {
        throw badRequest("devices.empty_update", "No fields to update.");
      }
      const caller = request.auth!;
      const supabase = getDb();

      // Load + org-scope before writing (also gives us metadata to merge into).
      const { data: existing, error: loadErr } = await supabase
        .from("devices")
        .select("id, org_id, metadata")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("devices.not_found", "Device not found.");
      }

      const patch: Record<string, unknown> = {};
      if (body.displayName !== undefined) patch.display_name = body.displayName;
      if (body.status !== undefined) patch.status = body.status;
      if (body.autoLiveEnabled !== undefined) patch.auto_live_enabled = body.autoLiveEnabled;
      if (body.nickname !== undefined || body.appearance !== undefined) {
        const current = ((existing as { metadata: Record<string, unknown> | null }).metadata) ?? {};
        // Merge into existing metadata so unrelated keys survive. For nickname,
        // null clears and a string sets. For appearance, null clears the override
        // (revert to family default) and an object sets it.
        const merged: Record<string, unknown> = { ...current };
        if (body.nickname !== undefined) merged.nickname = body.nickname;
        if (body.appearance !== undefined) {
          if (body.appearance === null) delete merged.appearance;
          else merged.appearance = body.appearance;
        }
        patch.metadata = merged;
      }

      const { data: updated, error: updErr } = await supabase
        .from("devices")
        .update(patch)
        .eq("id", id)
        .eq("org_id", caller.orgId)
        .select(DEVICE_SELECT)
        .single();
      if (updErr) throw updErr;

      return toDeviceSummary(updated as unknown as DeviceRow);
    }
  );

  // DELETE /v1/devices/:id — permanent deregister. Captures/sessions/audit keep
  // their (now-null) device link; telemetry + live_requests cascade away.
  app.delete<{ Params: { id: string } }>(
    "/v1/devices/:id",
    { preHandler: app.requireAuth("devices.deregister") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("devices.invalid_id", "Invalid device id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data: existing, error: loadErr } = await supabase
        .from("devices")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();
      if (loadErr) throw loadErr;
      if (!existing || (existing as { org_id: string }).org_id !== caller.orgId) {
        throw notFound("devices.not_found", "Device not found.");
      }

      const { error: delErr } = await supabase
        .from("devices")
        .delete()
        .eq("id", id)
        .eq("org_id", caller.orgId);
      if (delErr) throw delErr;

      return { deviceId: id, deleted: true };
    }
  );

  // GET /v1/devices/:id/live-config — the PHONE reads its own go-live config so
  // the field app knows whether to auto-connect on open. Scoped to the live-
  // request permission the phone already holds (not devices.read, which is a
  // portal-watcher grant). Returns the current auto-live flag, fresh — so a
  // portal toggle takes effect on the next app open without re-pairing.
  app.get<{ Params: { id: string } }>(
    "/v1/devices/:id/live-config",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("devices.invalid_id", "Invalid device id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("devices")
        .select("id, org_id, auto_live_enabled")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      const row = data as { id: string; org_id: string; auto_live_enabled: boolean } | null;
      if (!row || row.org_id !== caller.orgId) {
        throw notFound("devices.not_found", "Device not found.");
      }
      return { deviceId: row.id, autoLiveEnabled: row.auto_live_enabled };
    }
  );

  // ────────────────────────────────────────────────────────────────────────
  // Live requests: the phone asks to go live; any technician+ watcher decides.
  // ────────────────────────────────────────────────────────────────────────

  // GET /v1/live-requests?status=pending — seeds the Live screen's request panel.
  app.get<{ Querystring: { status?: string } }>(
    "/v1/live-requests",
    { preHandler: app.requireAuth("capture_sessions.read") },
    async (request, _reply) => {
      const caller = request.auth!;
      const supabase = getDb();
      const status = request.query.status ?? "pending";

      const { data, error } = await supabase
        .from("live_requests")
        .select(
          "id, status, device_id, requested_at, expires_at, device:devices!device_id(display_name), requester:users!requested_by_user_id(clerk_user_id, display_name, email)"
        )
        .eq("org_id", caller.orgId)
        .eq("status", status)
        .order("requested_at", { ascending: false });
      if (error) throw error;

      const nowMs = Date.now();
      const rows = (data ?? []) as unknown as Array<{
        id: string;
        status: string;
        device_id: string;
        requested_at: string;
        expires_at: string;
        device: { display_name: string | null } | null;
        requester: { clerk_user_id: string; display_name: string | null; email: string } | null;
      }>;

      return {
        orgId: caller.orgId,
        requests: rows
          // Hide pending rows that have aged out; they'll be lazily expired on decide.
          .filter((r) => r.status !== "pending" || new Date(r.expires_at).getTime() > nowMs)
          .map((r) => ({
            requestId: r.id,
            status: r.status,
            deviceId: r.device_id,
            deviceName: r.device?.display_name ?? "Phone camera",
            requestedByName: r.requester?.display_name ?? r.requester?.email ?? "Operator",
            requestedAt: r.requested_at,
            expiresAt: r.expires_at
          }))
      };
    }
  );

  // GET /v1/live-requests/:id — the PHONE polls its own request while waiting,
  // so going live doesn't depend on a realtime broadcast reaching the device.
  app.get<{ Params: { id: string } }>(
    "/v1/live-requests/:id",
    { preHandler: app.requireAuth("capture_sessions.read") },
    async (request, _reply) => {
      const { id } = request.params;
      if (!UUID_RE.test(id)) throw badRequest("live_requests.invalid_id", "Invalid request id.");
      const caller = request.auth!;
      const supabase = getDb();

      const { data, error } = await supabase
        .from("live_requests")
        .select("id, org_id, status, session_id, device_id, expires_at")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw notFound("live_requests.not_found", "Live request not found.");
      const row = data as {
        id: string;
        org_id: string;
        status: string;
        session_id: string | null;
        device_id: string;
        expires_at: string;
      };
      if (row.org_id !== caller.orgId) {
        throw notFound("live_requests.not_found", "Live request not found.");
      }
      const expired =
        row.status === "pending" && new Date(row.expires_at).getTime() < Date.now();
      return {
        requestId: row.id,
        status: expired ? "expired" : row.status,
        sessionId: row.session_id,
        deviceId: row.device_id,
        orgId: row.org_id
      };
    }
  );

  // POST /v1/live-requests — the PHONE asks to go live.
  app.post(
    "/v1/live-requests",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, reply) => {
      const caller = request.auth!;
      const parsed = createRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw badRequest("live_requests.invalid_input", "Invalid live request body.", {
          issues: parsed.error.issues
        });
      }
      const body = parsed.data;
      const supabase = getDb();

      await ensureOrgScoped("devices", body.deviceId, caller.orgId);
      if (body.farmId) await ensureOrgScoped("farms", body.farmId, caller.orgId);
      if (body.fieldId) await ensureOrgScoped("fields", body.fieldId, caller.orgId);
      if (body.cropTypeId) await ensureOrgScoped("crop_types", body.cropTypeId, caller.orgId);

      // Idempotent: a device with a live pending request just gets it back.
      const { data: existing, error: existingErr } = await supabase
        .from("live_requests")
        .select("id, expires_at")
        .eq("device_id", body.deviceId)
        .eq("status", "pending")
        .maybeSingle();
      if (existingErr) throw existingErr;
      if (existing) {
        const ex = existing as { id: string; expires_at: string };
        if (new Date(ex.expires_at).getTime() > Date.now()) {
          return { requestId: ex.id, expiresAt: ex.expires_at, status: "pending", orgId: caller.orgId };
        }
        await supabase.from("live_requests").update({ status: "expired" }).eq("id", ex.id);
      }

      const requestedAt = new Date().toISOString();
      const expiresAt = new Date(Date.now() + LIVE_REQUEST_TTL_MS).toISOString();

      const { data: inserted, error } = await supabase
        .from("live_requests")
        .insert({
          org_id: caller.orgId,
          device_id: body.deviceId,
          requested_by_user_id: caller.userId,
          farm_id: body.farmId ?? null,
          field_id: body.fieldId ?? null,
          crop_type_id: body.cropTypeId ?? null,
          requested_at: requestedAt,
          expires_at: expiresAt
        })
        .select("id")
        .single();
      if (error) throw error;
      const requestId = (inserted as { id: string }).id;

      const { data: deviceRow } = await supabase
        .from("devices")
        .select("display_name, auto_live_enabled")
        .eq("id", body.deviceId)
        .maybeSingle();
      const device = deviceRow as { display_name: string | null; auto_live_enabled: boolean } | null;
      const deviceName = device?.display_name ?? "Phone camera";

      // Auto-live: the device is trusted to stream without watcher approval.
      // Grant immediately — spawn the session and tell the phone to publish,
      // mirroring the accept route. The phone's poll/grant-watcher adopts it.
      if (device?.auto_live_enabled) {
        const { sessionId } = await createLiveSession(request.log, {
          orgId: caller.orgId,
          operatorUserId: caller.userId,
          operatorClerkUserId: caller.clerkUserId,
          startedByDeviceId: body.deviceId,
          farmId: body.farmId ?? null,
          fieldId: body.fieldId ?? null,
          cropTypeId: body.cropTypeId ?? null
        });

        const decidedAt = new Date().toISOString();
        const { error: grantErr } = await supabase
          .from("live_requests")
          .update({ status: "accepted", session_id: sessionId, decided_at: decidedAt })
          .eq("id", requestId)
          .eq("status", "pending");
        if (grantErr) throw grantErr;

        // Clear it from any watcher panel…
        await publishBestEffort(request.log, channels.liveRequests(caller.orgId), {
          type: "live.request.accepted",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: {
            requestId,
            deviceId: body.deviceId,
            sessionId,
            decidedByUserId: caller.clerkUserId,
            decidedAt
          }
        });
        // …and tell the phone it may start publishing on this session.
        await publishBestEffort(
          request.log,
          channels.deviceCommands(caller.orgId, body.deviceId),
          {
            type: "device.command.live_granted",
            version: 1,
            emittedBy: caller.clerkUserId,
            payload: {
              requestId,
              deviceId: body.deviceId,
              orgId: caller.orgId,
              sessionId,
              grantedAt: decidedAt
            }
          }
        );

        reply.status(201);
        return { requestId, sessionId, expiresAt, status: "accepted", orgId: caller.orgId };
      }

      await publishBestEffort(request.log, channels.liveRequests(caller.orgId), {
        type: "live.request.created",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: {
          requestId,
          orgId: caller.orgId,
          deviceId: body.deviceId,
          deviceName,
          requestedByUserId: caller.clerkUserId,
          farmId: body.farmId ?? undefined,
          fieldId: body.fieldId ?? undefined,
          cropTypeId: body.cropTypeId ?? undefined,
          requestedAt
        }
      });

      reply.status(201);
      return { requestId, expiresAt, status: "pending", orgId: caller.orgId };
    }
  );

  // POST /v1/live-requests/:id/accept — any technician+ watcher grants it. Spawns
  // a normal 'live' capture_session attributed to the requesting operator.
  app.post<{ Params: { id: string } }>(
    "/v1/live-requests/:id/accept",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, _reply) => {
      const { request: liveReq, supabase } = await loadPendingRequest(request);
      const caller = request.auth!;

      // The session is attributed to the operator who requested it, not the
      // watcher who accepted — they're the one holding the camera.
      const { data: requesterRow, error: requesterErr } = await supabase
        .from("users")
        .select("clerk_user_id")
        .eq("id", liveReq.requested_by_user_id)
        .maybeSingle();
      if (requesterErr) throw requesterErr;
      const operatorClerkUserId =
        (requesterRow as { clerk_user_id: string } | null)?.clerk_user_id ?? caller.clerkUserId;

      const { sessionId } = await createLiveSession(request.log, {
        orgId: caller.orgId,
        operatorUserId: liveReq.requested_by_user_id,
        operatorClerkUserId,
        startedByDeviceId: liveReq.device_id,
        farmId: liveReq.farm_id,
        fieldId: liveReq.field_id,
        cropTypeId: liveReq.crop_type_id
      });

      const decidedAt = new Date().toISOString();
      const { error: updErr } = await supabase
        .from("live_requests")
        .update({
          status: "accepted",
          session_id: sessionId,
          decided_by_user_id: caller.userId,
          decided_at: decidedAt
        })
        .eq("id", liveReq.id)
        .eq("status", "pending");
      if (updErr) throw updErr;

      // Drop the request from every watcher's panel…
      await publishBestEffort(request.log, channels.liveRequests(caller.orgId), {
        type: "live.request.accepted",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: {
          requestId: liveReq.id,
          deviceId: liveReq.device_id,
          sessionId,
          decidedByUserId: caller.clerkUserId,
          decidedAt
        }
      });
      // …and tell the phone it may start publishing on this session.
      await publishBestEffort(
        request.log,
        channels.deviceCommands(caller.orgId, liveReq.device_id),
        {
          type: "device.command.live_granted",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: {
            requestId: liveReq.id,
            deviceId: liveReq.device_id,
            orgId: caller.orgId,
            sessionId,
            grantedAt: decidedAt
          }
        }
      );

      return { requestId: liveReq.id, sessionId };
    }
  );

  // POST /v1/live-requests/:id/reject — any technician+ watcher declines it.
  app.post<{ Params: { id: string } }>(
    "/v1/live-requests/:id/reject",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, _reply) => {
      const { request: liveReq, supabase } = await loadPendingRequest(request);
      const caller = request.auth!;
      const decidedAt = new Date().toISOString();

      const { error: updErr } = await supabase
        .from("live_requests")
        .update({ status: "rejected", decided_by_user_id: caller.userId, decided_at: decidedAt })
        .eq("id", liveReq.id)
        .eq("status", "pending");
      if (updErr) throw updErr;

      await publishBestEffort(request.log, channels.liveRequests(caller.orgId), {
        type: "live.request.rejected",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: {
          requestId: liveReq.id,
          deviceId: liveReq.device_id,
          decidedByUserId: caller.clerkUserId,
          decidedAt
        }
      });
      await publishBestEffort(
        request.log,
        channels.deviceCommands(caller.orgId, liveReq.device_id),
        {
          type: "device.command.live_rejected",
          version: 1,
          emittedBy: caller.clerkUserId,
          payload: { requestId: liveReq.id, deviceId: liveReq.device_id, rejectedAt: decidedAt }
        }
      );

      return { requestId: liveReq.id, status: "rejected" };
    }
  );

  // POST /v1/live-requests/:id/cancel — the PHONE withdraws its own request.
  app.post<{ Params: { id: string } }>(
    "/v1/live-requests/:id/cancel",
    { preHandler: app.requireAuth("capture_sessions.create") },
    async (request, _reply) => {
      const { request: liveReq, supabase } = await loadPendingRequest(request);
      const caller = request.auth!;
      if (liveReq.requested_by_user_id !== caller.userId) {
        throw forbidden("live_requests.not_requester", "Only the requester can cancel.");
      }
      const cancelledAt = new Date().toISOString();

      const { error: updErr } = await supabase
        .from("live_requests")
        .update({ status: "cancelled", decided_at: cancelledAt })
        .eq("id", liveReq.id)
        .eq("status", "pending");
      if (updErr) throw updErr;

      await publishBestEffort(request.log, channels.liveRequests(caller.orgId), {
        type: "live.request.cancelled",
        version: 1,
        emittedBy: caller.clerkUserId,
        payload: { requestId: liveReq.id, deviceId: liveReq.device_id, cancelledAt }
      });

      return { requestId: liveReq.id, status: "cancelled" };
    }
  );
};

interface PendingLiveRequest {
  id: string;
  org_id: string;
  status: string;
  device_id: string;
  requested_by_user_id: string;
  farm_id: string | null;
  field_id: string | null;
  crop_type_id: string | null;
  expires_at: string;
}

// Shared loader for accept/reject/cancel: validates the id, org scope, pending
// status, and expiry (lazily marking aged-out requests expired).
async function loadPendingRequest(request: FastifyRequest<{ Params: { id: string } }>) {
  const { id } = request.params;
  if (!UUID_RE.test(id)) throw badRequest("live_requests.invalid_id", "Invalid request id.");
  const caller = request.auth!;
  const supabase = getDb();

  const { data, error } = await supabase
    .from("live_requests")
    .select(
      "id, org_id, status, device_id, requested_by_user_id, farm_id, field_id, crop_type_id, expires_at"
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw notFound("live_requests.not_found", "Live request not found.");
  const liveReq = data as PendingLiveRequest;
  if (liveReq.org_id !== caller.orgId) {
    throw notFound("live_requests.not_found", "Live request not found.");
  }
  if (liveReq.status !== "pending") {
    throw conflict("live_requests.not_pending", `Request is already '${liveReq.status}'.`);
  }
  if (new Date(liveReq.expires_at).getTime() < Date.now()) {
    await supabase.from("live_requests").update({ status: "expired" }).eq("id", liveReq.id);
    throw conflict("live_requests.expired", "Live request has expired.");
  }
  return { request: liveReq, supabase };
}

export default devicesRoutes;
