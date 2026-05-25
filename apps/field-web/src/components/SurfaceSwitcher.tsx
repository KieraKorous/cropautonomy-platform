import { Link, useLocation } from "react-router-dom";

import type { OverlayVariant } from "./OverlayChrome.js";

// Floating segmented toggle used only on /capture and /map. Bottom-center,
// safe-area aware. Two-state, one tap, no swiping required (glove-tolerant).
//
// Rendered separately from OverlayChrome because list pages (queue, settings)
// don't need it and shouldn't pay the visual cost of a persistent bottom
// affordance there.

export function SurfaceSwitcher({ variant = "dark" }: { variant?: OverlayVariant }) {
  const { pathname } = useLocation();
  const onCamera = pathname.startsWith("/capture");
  const onMap = pathname.startsWith("/map");

  const surface =
    variant === "dark"
      ? "bg-black/45 backdrop-blur-md"
      : "bg-base-100/90 backdrop-blur border border-base-content/10";

  return (
    <div className="safe-bottom pointer-events-none fixed bottom-0 left-1/2 z-30 -translate-x-1/2 px-3 pb-4">
      <nav
        className={`pointer-events-auto flex h-12 items-stretch overflow-hidden rounded-full p-1 ${surface}`}
        aria-label="Switch surface"
      >
        <SwitchButton to="/capture" label="Camera" active={onCamera} variant={variant}>
          <CameraIcon />
        </SwitchButton>
        <SwitchButton to="/map" label="Map" active={onMap} variant={variant}>
          <MapIcon />
        </SwitchButton>
      </nav>
    </div>
  );
}

function SwitchButton({
  to,
  label,
  active,
  variant,
  children
}: {
  to: string;
  label: string;
  active: boolean;
  variant: OverlayVariant;
  children: React.ReactNode;
}) {
  const activeStyle =
    variant === "dark" ? "bg-white text-neutral" : "bg-neutral text-neutral-content";
  const inactiveStyle =
    variant === "dark" ? "text-white/80 hover:text-white" : "text-base-content/70 hover:text-neutral";

  return (
    <Link
      to={to}
      aria-label={label}
      aria-pressed={active}
      className={`flex items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition ${
        active ? activeStyle : inactiveStyle
      }`}
    >
      {children}
      <span>{label}</span>
    </Link>
  );
}

function CameraIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}
