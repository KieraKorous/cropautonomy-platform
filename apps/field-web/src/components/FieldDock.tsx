import { NavLink } from "react-router-dom";

// Bottom dock for the "normal-chrome" pages (session picker, queue, settings).
// Camera + Map are the doer surfaces, Queue is the always-relevant status — those
// are the three things a field operator wants one tap away.
//
// Sizing is tuned for gloved hands: each item is a full-width h-20 (80px) hit
// area with large icons and labels. iOS HIG asks for 44pt; field gear asks for
// a lot more.

export interface FieldDockProps {
  queueCount: number;
}

export function FieldDock({ queueCount }: FieldDockProps) {
  return (
    <nav
      aria-label="Primary"
      className="safe-bottom sticky bottom-0 z-20 grid flex-shrink-0 grid-cols-3 border-t border-base-content/10 bg-base-100/95 backdrop-blur"
    >
      <DockItem to="/capture" label="Camera">
        <CameraIcon />
      </DockItem>
      <DockItem to="/map" label="Map">
        <MapIcon />
      </DockItem>
      <DockItem to="/queue" label="Queue" badge={queueCount > 0 ? queueCount : undefined}>
        <UploadIcon />
      </DockItem>
    </nav>
  );
}

function DockItem({
  to,
  label,
  badge,
  children
}: {
  to: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        `relative flex h-20 flex-col items-center justify-center gap-1 text-xs font-semibold ${
          isActive
            ? "text-primary"
            : "text-base-content/65 hover:text-neutral active:bg-base-content/[0.04]"
        }`
      }
    >
      <span className="relative grid h-8 w-8 place-items-center">
        {children}
        {badge !== undefined && (
          <span className="absolute -right-2 -top-1 grid h-5 min-w-[20px] place-items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-content">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span>{label}</span>
    </NavLink>
  );
}

function CameraIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
      <line x1="8" y1="2" x2="8" y2="18" />
      <line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}
