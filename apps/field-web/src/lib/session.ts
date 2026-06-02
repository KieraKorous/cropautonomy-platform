import { useSyncExternalStore } from "react";

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

// ──────────────────────────────────────────────────────────────────────────
// Module-level store. The session lives once for the whole app so that
// switching pages (SessionPicker -> Capture -> Map -> Queue -> Settings)
// doesn't re-trigger an IndexedDB load on every mount and doesn't reset
// each consumer's `loading` flag. Previously each `useActiveSession()` call
// had its own useState, which caused a redirect loop:
//   /            -> session loads -> Navigate to /capture
//   /capture     -> fresh hook, session=null while loading -> Navigate to /
//   ... browser-throttled.
// ──────────────────────────────────────────────────────────────────────────

type StoreState = { session: ActiveSession | null; loading: boolean };

let storeState: StoreState = { session: null, loading: true };
const listeners = new Set<() => void>();

function setStoreState(next: StoreState) {
  storeState = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoreState {
  return storeState;
}

// Kick off the IndexedDB load exactly once. Triggered the first time anyone
// asks for the snapshot; useSyncExternalStore will re-render once the value
// changes.
let loadStarted = false;
function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  void loadActiveSession()
    .then((session) => setStoreState({ session, loading: false }))
    .catch(() => setStoreState({ session: null, loading: false }));
}

// Adopt a session the phone did NOT create itself — used by the request/accept
// go-live flow, where a portal watcher accepts the request and the API creates
// the capture_session. The granted session is installed here so CapturePage
// mounts and the live publisher starts. The store is set synchronously (before
// the IndexedDB write) so a navigate("/capture") immediately after sees the
// session and doesn't bounce back through the picker's redirect guard.
export async function adoptActiveSession(session: ActiveSession): Promise<void> {
  setStoreState({ session, loading: false });
  await persistActiveSession(session);
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
  ensureLoaded();
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
    setStoreState({ session: next, loading: false });
    return next;
  };

  const pause = async () => {
    if (!state.session) return;
    await api.patchSession(state.session.sessionId, { action: "pause" });
    const next = { ...state.session, status: "paused" as const };
    await persistActiveSession(next);
    setStoreState({ session: next, loading: false });
  };

  const resume = async () => {
    if (!state.session) return;
    await api.patchSession(state.session.sessionId, { action: "resume" });
    const next = { ...state.session, status: "live" as const };
    await persistActiveSession(next);
    setStoreState({ session: next, loading: false });
  };

  const end = async () => {
    if (!state.session) return;
    // If the server already ended this session (a watcher ended it, or it was
    // reaped after the phone went away), clearing it locally is still the right
    // outcome — don't let the 409 bubble up as an uncaught error.
    try {
      await api.patchSession(state.session.sessionId, { action: "end" });
    } catch (err) {
      if (!(err instanceof Error && /already[_ ]ended/i.test(err.message))) {
        throw err;
      }
    }
    await persistActiveSession(null);
    setStoreState({ session: null, loading: false });
  };

  return { session: state.session, loading: state.loading, start, pause, resume, end };
}
