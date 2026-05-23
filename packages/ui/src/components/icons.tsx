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
