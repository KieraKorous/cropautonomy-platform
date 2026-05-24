import { useEffect, useState } from "react";

import { api } from "./api.js";
import { getSessionState, setSessionState } from "./db.js";

export interface ActiveSession {
  sessionId: string;
  orgId: string;
  startedAt: string;
  farmId?: string;
  fieldId?: string;
  cropTypeId?: string;
  status: "live" | "paused";
}

const KEY = "active_session";

// Persisted in IndexedDB so a reload mid-session resumes instead of dropping
// the operator back to the picker. Reconciliation with the server-side
// session record happens lazily on the next API call.
export async function loadActiveSession(): Promise<ActiveSession | null> {
  return getSessionState<ActiveSession>(KEY);
}

export async function persistActiveSession(
  session: ActiveSession | null
): Promise<void> {
  await setSessionState(KEY, session);
}

export function useActiveSession(): {
  session: ActiveSession | null;
  loading: boolean;
  start: (input: {
    farmId?: string;
    fieldId?: string;
    cropTypeId?: string;
    initialLocation?: { lat: number; lng: number; accuracyMeters?: number };
  }) => Promise<ActiveSession>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  end: () => Promise<void>;
} {
  const [session, setSession] = useState<ActiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void loadActiveSession().then((s) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const start: ReturnType<typeof useActiveSession>["start"] = async (input) => {
    const response = await api.startSession({
      farmId: input.farmId ?? null,
      fieldId: input.fieldId ?? null,
      cropTypeId: input.cropTypeId ?? null,
      initialLocation: input.initialLocation ?? null
    });
    const next: ActiveSession = {
      sessionId: response.sessionId,
      orgId: response.orgId,
      startedAt: response.startedAt,
      farmId: input.farmId,
      fieldId: input.fieldId,
      cropTypeId: input.cropTypeId,
      status: "live"
    };
    await persistActiveSession(next);
    setSession(next);
    return next;
  };

  const pause = async () => {
    if (!session) return;
    await api.patchSession(session.sessionId, { action: "pause" });
    const next = { ...session, status: "paused" as const };
    await persistActiveSession(next);
    setSession(next);
  };

  const resume = async () => {
    if (!session) return;
    await api.patchSession(session.sessionId, { action: "resume" });
    const next = { ...session, status: "live" as const };
    await persistActiveSession(next);
    setSession(next);
  };

  const end = async () => {
    if (!session) return;
    await api.patchSession(session.sessionId, { action: "end" });
    await persistActiveSession(null);
    setSession(null);
  };

  return { session, loading, start, pause, resume, end };
}
