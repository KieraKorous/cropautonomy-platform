import { deviceSpec, type DeviceKind } from "../device";

// Coverage is partitioned among *peers of the same class*, not across the whole
// fleet. Rovers divide the field between rovers; drones between drones.
//
// Why: a drone surveys from above while rovers work the rows — they aren't doing
// the same job, so splitting the field between them would be wrong. With
// peer-class partitioning, 1 rover + 1 drone each cover the whole field, which is
// what you'd actually want; 2 rovers + 1 drone gives each rover a half and the
// drone the lot.

export interface PeerSlot {
  /** This device's position among its own class. */
  ordinal: number;
  /** How many devices share its class. */
  count: number;
}

export function peerIndex(devices: DeviceKind[], index: number): PeerSlot {
  const aerial = deviceSpec(devices[index] ?? "gaia_r").flies;
  let ordinal = 0;
  let count = 0;
  for (let i = 0; i < devices.length; i++) {
    if (deviceSpec(devices[i]).flies !== aerial) continue;
    if (i < index) ordinal += 1;
    count += 1;
  }
  return { ordinal, count: Math.max(1, count) };
}
