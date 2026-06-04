import type { ComponentType } from "react";
import {
  CameraIcon,
  ChartIcon,
  CogIcon,
  DroneIcon,
  GlobeIcon,
  MapPinIcon,
  RoverIcon,
  SensorIcon,
  SimulatorIcon,
  type Tone
} from "@gaia/ui";
import type { Device, DeviceAppearance, DeviceFamily, DeviceStatus } from "../../../lib/api";

// Shared device presentation — the family icon/label, status pill mapping, and
// the per-device card visual are used by both the grid cards and the detail
// modal, so they live here.

type IconType = ComponentType<{ size?: number }>;

// The glyphs an operator can pick from for a device's card. Keys are stored in
// metadata, so they must stay stable.
export const APPEARANCE_ICONS: { key: string; label: string; Icon: IconType }[] = [
  { key: "rover", label: "Rover", Icon: RoverIcon },
  { key: "drone", label: "Drone", Icon: DroneIcon },
  { key: "sensor", label: "Sensor", Icon: SensorIcon },
  { key: "camera", label: "Camera", Icon: CameraIcon },
  { key: "simulator", label: "Monitor", Icon: SimulatorIcon },
  { key: "cog", label: "Gear", Icon: CogIcon },
  { key: "mappin", label: "Pin", Icon: MapPinIcon },
  { key: "globe", label: "Globe", Icon: GlobeIcon },
  { key: "chart", label: "Chart", Icon: ChartIcon }
];
const ICON_BY_KEY: Record<string, IconType> = Object.fromEntries(
  APPEARANCE_ICONS.map((i) => [i.key, i.Icon])
);

// Palette colors an operator can tint the glyph with. `varName` is a theme CSS
// custom property (see packages/ui/src/theme.css) so we never build dynamic
// Tailwind classes — the value is applied via inline style + color-mix.
export const APPEARANCE_COLORS: { key: string; label: string; varName: string }[] = [
  { key: "primary", label: "Forest", varName: "--color-primary" },
  { key: "accent", label: "Amber", varName: "--color-accent" },
  { key: "info", label: "Sky", varName: "--color-info" },
  { key: "success", label: "Green", varName: "--color-success" },
  { key: "warning", label: "Gold", varName: "--color-warning" },
  { key: "error", label: "Rust", varName: "--color-error" },
  { key: "secondary", label: "Slate", varName: "--color-secondary" },
  { key: "neutral", label: "Ink", varName: "--color-neutral" }
];
const COLOR_VAR: Record<string, string> = Object.fromEntries(
  APPEARANCE_COLORS.map((c) => [c.key, c.varName])
);

export function colorVarName(key: string | undefined): string {
  return (key && COLOR_VAR[key]) || "--color-primary";
}

const FAMILY: Record<DeviceFamily, { label: string; iconKey: string }> = {
  gaia_r: { label: "Ground rover", iconKey: "rover" },
  gaia_d: { label: "Aerial drone", iconKey: "drone" },
  gaia_s: { label: "Sensor station", iconKey: "sensor" },
  phone: { label: "Phone camera", iconKey: "camera" },
  third_party: { label: "Third-party device", iconKey: "cog" },
  simulator: { label: "Simulator", iconKey: "simulator" }
};

export function familyIconKey(family: DeviceFamily): string {
  return FAMILY[family]?.iconKey ?? "cog";
}

export function deviceFamilyMeta(family: DeviceFamily): { label: string; Icon: IconType } {
  const fam = FAMILY[family];
  return { label: fam?.label ?? family, Icon: (fam && ICON_BY_KEY[fam.iconKey]) ?? CogIcon };
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

// --- Card visual ----------------------------------------------------------

export type ResolvedVisual =
  | { kind: "image"; image: string }
  | { kind: "icon"; Icon: IconType; colorVar: string };

// Effective visual for a device: the operator's explicit appearance override if
// present and valid, otherwise the family default glyph in forest green.
export function resolveVisual(
  appearance: DeviceAppearance | null | undefined,
  family: DeviceFamily
): ResolvedVisual {
  if (appearance?.type === "image" && appearance.image) {
    return { kind: "image", image: appearance.image };
  }
  const iconKey = (appearance?.type === "icon" && appearance.icon) || familyIconKey(family);
  const Icon = ICON_BY_KEY[iconKey] ?? deviceFamilyMeta(family).Icon;
  const colorKey = appearance?.type === "icon" ? appearance.color : undefined;
  return { kind: "icon", Icon, colorVar: colorVarName(colorKey) };
}

export function deviceVisual(device: Device): ResolvedVisual {
  return resolveVisual(device.appearance, device.deviceFamily);
}

// Fills its container — an uploaded photo (cover-cropped) or a large centered
// glyph on a tint of the chosen color. Callers size + clip the container and
// layer name/status on top.
export function DeviceVisual({
  visual,
  alt,
  iconSize = 56,
  className = ""
}: {
  visual: ResolvedVisual;
  alt?: string;
  iconSize?: number;
  className?: string;
}) {
  if (visual.kind === "image") {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={visual.image} alt={alt ?? "Device image"} className={`h-full w-full object-cover ${className}`} />
    );
  }
  const { Icon } = visual;
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${className}`}
      style={{
        backgroundColor: `color-mix(in srgb, var(${visual.colorVar}) 14%, transparent)`,
        color: `var(${visual.colorVar})`
      }}
    >
      <Icon size={iconSize} />
    </div>
  );
}
