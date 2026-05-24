import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Wordmark } from "@gaia/ui";

import { Hud } from "../components/Hud.js";
import { useActiveSession } from "../lib/session.js";

// Single-screen picker: confirm where the operator is, start the session,
// hand off to the capture view. Field/farm dropdowns are placeholders until
// the portal exposes a /api/farms endpoint — for v0 the operator can pick
// "no field set" and still capture.

export function SessionPickerPage() {
  const navigate = useNavigate();
  const { session, loading, start } = useActiveSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <Hud queueCount={0} sessionStatus="off" />
        <div className="grid flex-1 place-items-center text-sm text-base-content/55">
          Loading…
        </div>
      </div>
    );
  }

  if (session) {
    navigate("/capture", { replace: true });
    return null;
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const initialLocation = await tryGetLocation();
      await start({ initialLocation });
      navigate("/capture", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <Hud queueCount={0} sessionStatus="off" />
      <main className="safe-bottom flex flex-1 flex-col gap-6 px-6 py-8">
        <Wordmark brand="cropautonomy" />
        <div>
          <p className="text-xs uppercase tracking-wider text-base-content/55">
            Field Capture
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-neutral">
            Ready to walk a field
          </h1>
          <p className="mt-2 text-sm text-base-content/65">
            Start a session and the portal will see your captures as they come in.
            Where you are is tagged from GPS automatically; you can set a specific
            field later.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm text-error">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={handleStart}
          disabled={busy}
          className="mt-auto flex h-14 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm disabled:opacity-60"
        >
          {busy ? "Starting…" : "Start session"}
        </button>
      </main>
    </div>
  );
}

async function tryGetLocation(): Promise<
  { lat: number; lng: number; accuracyMeters?: number } | undefined
> {
  if (!("geolocation" in navigator)) return undefined;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyMeters: p.coords.accuracy
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8000 }
    );
  });
}
