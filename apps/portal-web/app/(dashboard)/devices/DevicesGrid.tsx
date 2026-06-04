"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon, StatusPill } from "@gaia/ui";
import type { Device } from "../../../lib/api";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { DeviceDetailModal } from "./DeviceDetailModal";
import { deviceFamilyMeta, deviceName, deviceStatusDisplay } from "./deviceDisplay";

// Devices grid: a card per registered device plus the dashed "add device" tile.
// Clicking a card opens the detail modal (rename / retire / delete); the add
// tile opens the pairing dialog. Devices are fetched on the server and passed
// in, so opening a modal never re-hits the API.
export function DevicesGrid({
  devices,
  canManage
}: {
  devices: Device[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // The open device is looked up by id from the current list, so after an edit
  // revalidates the page the modal reflects the fresh values (or closes if the
  // device was deleted out from under it).
  const selected = selectedId ? devices.find((d) => d.id === selectedId) ?? null : null;

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {devices.map((device) => (
          <DeviceCard key={device.id} device={device} onOpen={() => setSelectedId(device.id)} />
        ))}

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="group flex aspect-square flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-base-content/20 bg-base-100 text-base-content/55 transition-colors hover:border-primary/40 hover:bg-base-content/[0.02] hover:text-primary"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/45 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
            <PlusIcon size={24} />
          </span>
          <span className="text-sm font-medium">Add device</span>
        </button>
      </div>

      <AddDeviceDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        // A newly paired device is a fresh row; refresh so its card appears.
        onPaired={() => router.refresh()}
      />

      <DeviceDetailModal
        device={selected}
        canManage={canManage}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function DeviceCard({ device, onOpen }: { device: Device; onOpen: () => void }) {
  const { label, Icon } = deviceFamilyMeta(device.deviceFamily);
  const status = deviceStatusDisplay(device.status);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex aspect-square flex-col items-start justify-between gap-2 rounded-xl border border-base-content/10 bg-base-100 p-4 text-left transition-colors hover:border-primary/40 hover:bg-base-content/[0.02]"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <span className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/15 transition-colors group-hover:bg-primary/15">
          <Icon size={28} />
        </span>
        <StatusPill label={status.label} tone={status.tone} />
      </div>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold text-neutral" title={deviceName(device)}>
          {deviceName(device)}
        </span>
        <span className="truncate text-xs text-base-content/55">{label}</span>
      </div>
    </button>
  );
}
