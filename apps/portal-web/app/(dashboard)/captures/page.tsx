import {
  ApiError,
  getMe,
  listCaptures,
  listMyTeams,
  type CaptureSummary,
  type MyTeam
} from "../../../lib/api";
import { TeamFilter } from "../_components/TeamFilter";
import { CapturesView } from "./CapturesView";

// Captures table — every observation the platform has ingested, newest first.
// Analysis runs asynchronously, so rows reflect in-flight state until a plant
// type lands. See docs/architecture/capture-pipeline.md.
export const dynamic = "force-dynamic";

export default async function CapturesPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;

  let captures: CaptureSummary[] = [];
  let orgId = "";
  let loadError: string | null = null;
  let myTeams: MyTeam[] = [];

  try {
    // Session recordings live in their own Recordings section, not the grid.
    const result = await listCaptures({ limit: 50, kind: "observation", teamId: team });
    captures = result.captures;
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? err.message
        : "Could not reach the captures service.";
  }

  // orgId scopes the live capture feed. Non-fatal if it fails — the list still
  // renders, just without live updates.
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
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Captures</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Every photo, burst, and video collected across the operation — from the field app and
            connected devices.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TeamFilter teams={myTeams} />
          {!loadError && captures.length > 0 ? (
            <span className="text-sm text-base-content/55">
              {captures.length} {captures.length === 1 ? "capture" : "captures"}
            </span>
          ) : null}
        </div>
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <CapturesView captures={captures} orgId={orgId} />
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
        Captures aren&apos;t loading right now. Refresh in a moment — if it keeps happening,
        make sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
