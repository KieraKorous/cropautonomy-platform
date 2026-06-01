"use client";

import { useEffect, useRef } from "react";
import { DroneIcon, MapPinIcon, RoverIcon } from "@gaia/ui";

// Device families mirror the `device_family` enum in
// packages/db/migrations/0003_geography_and_devices.sql. Shown here as a
// disabled preview of what registration will eventually offer. GAIA-S has no
// dedicated icon yet, so it borrows MapPinIcon (a stationary node).
const families = [
  { code: "GAIA-R", name: "Ground rover", icon: <RoverIcon size={18} /> },
  { code: "GAIA-D", name: "Aerial drone", icon: <DroneIcon size={18} /> },
  { code: "GAIA-S", name: "Sensor station", icon: <MapPinIcon size={18} /> }
];

// Lightweight placeholder modal. There's no portal modal pattern yet, so this
// drives a native <dialog> off an `open` prop — Escape and backdrop click close
// for free. Replace with the real registration flow when the devices API lands.
export function AddDeviceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Backdrop click: the <dialog> element itself is the backdrop, so a
        // click landing directly on it (not the inner panel) should close.
        if (event.target === ref.current) onClose();
      }}
      className="m-auto w-full max-w-md rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <div className="flex flex-col gap-5 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <span className="w-fit rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
              Work in progress
            </span>
            <h2 className="text-lg font-semibold text-neutral">Add a device</h2>
          </div>
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

        <p className="text-sm leading-relaxed text-base-content/65">
          Device registration isn&apos;t wired up yet. Here&apos;s the fleet you&apos;ll be able to
          enroll once it lands.
        </p>

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
    </dialog>
  );
}
