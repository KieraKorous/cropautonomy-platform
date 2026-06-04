"use server";

import { revalidatePath } from "next/cache";
import {
  createDevicePairing,
  deleteDevice,
  getDevicePairing,
  updateDevice,
  type CreateDevicePairingResponse,
  type Device,
  type DeviceAppearance,
  type DevicePairingStatus,
  type DeviceStatus
} from "../../../lib/api";

// Mint a pairing code for the "Connect phone camera" flow. The dialog renders the
// code/QR and watches the devicePairing realtime channel for the phone's claim.
export async function createDevicePairingAction(): Promise<CreateDevicePairingResponse> {
  return createDevicePairing();
}

// Poll fallback for the dialog if the realtime claim event is missed.
export async function getDevicePairingAction(
  pairingId: string
): Promise<DevicePairingStatus> {
  return getDevicePairing(pairingId);
}

// Rename a device and/or change its status (retire / reactivate), then refresh
// the grid so the card reflects the new name/nickname/status.
export async function updateDeviceAction(
  id: string,
  fields: {
    displayName?: string;
    nickname?: string | null;
    status?: DeviceStatus;
    autoLiveEnabled?: boolean;
    appearance?: DeviceAppearance | null;
  }
): Promise<Device> {
  const device = await updateDevice(id, fields);
  revalidatePath("/devices");
  return device;
}

// Permanently deregister a device, then refresh the grid (the card drops out).
export async function deleteDeviceAction(id: string): Promise<void> {
  await deleteDevice(id);
  revalidatePath("/devices");
}
