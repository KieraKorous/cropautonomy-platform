import { currentUser } from "@clerk/nextjs/server";
import {
  ArrowRight,
  CameraIcon,
  ChartIcon,
  Check,
  DroneIcon,
  FarmIcon,
  RoverIcon,
  StatCard,
  StatusPill
} from "@gaia/ui";
import type { ReactNode } from "react";

import {
  getMe,
  listCaptures,
  listDevices,
  listFarms,
  listFields,
  listLiveSessions,
  listZones,
  type CaptureSummary,
  type Device,
  type FarmSummary,
  type FieldSummary,
  type ZoneSummary
} from "../../lib/api";
import { FieldMapExplorer } from "./overview/FieldMapExplorer";
import { buildFieldMapData, type FieldMapData } from "./overview/fieldMapData";
import { LiveCountBadge } from "./overview/LiveCountBadge";
import { RecentScansLive } from "./overview/RecentScansLive";

// The Overview reads live, per-account data on every request (Clerk identity +
// org-scoped captures/devices/fields), then hands the live sections to client
// children that subscribe to realtime. force-dynamic because every fetch reads
// the caller's Clerk token. See live/page.tsx for the same pattern.
export const dynamic = "force-dynamic";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default async function Overview() {
  const [
    clerkUser,
    me,
    capturesResult,
    devicesResult,
    farmsResult,
    fieldsResult,
    zonesResult,
    liveResult
  ] = await Promise.all([
    currentUser(),
    getMe().catch(() => null),
    listCaptures({ limit: 12 }).catch(() => ({ captures: [] as CaptureSummary[] })),
    listDevices().catch(() => ({ devices: [] as Device[] })),
    listFarms().catch(() => ({ farms: [] as FarmSummary[] })),
    listFields().catch(() => ({ fields: [] as FieldSummary[] })),
    listZones().catch(() => ({ zones: [] as ZoneSummary[] })),
    listLiveSessions().catch(() => ({ sessions: [], orgId: "" }))
  ]);

  const orgId = me?.orgId ?? liveResult.orgId ?? "";
  const captures = capturesResult.captures;
  const devices = devicesResult.devices;
  const fields = fieldsResult.fields;

  const firstName =
    clerkUser?.firstName ?? me?.user.displayName?.split(/\s+/)[0] ?? "there";

  const fieldNames: Record<string, string> = {};
  for (const f of fields) fieldNames[f.id] = f.name;

  // Shape the field-map inputs (colors, markers, dropdown options, activity pins).
  const mapData = buildFieldMapData(fields, farmsResult.farms, captures, zonesResult.zones);
  const totalAcres = mapData.acres;
  // Count managed farms directly — a farm with no fields yet still counts.
  const farmCount = farmsResult.farms.length;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const capturesToday = captures.filter(
    (c) => new Date(c.capturedAt).getTime() >= startOfToday.getTime()
  ).length;
  const fleetActive = devices.filter((d) => d.status === "active").length;
  const onTheMove = devices.filter(
    (d) => d.status === "active" || d.status === "maintenance"
  );

  return (
    <div className="flex flex-col gap-7">
      <PageHeader firstName={firstName} liveCount={liveResult.sessions.length} orgId={orgId} />

      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<CameraIcon size={16} />}
          label="Captures today"
          meta="Newest appear below"
          value={capturesToday.toLocaleString("en-US")}
        />
        <StatCard
          icon={<FarmIcon size={16} />}
          label="Acres under management"
          meta={`${farmCount} ${farmCount === 1 ? "farm" : "farms"} · ${fields.length} ${
            fields.length === 1 ? "field" : "fields"
          }`}
          value={totalAcres.toLocaleString("en-US")}
        />
        <StatCard
          icon={<RoverIcon size={16} />}
          label="Fleet on the move"
          meta="Devices active right now"
          value={`${fleetActive} of ${devices.length}`}
        />
        <StatCard
          icon={<ChartIcon size={16} />}
          label="Scans this week"
          meta="Sample — weekly rollup coming"
          value="—"
        />
      </div>

      <MapSection mapData={mapData} />

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          {orgId ? (
            <RecentScansLive
              fieldNames={fieldNames}
              initialCaptures={captures}
              orgId={orgId}
            />
          ) : null}
          <ScoutListCard />
        </div>
        <div className="flex flex-col gap-5">
          <FieldConditionsCard />
          <DevicesOnTheMoveCard devices={onTheMove} />
        </div>
      </div>
    </div>
  );
}

