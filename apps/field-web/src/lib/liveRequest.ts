import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useState } from "react";

import { api } from "./api.js";
import type { PairedDevice } from "./db.js";

// The phone side of the request/accept gate. A paired device asks to go live;
// a portal watcher accepts, and the API grants the session over the device's
// commands channel. The GRANT (adopt session + jump to /capture) is handled
// app-globally by GoLiveGrantWatcher so it lands even if the operator left this
// screen. This hook owns the picker-local UI: sending the request, the pending
// state, cancel, and surfacing a rejection so the operator can retry.

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
        // Grant is handled by GoLiveGrantWatcher (app-global). Here we only need
        // to clear the pending UI on grant and surface a rejection.
        if (event.type === "device.command.live_granted") {
          setStatus("idle");
          setRequestId(null);
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
