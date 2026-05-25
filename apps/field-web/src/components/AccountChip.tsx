import { useClerk, useUser } from "@clerk/clerk-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

// Right-end HUD chip: initials button + popover with identity + Settings + Sign out.
// Lives in the HUD so sign-out is reachable from every page, not just /capture.
// Tap target sized to match the rest of the HUD pills (h-9) for glove use.

function initialsOf(user: ReturnType<typeof useUser>["user"]): string {
  if (!user) return "·";
  const fromName =
    [user.firstName, user.lastName]
      .filter(Boolean)
      .map((part) => part!.charAt(0).toUpperCase())
      .join("") || "";
  if (fromName) return fromName.slice(0, 2);
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  return email.charAt(0).toUpperCase() || "·";
}

export function AccountChip() {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Close on outside tap / Escape.
  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!isLoaded) {
    return (
      <span
        className="flex h-9 w-9 items-center justify-center rounded-md bg-base-content/[0.06]"
        aria-hidden
      />
    );
  }

  const initials = initialsOf(user);
  const displayName =
    user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Operator";
  const email = user?.primaryEmailAddress?.emailAddress;

  async function handleSignOut() {
    setOpen(false);
    await signOut({ redirectUrl: "/" });
    // After Clerk clears the session, App's <RedirectToSignIn /> kicks in.
    navigate("/", { replace: true });
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${displayName}`}
        className={`flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold text-neutral ${
          open
            ? "border-base-content/30 bg-base-content/[0.08]"
            : "border-base-content/15 bg-base-100 hover:bg-base-content/[0.04]"
        }`}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+6px)] z-40 w-64 overflow-hidden rounded-md border border-base-content/15 bg-base-100 shadow-lg"
        >
          <div className="border-b border-base-content/10 px-3 py-3">
            <p className="text-sm font-semibold text-neutral">{displayName}</p>
            {email && email !== displayName && (
              <p className="mt-0.5 truncate text-xs text-base-content/55">
                {email}
              </p>
            )}
          </div>
          <Link
            to="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex h-11 items-center gap-2.5 px-3 text-sm text-neutral hover:bg-base-content/[0.04]"
          >
            <CogIcon />
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            className="flex h-11 w-full items-center gap-2.5 border-t border-base-content/10 px-3 text-left text-sm text-error hover:bg-error/[0.06]"
          >
            <LogoutIcon />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

function CogIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
