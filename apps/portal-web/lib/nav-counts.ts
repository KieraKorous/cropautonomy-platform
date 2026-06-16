import {
  listDevices,
  listFields,
  listLiveSessions,
  type Device,
  type LiveSessionSummary
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
}

export const EMPTY_NAV_COUNTS: NavCounts = {
  liveSessions: 0,
  farms: 0,
  fields: 0,
  devicesActive: 0,
  devicesTotal: 0,
  devicesMaintenance: 0
};

export async function loadNavCounts(): Promise<NavCounts> {
  const [live, fieldsResult, devicesResult] = await Promise.all([
    listLiveSessions().catch(() => ({ sessions: [] as LiveSessionSummary[], orgId: "" })),
    listFields().catch(() => ({ fields: [] })),
    listDevices().catch(() => ({ devices: [] as Device[] }))
  ]);

  const devices = devicesResult.devices;
  return {
    liveSessions: live.sessions.length,
    farms: new Set(fieldsResult.fields.map((f) => f.farmId)).size,
    fields: fieldsResult.fields.length,
    devicesActive: devices.filter((d) => d.status === "active").length,
    devicesTotal: devices.length,
    devicesMaintenance: devices.filter((d) => d.status === "maintenance").length
  };
}
