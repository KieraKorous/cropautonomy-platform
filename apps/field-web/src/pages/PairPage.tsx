import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { ChromeLayout } from "../components/ChromeLayout.js";
import { api } from "../lib/api.js";
import {
  getOrCreatePhoneSerial,
  getPairedDevice,
  setPairedDevice,
  type PairedDevice
} from "../lib/db.js";

// Pair this phone as a live camera. Reached by opening the link/QR the portal's
// "Connect phone camera" dialog shows (field…/pair?code=XXXX). The phone is
// already signed in (cross-subdomain SSO), so claiming just registers it as a
// `phone` device in the operator's org.

export function PairPage() {
  const [params] = useSearchParams();
  // Prefill from the link/QR (?code=…) but keep it editable so the operator can
  // also just type the code shown on the portal.
  const [code, setCode] = useState((params.get("code") ?? "").trim().toUpperCase());
  const [deviceName, setDeviceName] = useState("");
  const [existing, setExisting] = useState<PairedDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [paired, setPaired] = useState<PairedDevice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPairedDevice().then(setExisting);
    // Default the device name to something recognizable in the fleet list.
    setDeviceName(defaultDeviceName());
  }, []);

  const trimmedCode = code.trim();

  async function claim() {
    if (!trimmedCode) return;
    setBusy(true);
    setError(null);
    try {
      const serial = await getOrCreatePhoneSerial();
      const res = await api.claimPairing({
        code: trimmedCode,
        deviceName: deviceName.trim() || defaultDeviceName(),
        serial
      });
      const device: PairedDevice = {
        deviceId: res.deviceId,
        orgId: res.orgId,
        deviceName: res.deviceName
      };
      await setPairedDevice(device);
      setPaired(device);
      setExisting(device);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pair this phone.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChromeLayout title="Pair camera" eyebrow="CropAutonomy">
      <div className="flex h-full flex-col gap-6 px-6 pb-8 pt-6">
        {paired ? (
          <Success device={paired} />
        ) : (
          <>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-neutral">
                Connect this phone
              </h2>
              <p className="mt-2 text-base text-base-content/65">
                Enter the code from the portal (Devices → Add device → Connect a
                phone camera), or open the link it shows. Pairing registers this
                phone as a camera the portal can accept onto the live screen.
              </p>
              {existing ? (
                <p className="mt-3 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-base-content/75">
                  This phone is already paired as “{existing.deviceName}”. Pairing
                  again will re-register it.
                </p>
              ) : null}
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral">
              Pairing code
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. 7K2QPM"
                maxLength={12}
                className="rounded-md border border-base-content/15 bg-base-100 px-3 py-3 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-neutral outline-none focus:border-primary"
              />
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium text-neutral">
              Camera name
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="e.g. Jordan's phone"
                className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2.5 text-base text-neutral outline-none focus:border-primary"
              />
            </label>

            {error ? (
              <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            ) : null}

            <div className="mt-auto">
              <button
                type="button"
                onClick={claim}
                disabled={busy || !trimmedCode}
                className="flex h-16 w-full items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm disabled:opacity-60"
              >
                {busy ? "Pairing…" : "Pair this phone"}
              </button>
            </div>
          </>
        )}
      </div>
    </ChromeLayout>
  );
}

function Success({ device }: { device: PairedDevice }) {
  return (
    <div className="flex h-full flex-col gap-6">
      <div className="rounded-md border border-success/30 bg-success/10 px-4 py-4 text-base font-medium text-success">
        Paired as “{device.deviceName}”.
      </div>
      <p className="text-base text-base-content/65">
        Head to the session screen and request to go live — a supervisor accepts
        it on the portal Live screen.
      </p>
      <Link
        to="/"
        className="mt-auto flex h-16 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm"
      >
        Go to sessions
      </Link>
    </div>
  );
}

function defaultDeviceName(): string {
  // A light hint from the UA so the fleet list isn't a wall of "Phone camera".
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  if (/iphone/i.test(ua)) return "iPhone camera";
  if (/ipad/i.test(ua)) return "iPad camera";
  if (/android/i.test(ua)) return "Android camera";
  return "Phone camera";
}
