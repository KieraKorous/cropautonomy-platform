import { useEffect, useRef, useState } from "react";

import { api } from "./api.js";
import type { PairedDevice } from "./db.js";
import { adoptActiveSession } from "./session.js";

// The phone side of the request/accept gate. A paired device asks to go live;
// a portal watcher accepts and the API creates the session. We discover the
// decision by POLLING the request — reliable regardless of whether a realtime
// broadcast reaches the device (the app-global GoLiveGrantWatcher is the fast
// path when realtime does deliver; this poll is the guarantee). On accept we
// adopt the session, which redirects the picker to /capture and starts the
// publisher. On reject we surface it so the operator can retry.

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
  const adoptedRef = useRef(false);

  // While a request is pending, poll its status every 2.5s until it's decided.
  useEffect(() => {
    if (status !== "pending" || !requestId) return;
    let alive = true;

    const check = async () => {
      let res;
      try {
        res = await api.getLiveRequest(requestId);
      } catch {
        return; // transient — keep polling
      }
      if (!alive) return;
      if (res.status === "accepted" && res.sessionId && !adoptedRef.current) {
        adoptedRef.current = true;
        setStatus("idle");
        setRequestId(null);
        // Installs the session → the picker's `if (session)` guard redirects to
        // /capture, where the live publisher starts.
        void adoptActiveSession({
          sessionId: res.sessionId,
          orgId: res.orgId,
          startedAt: new Date().toISOString(),
          status: "live"
        });
      } else if (res.status === "rejected") {
        setStatus("rejected");
        setRequestId(null);
      } else if (res.status === "cancelled" || res.status === "expired") {
        setStatus("idle");
        setRequestId(null);
      }
    };

    void check();
    const interval = setInterval(check, 2500);
    // Background tabs throttle setInterval to ~once/minute, so a phone/portal in
    // two tabs of one machine would be slow to notice the accept. Re-check the
    // moment this tab is focused/visible again.
    const onWake = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      alive = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [status, requestId]);

  const request: UseLiveRequestResult["request"] = async (opts) => {
    if (!device) return;
    setStatus("requesting");
    setError(null);
    adoptedRef.current = false;
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
