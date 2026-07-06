import {
  ApiError,
  listDevices,
  listFarms,
  listFields,
  listMembers,
  listTeams,
  type Device,
  type FarmSummary,
  type FieldSummary,
  type OrgMember,
  type TeamSummary
} from "../../../lib/api";
import { TeamsView } from "./TeamsView";

// Team — the org's crews and the access boundary they carry. Each team scopes
// which farms, fields, devices, and captures its members can see; admins and
// owners see everything. Managers create teams, manage rosters, and assign
// ground here.
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  let teams: TeamSummary[] = [];
  let canManage = false;
  let members: OrgMember[] = [];
  let farms: FarmSummary[] = [];
  let fields: FieldSummary[] = [];
  let devices: Device[] = [];
  let loadError: string | null = null;

  try {
    // Teams are essential; members + the farm/field/device lists feed the
    // detail modal's roster and assignment pickers.
    const [teamsResult, membersResult, farmsResult, fieldsResult, devicesResult] =
      await Promise.all([
        listTeams(),
        listMembers(),
        listFarms(),
        listFields(),
        listDevices()
      ]);
    teams = teamsResult.teams;
    canManage = teamsResult.canManage;
    members = membersResult.members;
    farms = farmsResult.farms;
    fields = fieldsResult.fields;
    devices = devicesResult.devices;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the team service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Team</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            The crews working the operation and the ground each one can see. Group
            operators into teams and assign the farms, fields, and devices they&apos;re
            responsible for.
          </p>
        </div>
        {!loadError && teams.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {teams.length} {teams.length === 1 ? "team" : "teams"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <TeamsView
          teams={teams}
          canManage={canManage}
          members={members}
          farms={farms}
          fields={fields}
          devices={devices}
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
      <h2 className="text-base font-semibold text-neutral">Can&apos;t reach your crews.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Teams aren&apos;t loading right now. Refresh in a moment — if it keeps happening, make sure
        you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
