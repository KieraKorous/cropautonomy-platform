"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";

// Setup nudge on the Overview. Shown to every user until they've (a) selected or
// created an organization and (b) chosen an avatar — a photo OR the explicit
// "use initials" choice. It clears itself once both are done; there's no manual
// dismiss. `hasOrganization` comes from the server (getMe().orgId); the avatar
// state is read live from Clerk.
export function ProfilePromptBanner({ hasOrganization }: { hasOrganization: boolean }) {
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) return null;

  const avatarChosen = user.hasImage || Boolean(user.unsafeMetadata?.useInitials);
  if (hasOrganization && avatarChosen) return null;

  const steps: string[] = [];
  if (!hasOrganization) steps.push("Choose or create your organization");
  if (!avatarChosen) steps.push("Add a profile photo, or use your initials");

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/20 bg-primary/[0.06] px-5 py-4">
      <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-sm font-semibold text-neutral">Finish setting up your profile</span>
        <ul className="flex flex-col gap-0.5">
          {steps.map((s) => (
            <li key={s} className="flex items-center gap-2 text-sm text-base-content/65">
              <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/60" />
              {s}
            </li>
          ))}
        </ul>
      </div>
      <Link
        href="/profile"
        className="flex-shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
      >
        Set up profile
      </Link>
    </div>
  );
}
