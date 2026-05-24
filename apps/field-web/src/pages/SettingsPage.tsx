import { useNavigate } from "react-router-dom";
import { useClerk, useUser } from "@clerk/clerk-react";

import { Hud } from "../components/Hud.js";
import { useActiveSession } from "../lib/session.js";
import { env } from "../env.js";

export function SettingsPage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { session, end } = useActiveSession();

  return (
    <div className="flex h-full flex-col">
      <Hud queueCount={0} sessionStatus={session?.status ?? "off"} />
      <main className="safe-bottom flex flex-1 flex-col gap-6 px-5 py-6">
        <header className="flex items-end justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-base-content/55">
              Settings
            </p>
            <h1 className="mt-1 text-xl font-semibold text-neutral">Operator</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-md bg-neutral px-3 py-1.5 text-sm font-semibold text-neutral-content"
          >
            Done
          </button>
        </header>

        <section className="rounded-md border border-base-content/10 bg-base-100 p-4">
          <p className="text-sm font-medium text-neutral">
            {user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? "Signed in"}
          </p>
          <p className="mt-0.5 text-xs text-base-content/55">
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
              className="mt-3 rounded-md border border-error/40 bg-error/10 px-3 py-1.5 text-sm font-medium text-error"
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
          className="mt-auto rounded-md border border-base-content/15 px-3 py-2 text-sm font-medium text-neutral hover:bg-base-content/[0.04]"
        >
          Sign out
        </button>
      </main>
    </div>
  );
}