// --- Page header ----------------------------------------------------------

function PageHeader({
  firstName,
  liveCount,
  orgId
}: {
  firstName: string;
  liveCount: number;
  orgId: string;
}) {
  const now = new Date();
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric"
  });
  const hour = now.getHours();
  const partOfDay = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-base-content/55">
          <span>{dateLabel}</span>
          <span className="text-base-content/30">·</span>
          {orgId ? (
            <LiveCountBadge initialCount={liveCount} orgId={orgId} />
          ) : null}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral">
          Good {partOfDay}, {firstName}.
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
          Here's what's happening across your operation right now.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          className="flex items-center gap-1.5 rounded-md border border-base-content/15 px-3 py-2 text-sm font-medium text-neutral hover:bg-base-content/[0.04]"
          type="button"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Export weekly
        </button>
        <a
          className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90"
          href="/captures"
        >
          <CameraIcon size={14} />
          New scan
        </a>
      </div>
    </header>
  );
}

// --- Map ------------------------------------------------------------------

function MapSection({ mapData }: { mapData: FieldMapData }) {
  if (!MAPBOX_TOKEN) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
          Map needs setup
        </span>
        <h2 className="text-base font-semibold text-neutral">Field map can't render without a Mapbox token.</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          Set <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> in{" "}
          <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">apps/portal-web/.env.local</code> and restart
          the dev server. Token from{" "}
          <a className="text-primary underline-offset-2 hover:underline" href="https://account.mapbox.com/access-tokens/">
            account.mapbox.com/access-tokens
          </a>
          .
        </p>
      </section>
    );
  }

  return (
    <FieldMapExplorer
      fields={mapData.fieldCollection}
      zones={mapData.zoneCollection}
      farmMarkers={mapData.farmMarkers}
      farmOptions={mapData.farmOptions}
      activityPins={mapData.activityPins}
      acres={mapData.acres}
      mapboxToken={MAPBOX_TOKEN}
      openFullMapHref="/map"
    />
  );
}

// --- Scout list (sample) --------------------------------------------------

const scoutTasks = [
  {
    id: "task-1",
    assignee: { initials: "JM", color: "bg-secondary text-secondary-content" },
    title: "Walk Doniphan F-22 and confirm the tar spot pattern.",
    meta: "Joaquin Mendez · before four this afternoon",
    due: { label: "Due today", tone: "accent" as const },
    done: false
  },
  {
    id: "task-2",
    assignee: { initials: "TW", color: "bg-primary text-primary-content" },
    title: "Clean up volunteer corn in the Nemaha F-04 headlands.",
    meta: "Tomas Whitlow · anytime this week",
    due: { label: "This week" },
    done: false
  },
  {
    id: "task-3",
    assignee: { initials: "MK", color: "bg-accent text-accent-content" },
    title: "Book a battery cell test for Drone 01 before Sunday.",
    meta: "Maya Kapoor · ground service",
    due: { label: "Done" },
    done: true
  }
];

