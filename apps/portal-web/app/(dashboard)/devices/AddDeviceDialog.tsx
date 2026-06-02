"use client";

import { channels } from "@gaia/realtime/channels";
import { useRealtimeChannel } from "@gaia/realtime/client";
import { useEffect, useRef, useState } from "react";
import { CameraIcon, DroneIcon, MapPinIcon, RoverIcon, StatusPill } from "@gaia/ui";
import {
  createDevicePairingAction,
  getDevicePairingAction
} from "./actions";
import type { CreateDevicePairingResponse } from "../../../lib/api";

// Device families mirror the `device_family` enum in
// packages/db/migrations/0012_phone_cameras_and_live_requests.sql. `phone` is
// live (the pairing flow above); the rest are a disabled preview of the GAIA
// fleet. GAIA-S borrows MapPinIcon (a stationary node).
const families = [
  { code: "GAIA-R", name: "Ground rover", icon: <RoverIcon size={18} /> },
  { code: "GAIA-D", name: "Aerial drone", icon: <DroneIcon size={18} /> },
  { code: "GAIA-S", name: "Sensor station", icon: <MapPinIcon size={18} /> }
];

// Where the Field PWA lives, so the pairing link/QR points the phone at it.
// Dev: set NEXT_PUBLIC_FIELD_APP_URL=http://field.lvh.me:5173.
const FIELD_APP_URL = (
  process.env.NEXT_PUBLIC_FIELD_APP_URL ?? "https://field.cropautonomy.com"
).replace(/\/+$/, "");

type PairState =
  | { kind: "idle" }
  | { kind: "creating" }
  | { kind: "pending"; pairing: CreateDevicePairingResponse }
  | { kind: "claimed"; deviceName: string }
  | { kind: "error"; message: string };

// Native <dialog> (Escape + backdrop close for free). Primary action is pairing a
// phone camera; the fleet list below previews what registration will add next.
// onPaired fires once the phone claims the code so the grid can refresh and show
// the new device card.
export function AddDeviceDialog({
  open,
  onClose,
  onPaired
}: {
  open: boolean;
  onClose: () => void;
  onPaired?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [pair, setPair] = useState<PairState>({ kind: "idle" });

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Reset the pairing flow whenever the dialog is reopened.
  useEffect(() => {
    if (open) setPair({ kind: "idle" });
  }, [open]);

  const pairing = pair.kind === "pending" ? pair.pairing : null;

  // Primary signal: the phone's claim arrives on the devicePairing channel.
  useRealtimeChannel(
    pairing
      ? channels.devicePairing(pairing.orgId, pairing.pairingId)
      : "org.none.pairing.none",
    {
      enabled: Boolean(pairing),
      historyLimit: 1,
      onEvent: (event) => {
        if (event.type === "device.pairing.claimed") {
          setPair({ kind: "claimed", deviceName: event.payload.deviceName });
          onPaired?.();
        }
      }
    }
  );

  // Poll fallback in case the realtime claim event is missed.
  useEffect(() => {
    if (pair.kind !== "pending") return;
    const { pairingId } = pair.pairing;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const status = await getDevicePairingAction(pairingId);
        if (cancelled) return;
        if (status.status === "claimed") {
          setPair({ kind: "claimed", deviceName: "Phone camera" });
          onPaired?.();
        } else if (status.status === "expired") {
          setPair({ kind: "error", message: "Pairing code expired. Generate a new one." });
        }
      } catch {
        // transient — keep polling
      }
    }, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pair]);

  async function startPairing() {
    setPair({ kind: "creating" });
    try {
      const pairing = await createDevicePairingAction();
      setPair({ kind: "pending", pairing });
    } catch {
      setPair({ kind: "error", message: "Couldn't create a pairing code. Try again." });
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-md rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-neutral">Add a device</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Phone camera pairing — the live primary action. */}
        <section className="flex flex-col gap-3 rounded-lg border border-base-content/10 bg-base-content/[0.02] p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CameraIcon size={18} />
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-semibold text-neutral">Connect a phone camera</span>
              <span className="text-xs text-base-content/55">
                Pair a phone running the field app as a live camera.
              </span>
            </div>
          </div>

          <PairingBody pair={pair} onStart={startPairing} />
        </section>

        {/* Fleet preview — not yet registerable. */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
            Coming soon
          </span>
          <ul className="flex flex-col gap-2">
            {families.map((family) => (
              <li
                key={family.code}
                className="flex items-center gap-3 rounded-lg border border-base-content/10 bg-base-content/[0.02] px-3.5 py-3 opacity-70"
              >
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {family.icon}
                </span>
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-neutral">{family.code}</span>
                  <span className="text-xs text-base-content/55">{family.name}</span>
                </div>
                <span className="ml-auto rounded bg-base-content/10 px-2 py-1 text-xs font-semibold uppercase tracking-wider text-base-content/55">
                  Coming soon
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </dialog>
  );
}

function PairingBody({ pair, onStart }: { pair: PairState; onStart: () => void }) {
  if (pair.kind === "claimed") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5 text-sm font-medium text-success">
        <CheckIcon />
        <span className="truncate">Paired: {pair.deviceName}</span>
      </div>
    );
  }

  if (pair.kind === "pending") {
    const url = `${FIELD_APP_URL}/pair?code=${encodeURIComponent(pair.pairing.code)}`;
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-base-content/55">Enter this code in the field app:</span>
          <StatusPill tone="accent" label="Waiting for phone" />
        </div>
        <div className="select-all rounded-md border border-base-content/15 bg-base-100 px-4 py-3 text-center font-mono text-2xl font-semibold tracking-[0.3em] text-neutral">
          {pair.pairing.code}
        </div>
        <p className="text-xs leading-relaxed text-base-content/55">
          …or open{" "}
          <a href={url} className="break-all font-medium text-primary underline" target="_blank" rel="noreferrer">
            {url}
          </a>{" "}
          on the phone (must be signed into the same organization).
        </p>
      </div>
    );
  }

  if (pair.kind === "error") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-error">{pair.message}</p>
        <PairButton label="Try again" onClick={onStart} />
      </div>
    );
  }

  return (
    <PairButton
      label={pair.kind === "creating" ? "Generating…" : "Generate pairing code"}
      onClick={onStart}
      disabled={pair.kind === "creating"}
    />
  );
}

function PairButton({
  label,
  onClick,
  disabled
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex w-fit items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-60"
    >
      {label}
    </button>
  );
}

function CheckIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
