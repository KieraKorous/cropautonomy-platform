"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon, StatusPill } from "@gaia/ui";
import type { Device, TeamSummary } from "../../../lib/api";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { DeviceDetailModal } from "./DeviceDetailModal";
import {
  DeviceVisual,
  deviceActivityStatus,
  deviceFamilyMeta,
  deviceName,
  deviceVisual,
  formatRelativeTime
} from "./deviceDisplay";

// Devices grid: a card per registered device plus the dashed "add device" tile.
// Clicking a card opens the detail modal (rename / retire / delete); the add
// tile opens the pairing dialog. Devices are fetched on the server and passed
// in, so opening a modal never re-hits the API.
export function DevicesGrid({
  devices,
  canManage,
  teams
}: {
  devices: Device[];
  canManage: boolean;
  teams: TeamSummary[];
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
        teams={teams}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function DeviceCard({ device, onOpen }: { device: Device; onOpen: () => void }) {
  const { label } = deviceFamilyMeta(device.deviceFamily);
  const status = deviceActivityStatus(device);
  const visual = deviceVisual(device);
  const name = deviceName(device);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex aspect-square overflow-hidden rounded-xl border border-base-content/10 bg-base-100 text-left transition-colors hover:border-primary/40"
    >
      {/* Visual fills the whole card — uploaded photo or a large tinted glyph. */}
      <div className="absolute inset-0">
        <DeviceVisual
          visual={visual}
          alt={name}
          iconSize={64}
          className="transition-transform duration-300 ease-out group-hover:scale-[1.04]"
        />
      </div>

      <div className="absolute right-2 top-2 z-10">
        <StatusPill label={status.label} tone={status.tone} />
      </div>

      {/* Name sits on a scrim so it stays legible over any photo or tint. */}
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-neutral/85 via-neutral/45 to-transparent px-3 pb-2.5 pt-9">
        <span className="block truncate text-sm font-semibold text-neutral-content" title={name}>
          {name}
        </span>
        <span className="block truncate text-xs text-neutral-content/70">
          {label} · {device.live ? "In use now" : `Used ${formatRelativeTime(device.lastUsedAt)}`}
        </span>
      </div>
    </button>
  );
}
