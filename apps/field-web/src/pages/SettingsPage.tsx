import { useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";

import { ChromeLayout } from "../components/ChromeLayout.js";
import { useActiveSession } from "../lib/session.js";
import { env } from "../env.js";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { session, end } = useActiveSession();

  return (
    <ChromeLayout eyebrow="Settings" title="Operator">
      <div className="flex h-full flex-col gap-6 px-5 pb-8 pt-5">
        <section className="rounded-md border border-base-content/10 bg-base-100 p-4">
          <p className="text-base font-medium text-neutral">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
          </p>
          <p className="mt-1 text-sm text-base-content/55">
            {user?.primaryEmailAddress?.emailAddress}
          </p>
        </section>

        {session && (
          <section className="rounded-md border border-base-content/10 bg-base-100 p-4">
            <p className="text-xs uppercase tracking-wider text-base-content/55">
              Active session
            </p>
            <p className="mt-1 text-sm text-neutral">
              Started {new Date(session.startedAt).toLocaleTimeString()}
            </p>
            <button
              type="button"
              onClick={async () => {
                await end();
                navigate("/", { replace: true });
              }}
              className="mt-3 flex h-12 items-center rounded-md border border-error/40 bg-error/10 px-4 text-sm font-semibold text-error"
            >
              End session
            </button>
          </section>
        )}

        <section className="rounded-md border border-base-content/10 bg-base-100 p-4">
          <p className="text-xs uppercase tracking-wider text-base-content/55">
            Environment
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-base-content/70">
            <dt>API base</dt>
            <dd className="font-mono">{env.apiBase}</dd>
            <dt>Supabase</dt>
            <dd className="truncate font-mono">{env.supabase.url}</dd>
            <dt>STUN</dt>
            <dd className="truncate font-mono">{env.ice.stunUrls.join(", ")}</dd>
            <dt>TURN</dt>
            <dd className="font-mono">{env.ice.turnUrl ?? "not configured"}</dd>
          </dl>
        </section>

        <button
          type="button"
          onClick={() => signOut({ redirectUrl: "/" })}
          className="mt-auto flex h-14 items-center justify-center rounded-md border border-base-content/15 text-base font-semibold text-neutral hover:bg-base-content/[0.04]"
        >
          Sign out
        </button>
      </div>
    </ChromeLayout>
  );
}
