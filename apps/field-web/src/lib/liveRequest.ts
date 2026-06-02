import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useState } from "react";

import { api } from "./api.js";
import type { PairedDevice } from "./db.js";
import { adoptActiveSession } from "./session.js";

// The phone side of the request/accept gate. A paired device asks to go live;
// a portal watcher accepts, and the API grants the session over the device's
// commands channel. On grant we adopt the session so CapturePage mounts and the
// live publisher starts. On reject we surface it so the operator can retry.

export type LiveRequestStatus =
  | "idle"
  | "requesting"
  | "pending"
  | "rejected"
  | "error";

export interface UseLiveRequestResult {
  status: LiveRequestStatus;
  error: string | null;
  request: (opts?: {
    farmId?: string;
    fieldId?: string;
    cropTypeId?: string;
  }) => Promise<void>;
  cancel: () => Promise<void>;
}

export function useLiveRequest(device: PairedDevice | null): UseLiveRequestResult {
  const [status, setStatus] = useState<LiveRequestStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState<string | null>(null);

  // Subscribe to the device's command channel for the grant/reject. Active the
  // whole time a device is paired, so we never miss the watcher's decision.
  useRealtimeChannel(
    device
      ? channels.deviceCommands(device.orgId, device.deviceId)
      : "org.none.device.none.commands",
    {
      enabled: Boolean(device),
      historyLimit: 1,
      onEvent: (event) => {
        if (event.type === "device.command.live_granted") {
          setStatus("idle");
          setRequestId(null);
          void adoptActiveSession({
            sessionId: event.payload.sessionId,
            orgId: event.payload.orgId,
            startedAt: event.payload.grantedAt,
            status: "live"
          });
        } else if (event.type === "device.command.live_rejected") {
          setStatus("rejected");
          setRequestId(null);
        }
      }
    }
  );

  const request: UseLiveRequestResult["request"] = async (opts) => {
    if (!device) return;
    setStatus("requesting");
    setError(null);
    try {
      const res = await api.createLiveRequest({
        deviceId: device.deviceId,
        farmId: opts?.farmId ?? null,
        fieldId: opts?.fieldId ?? null,
        cropTypeId: opts?.cropTypeId ?? null
      });
      setRequestId(res.requestId);
      setStatus("pending");
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Could not send request.");
    }
  };

  const cancel: UseLiveRequestResult["cancel"] = async () => {
    if (requestId) {
      try {
        await api.cancelLiveRequest(requestId);
      } catch {
        // Best-effort — it may already be decided/expired.
      }
    }
    setRequestId(null);
    setStatus("idle");
    setError(null);
  };

  return { status, error, request, cancel };
}
