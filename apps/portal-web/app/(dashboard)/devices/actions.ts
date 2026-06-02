"use server";

import {
  createDevicePairing,
  getDevicePairing,
  type CreateDevicePairingResponse,
  type DevicePairingStatus
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