function ScoutListCard() {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-semibold text-neutral">Today's scout list</h2>
          <SampleTag />
        </div>
        <button className="text-sm font-medium text-primary" type="button">
          + New task
        </button>
      </header>
      <ul>
        {scoutTasks.map((task, idx) => (
          <li
            className={`flex items-center gap-3.5 px-5 py-3.5 ${
              idx === scoutTasks.length - 1 ? "" : "border-b border-base-content/6"
            }`}
            key={task.id}
          >
            <ScoutCheckbox done={task.done} />
            <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${task.assignee.color}`}>
              {task.assignee.initials}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`text-sm font-medium ${
                  task.done ? "text-base-content/55 line-through" : "text-neutral"
                }`}
              >
                {task.title}
              </span>
              <span className="text-xs text-base-content/55">{task.meta}</span>
            </div>
            {task.due.tone ? (
              <StatusPill label={task.due.label} tone={task.due.tone} />
            ) : (
              <span className="text-xs text-base-content/55">{task.due.label}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoutCheckbox({ done }: { done: boolean }) {
  if (done) {
    return (
      <span className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border-[1.5px] border-success bg-success/15">
        <Check className="text-success" size={9} />
      </span>
    );
  }
  return <span className="block h-3.5 w-3.5 flex-shrink-0 rounded border-[1.5px] border-base-content/30" />;
}

// --- Field conditions (sample) --------------------------------------------

function FieldConditionsCard() {
  return (
    <section className="flex flex-col rounded-xl border border-base-content/10 bg-base-100 p-5">
      <header className="mb-3.5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-neutral">Field conditions</h3>
          <SampleTag />
        </div>
      </header>
      <div className="mb-3.5 grid grid-cols-2 gap-3">
        <WeatherStat label="Air temp" value="71 °F" />
        <WeatherStat label="Wind" sublabel="SW · easing" value="8.4 mph" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <WeatherStat label="Humidity" value="62 %" />
        <WeatherStat label="Rain · 24h" value="0.04 in" />
      </div>
      <div className="mt-3.5 border-t border-base-content/8 pt-3.5">
        <a className="flex items-center gap-1 text-xs font-semibold text-primary" href="#">
          Full forecast <ArrowRight />
        </a>
      </div>
    </section>
  );
}

function WeatherStat({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-base-content/55">{label}</span>
      <span className="text-xl font-semibold leading-none text-neutral">{value}</span>
      {sublabel && <span className="text-xs text-base-content/55">{sublabel}</span>}
    </div>
  );
}

// --- Devices on the move (real) -------------------------------------------

function DevicesOnTheMoveCard({ devices }: { devices: Device[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-neutral">Devices on the move</h3>
        <a className="text-xs font-medium text-primary" href="/devices">
          Manage fleet →
        </a>
      </header>
      {devices.length === 0 ? (
        <p className="px-4 py-6 text-sm text-base-content/55">
          No active devices right now.
        </p>
      ) : (
        <ul>
          {devices.map((device, idx) => {
            const maintenance = device.status === "maintenance";
            return (
              <li
                className={`flex items-center gap-3 px-4 py-3 ${
                  idx === devices.length - 1 ? "" : "border-b border-base-content/6"
                }`}
                key={device.id}
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-base-content/[0.06] text-base-content/70">
                  {deviceIcon(device.deviceFamily)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-neutral">{deviceName(device)}</span>
                  <span className="text-xs text-base-content/55">{lastSeenLabel(device.lastSeenAt)}</span>
                </div>
                {maintenance ? (
                  <StatusPill label="Maintenance" tone="muted" />
                ) : (
                  <StatusPill label="Active" tone="success" />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function deviceIcon(family: Device["deviceFamily"]): ReactNode {
  if (family === "gaia_d") return <DroneIcon size={16} />;
  if (family === "phone") return <CameraIcon size={16} />;
  return <RoverIcon size={16} />;
}

function deviceName(device: Device): string {
  return device.nickname ?? device.displayName ?? device.serialNumber;
}

function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "No telemetry yet";
  const mins = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `Last seen ${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `Last seen ${days} ${days === 1 ? "day" : "days"} ago`;
}

// --- Shared ---------------------------------------------------------------

function SampleTag() {
  return (
    <span className="rounded-full bg-base-content/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-base-content/55">
      Sample
    </span>
  );
}
