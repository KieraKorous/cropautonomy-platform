import {
  ApiError,
  getMe,
  listFields,
  listMembers,
  listMyTeams,
  listScoutTasks,
  listTeams,
  type FieldSummary,
  type MyTeam,
  type OrgMember,
  type ScoutTaskSummary,
  type TeamSummary
} from "../../../lib/api";
import { TeamFilter } from "../_components/TeamFilter";
import { ScoutListView } from "./ScoutListView";

// Today's scout list — the day's checks and walk-outs, assigned to the crew
// working each field. Team-scoped: a member sees tasks on their team(s) plus any
// unassigned (org-wide) tasks; admins/owners see everything. See
// docs/architecture/authentication-and-tenancy.md § Teams.
export const dynamic = "force-dynamic";

export default async function ScoutListPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;

  let tasks: ScoutTaskSummary[] = [];
  let orgId = "";
  let loadError: string | null = null;
  let myTeams: MyTeam[] = [];
  let teams: TeamSummary[] = [];
  let members: OrgMember[] = [];
  let fields: FieldSummary[] = [];
  let canAssignTeams = false;
  let canManage = false;
  let canComplete = false;

  try {
    const result = await listScoutTasks({ teamId: team });
    tasks = result.tasks;
    canAssignTeams = result.canAssignTeams;
    canManage = result.canManage;
    canComplete = result.canComplete;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the scout list service.";
  }

  // All org teams (team selector) + members (assignee picker) — non-fatal.
  try {
    teams = (await listTeams()).teams;
  } catch {
    teams = [];
  }
  try {
    members = (await listMembers()).members;
  } catch {
    members = [];
  }
  try {
    fields = (await listFields()).fields;
  } catch {
    fields = [];
  }
  try {
    myTeams = (await listMyTeams()).teams;
  } catch {
    myTeams = [];
  }
  // orgId scopes the live scout-task feed. Non-fatal.
  try {
    orgId = (await getMe()).orgId;
  } catch {
    orgId = "";
  }

  const openCount = tasks.filter((t) => t.status !== "done").length;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">
            Today&apos;s scout list
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            The day&apos;s checks and walk-outs, assigned to the crew working each field.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <TeamFilter teams={myTeams} />
          {!loadError && openCount > 0 ? (
            <span className="text-sm text-base-content/55">
              {openCount} open
            </span>
          ) : null}
        </div>
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <ScoutListView
          tasks={tasks}
          orgId={orgId}
          teams={teams}
          members={members}
          fields={fields}
          canAssignTeams={canAssignTeams}
          canManage={canManage}
          canComplete={canComplete}
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
        The scout list isn&apos;t loading right now. Refresh in a moment — if it keeps
        happening, make sure you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
