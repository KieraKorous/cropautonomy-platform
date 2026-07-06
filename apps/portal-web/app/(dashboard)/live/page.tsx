import { auth } from "@clerk/nextjs/server";

import {
  ApiError,
  listLiveRequests,
  listLiveSessions,
  listMyTeams,
  type LiveRequestSummary,
  type LiveSessionSummary,
  type MyTeam
} from "../../../lib/api";
import { TeamFilter } from "../_components/TeamFilter";
import { LiveWall } from "./LiveWall";
import { PendingRequests } from "./PendingRequests";

// Live — a wall of in-flight Field Capture sessions, one camera per session.
// Seeds from the API, then stays fresh over the org-wide active-sessions
// channel. See docs/architecture/realtime-strategy.md (WebRTC live preview).
export const dynamic = "force-dynamic";

export default async function LivePage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;

  let sessions: LiveSessionSummary[] = [];
  let pendingRequests: LiveRequestSummary[] = [];
  let orgId = "";
  let loadError: string | null = null;
  let myTeams: MyTeam[] = [];

  try {
    const [sessionsResult, requestsResult] = await Promise.all([
      listLiveSessions({ teamId: team }),
      listLiveRequests("pending").catch(() => null)
    ]);
    sessions = sessionsResult.sessions;
    orgId = sessionsResult.orgId;
    if (requestsResult) pendingRequests = requestsResult.requests;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : "Could not reach the live service.";
  }

  try {
    myTeams = (await listMyTeams()).teams;
  } catch {
    myTeams = [];
  }

  const { userId } = await auth();

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Live</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Watch field cameras in real time. Click a camera to widen it; the rest collapse into a
            strip below.
          </p>
        </div>
        <TeamFilter teams={myTeams} />
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : !orgId || !userId ? (
        <ErrorState message="No active organization for this session." />
      ) : (
        <>
          <PendingRequests orgId={orgId} initialRequests={pendingRequests} />
          <LiveWall orgId={orgId} viewerUserId={userId} initialSessions={sessions} />
        </>
      )}
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <span className="rounded-full bg-error/15 px-2.5 py-1 text-xs font-semibold text-error">
        Off the grid
      </span>
      <h2 className="text-base font-semibold text-neutral">
        We&apos;ve lost the line to the field.
      </h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Live cameras aren&apos;t coming through right now. Refresh in a moment — if it keeps
        happening, make sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
