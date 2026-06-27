import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Base({ size = 16, strokeWidth = 1.8, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth as number}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {children}
    </svg>
  );
}

export function ArrowRight(props: IconProps) {
  return (
    <Base size={14} strokeWidth={2} {...props}>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </Base>
  );
}

export function Check(props: IconProps) {
  return (
    <Base size={14} strokeWidth={2.5} {...props}>
      <path d="M20 6 9 17l-5-5" />
    </Base>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </Base>
  );
}

export function FilmIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <rect x="2.5" y="4" width="19" height="16" rx="2" />
      <path d="M7 4v16M17 4v16M2.5 9h4.5M2.5 15h4.5M17 9h4.5M17 15h4.5" />
    </Base>
  );
}

export function RowsIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </Base>
  );
}

export function RotateCcwIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </Base>
  );
}

export function BrainIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
      <circle cx="8.5" cy="13.5" r="1.5" />
      <circle cx="15.5" cy="13.5" r="1.5" />
    </Base>
  );
}

export function RoverIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <rect height="10" rx="2" width="18" x="3" y="11" />
      <circle cx="8" cy="18" r="2" />
      <circle cx="16" cy="18" r="2" />
      <path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
    </Base>
  );
}

export function DroneIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M12 2v4" />
      <path d="M3 7l9 5 9-5" />
      <path d="M21 7v10l-9 5-9-5V7" />
    </Base>
  );
}

export function SensorIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M7.5 21 12 5l4.5 16" />
      <path d="M9.4 15h5.2" />
      <circle cx="12" cy="3.5" r="1" />
      <path d="M9.6 3.9a3.3 3.3 0 0 1 4.8 0" />
    </Base>
  );
}

export function SimulatorIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M12 17v4" />
      <path d="M8 21h8" />
      <path d="m10.5 8 4 2.5-4 2.5Z" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </Base>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </Base>
  );
}

export function GridIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <rect height="18" rx="2" width="18" x="3" y="3" />
      <path d="M9 9h6v6H9z" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z" />
    </Base>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <circle cx="12" cy="12" r="10" />
      <line x1="2" x2="22" y1="12" y2="12" />
      <path d="M12 2a15 15 0 0 1 0 20" />
      <path d="M12 2a15 15 0 0 0 0 20" />
    </Base>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="m22 11-3 3-3-3" />
      <path d="M16 11h6" />
    </Base>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <Base size={22} {...props}>
      <path d="M3 3v18h18" />
      <path d="m7 14 4-4 4 4 5-5" />
    </Base>
  );
}

export function HomeIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <path d="M3 12 12 3l9 9" />
      <path d="M5 10v10h14V10" />
    </Base>
  );
}

export function FarmIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <path d="M3 21h18" />
      <path d="M5 21V8l7-5 7 5v13" />
      <path d="M9 21v-6h6v6" />
    </Base>
  );
}

export function ChecklistIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <path d="M9 11l3 3 8-8" />
      <path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" />
    </Base>
  );
}

export function CogIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Base>
  );
}

export function LiveIcon(props: IconProps) {
  return (
    <Base size={16} {...props}>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.5 8.5a5 5 0 0 0 0 7" />
      <path d="M15.5 15.5a5 5 0 0 0 0-7" />
      <path d="M5.5 5.5a9 9 0 0 0 0 13" />
      <path d="M18.5 18.5a9 9 0 0 0 0-13" />
    </Base>
  );
}

export function MapPinIcon(props: IconProps) {
  return (
    <Base size={13} {...props}>
      <path d="M12 22s-8-6-8-13a8 8 0 0 1 16 0c0 7-8 13-8 13z" />
      <circle cx="12" cy="9" r="2.5" />
    </Base>
  );
}
