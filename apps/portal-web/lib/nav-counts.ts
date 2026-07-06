import {
  listDevices,
  listFarms,
  listFields,
  listLiveSessions,
  listTeams,
  type Device,
  type FarmSummary,
  type LiveSessionSummary,
  type TeamSummary
} from "./api";

// Real, org-scoped counts for the sidebar nav badges + fleet pulse card. Every
// source here returns a complete list, so these counts are exact (unlike the
// captures backlog, which has no count endpoint yet — its badge is omitted).
export interface NavCounts {
  liveSessions: number;
  farms: number;
  fields: number;
  devicesActive: number;
  devicesTotal: number;
  devicesMaintenance: number;
  teams: number;
}

export const EMPTY_NAV_COUNTS: NavCounts = {
  liveSessions: 0,
  farms: 0,
  fields: 0,
  devicesActive: 0,
  devicesTotal: 0,
  devicesMaintenance: 0,
  teams: 0
};

export async function loadNavCounts(): Promise<NavCounts> {
  const [live, farmsResult, fieldsResult, devicesResult, teamsResult] = await Promise.all([
    listLiveSessions().catch(() => ({ sessions: [] as LiveSessionSummary[], orgId: "" })),
    listFarms().catch(() => ({ farms: [] as FarmSummary[] })),
    listFields().catch(() => ({ fields: [] })),
    listDevices().catch(() => ({ devices: [] as Device[] })),
    listTeams().catch(() => ({ teams: [] as TeamSummary[] }))
  ]);

  const devices = devicesResult.devices;
  return {
    liveSessions: live.sessions.length,
    teams: teamsResult.teams.length,
    // Count farms directly now that they're a managed entity — a farm with no
    // fields yet would be invisible if we still derived this from field.farmId.
    farms: farmsResult.farms.length,
    fields: fieldsResult.fields.length,
    // "Active" = the field app is capturing/streaming on the device right now
    // (the org_device_activity `live` flag), matching the Overview's "Fleet on
    // the move" — not the operator lifecycle status. Refreshed on the shell's 30s
    // poll, so the sidebar tracks real activity.
    devicesActive: devices.filter((d) => d.live).length,
    devicesTotal: devices.length,
    devicesMaintenance: devices.filter((d) => d.status === "maintenance").length
  };
}
