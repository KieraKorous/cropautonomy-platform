import {
  ApiError,
  getMe,
  listMyTeams,
  listRecordings,
  listTeams,
  type CaptureSummary,
  type MyTeam,
  type TeamSummary
} from "../../../lib/api";
import { TeamFilter } from "../_components/TeamFilter";
import { RecordingsView } from "./RecordingsView";

// Saved live-feed recordings — kind='session_recording' video captures, from
// either the field phone (during a live session) or a portal watcher recording
// the stream. Kept apart from the Captures grid (those are still observations).
export const dynamic = "force-dynamic";

export default async function RecordingsPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;

  let recordings: CaptureSummary[] = [];
  let orgId = "";
  let loadError: string | null = null;
  let myTeams: MyTeam[] = [];
  // All org teams for the per-recording team selector; canAssignTeams gates it.
  let teams: TeamSummary[] = [];
  let canAssignTeams = false;

  try {
    const result = await listRecordings({ limit: 50, teamId: team });
    recordings = result.captures;
    canAssignTeams = result.canAssignTeams ?? false;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : "Could not reach the captures service.";
  }

  try {
    teams = (await listTeams()).teams;
  } catch {
    teams = [];
  }

  // orgId scopes the live capture feed. Non-fatal — the list still renders.
  try {
    orgId = (await getMe()).orgId;
  } catch {
    orgId = "";
  }

  try {
    myTeams = (await listMyTeams()).teams;
  } catch {
    myTeams = [];
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Recordings</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Saved live-session recordings — captured on the operator&apos;s phone or
            recorded from the live wall.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TeamFilter teams={myTeams} />
          {!loadError && recordings.length > 0 ? (
            <span className="text-sm text-base-content/55">
              {recordings.length} {recordings.length === 1 ? "recording" : "recordings"}
            </span>
          ) : null}
        </div>
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <RecordingsView
          recordings={recordings}
          orgId={orgId}
          teams={teams}
          canAssignTeams={canAssignTeams}
        />
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
        Recordings aren&apos;t loading right now. Refresh in a moment — if it keeps happening,
        make sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
