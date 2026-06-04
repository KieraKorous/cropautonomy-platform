import type { ComponentType } from "react";
import { CameraIcon, CogIcon, DroneIcon, RoverIcon, SensorIcon, SimulatorIcon, type Tone } from "@gaia/ui";
import type { Device, DeviceFamily, DeviceStatus } from "../../../lib/api";

// Shared device presentation — the family icon/label and status pill mapping are
// used by both the grid cards and the detail modal, so they live here.

type IconType = ComponentType<{ size?: number }>;

const FAMILY: Record<DeviceFamily, { label: string; Icon: IconType }> = {
  gaia_r: { label: "Ground rover", Icon: RoverIcon },
  gaia_d: { label: "Aerial drone", Icon: DroneIcon },
  gaia_s: { label: "Sensor station", Icon: SensorIcon },
  phone: { label: "Phone camera", Icon: CameraIcon },
  third_party: { label: "Third-party device", Icon: CogIcon },
  simulator: { label: "Simulator", Icon: SimulatorIcon }
};

export function deviceFamilyMeta(family: DeviceFamily): { label: string; Icon: IconType } {
  return FAMILY[family] ?? { label: family, Icon: CogIcon };
}

const STATUS: Record<DeviceStatus, { label: string; tone: Tone }> = {
  unregistered: { label: "Unregistered", tone: "muted" },
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "muted" },
  maintenance: { label: "Maintenance", tone: "accent" },
  retired: { label: "Retired", tone: "muted" }
};

export function deviceStatusDisplay(status: DeviceStatus): { label: string; tone: Tone } {
  return STATUS[status] ?? { label: status, tone: "muted" };
}

// The name shown on cards / headers: operator nickname first, then the
// registration name, then a placeholder.
export function deviceName(device: Device): string {
  return device.nickname || device.displayName || "Unnamed device";
}
