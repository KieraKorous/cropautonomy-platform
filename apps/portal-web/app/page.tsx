import type { ReactNode } from "react";
import {
  ArrowRight,
  BrainIcon,
  CameraIcon,
  ChartIcon,
  Check,
  DevicePinMarker,
  DroneIcon,
  FarmIcon,
  FieldsLayer,
  MapPanel,
  MapPinIcon,
  RoverIcon,
  StatCard,
  StatusPill,
  WatchlistLayer,
  type DevicePinDatum,
  type FieldFeature,
  type MapLayerToggle,
  type MapViewMode
} from "@gaia/ui";

// --- Fixtures: map data ---------------------------------------------------

function rectFeature(id: string, west: number, south: number, east: number, north: number, name?: string): FieldFeature {
  return {
    type: "Feature",
    properties: { id, name: name ?? id },
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south]
        ]
      ]
    }
  };
}

const fieldFeatures: FieldFeature[] = [
  // Nemaha River Farm
  rectFeature("F-01", -95.604, 39.860, -95.598, 39.866),
  rectFeature("F-02", -95.598, 39.860, -95.593, 39.866),
  rectFeature("F-03", -95.604, 39.855, -95.598, 39.860),
  rectFeature("F-05", -95.593, 39.857, -95.588, 39.862),
  // Pottawatomie West
  rectFeature("F-09", -95.580, 39.846, -95.574, 39.853),
  rectFeature("F-14", -95.568, 39.846, -95.563, 39.853),
  rectFeature("F-15", -95.580, 39.840, -95.575, 39.846),
  rectFeature("F-16", -95.575, 39.840, -95.569, 39.846),
  rectFeature("F-17", -95.569, 39.840, -95.563, 39.846),
  // Doniphan Bottoms
  rectFeature("F-21", -95.518, 39.853, -95.512, 39.860),
  rectFeature("F-23", -95.518, 39.847, -95.512, 39.853),
  rectFeature("F-24", -95.512, 39.847, -95.506, 39.853),
  // Jackson South
  rectFeature("F-30", -95.575, 39.812, -95.569, 39.818),
  rectFeature("F-31", -95.569, 39.812, -95.563, 39.818),
  rectFeature("F-33", -95.557, 39.812, -95.551, 39.818)
];

const watchlistFeatures: FieldFeature[] = [
  rectFeature("F-04", -95.598, 39.855, -95.593, 39.860, "F-04 · Volunteer corn"),
  rectFeature("F-13", -95.574, 39.846, -95.568, 39.853, "F-13 · NDVI declining"),
  rectFeature("F-22", -95.512, 39.853, -95.506, 39.860, "F-22 · Tar spot"),
  rectFeature("F-32", -95.563, 39.812, -95.557, 39.818, "F-32") // Jackson home of docked rover
];

const devicePins: DevicePinDatum[] = [
  {
    id: "rover-04",
    label: "Rover 04",
    longitude: -95.5655,
    latitude: 39.8495,
    icon: <RoverIcon size={11} />,
    status: "active",
    meta: "68%"
  },
  {
    id: "drone-02",
    label: "Drone 02",
    longitude: -95.5710,
    latitude: 39.8495,
    icon: <DroneIcon size={11} />,
    status: "active",
    meta: "42%"
  },
  {
    id: "rover-03",
    label: "Rover 03",
    longitude: -95.5955,
    latitude: 39.8575,
    icon: <RoverIcon size={11} />,
    status: "active",
    meta: "88%"
  },
  {
    id: "rover-01",
    label: "Rover 01",
    longitude: -95.5600,
    latitude: 39.8150,
    icon: <RoverIcon size={11} />,
    status: "docked",
    meta: "docked"
  }
];

const mapViewModes: MapViewMode[] = [
  { id: "satellite", label: "Satellite", active: true },
  { id: "ndvi", label: "NDVI" },
  { id: "activity", label: "Activity" }
];

const mapLayers: MapLayerToggle[] = [
  { id: "fields", label: "Fields", active: true, tone: "primary" },
  { id: "devices", label: "Devices", active: true, tone: "muted" },
  { id: "watchlist", label: "Watchlist", active: true, tone: "accent", count: 3 },
  { id: "scans", label: "Scans" },
  { id: "routes", label: "Routes" }
];

// --- Fixtures: dashboard data ---------------------------------------------

const recentScans = [
  {
    id: "scan-1",
    title: "Tar spot signature",
    timeMeta: "2 hours ago · 38 acres",
    fieldCode: "Doniphan F-22",
    farm: "Doniphan Bottoms",
    source: "Drone 02",
    sourceDetail: "4K multispectral",
    status: "Needs review",
    statusTone: "accent" as const,
    confidence: "0.92",
    leadTone: "accent" as const,
    leadIcon: <CameraIcon size={16} />
  },
  {
    id: "scan-2",
    title: "Steady NDVI decline",
    timeMeta: "This morning · 24 acres",
    fieldCode: "Pottawatomie F-13",
    farm: "Pottawatomie West",
    source: "Drone 02",
    sourceDetail: "multispectral",
    status: "Trending down",
    statusTone: "secondary" as const,
    confidence: "0.88",
    leadTone: "default" as const,
    leadIcon: <ChartIcon size={16} />
  },
  {
    id: "scan-3",
    title: "Volunteer corn pressure",
    timeMeta: "Yesterday · 17 acres",
    fieldCode: "Nemaha F-04",
    farm: "Nemaha River Farm",
    source: "Rover 03",
    sourceDetail: "Ground RGB",
    status: "Analysis complete",
    statusTone: "success" as const,
    confidence: "0.81",
    leadTone: "default" as const,
    leadIcon: <BrainIcon size={16} />
  },
  {
    id: "scan-4",
    title: "Nitrogen banding",
    timeMeta: "Yesterday · 41 acres",
    fieldCode: "Jackson F-32",
    farm: "Jackson South",
    source: "Drone 02",
    sourceDetail: "multispectral",
    status: "Action queued",
    statusTone: "secondary" as const,
    confidence: "0.77",
    leadTone: "default" as const,
    leadIcon: <ChartIcon size={16} />
  },
  {
    id: "scan-5",
    title: "Mobile scout capture",
    timeMeta: "30 min ago · 6 acres",
    fieldCode: "Pottawatomie F-09",
    farm: "Pottawatomie West",
    source: "Joaquin's phone",
    sourceDetail: "iOS · RGB",
    status: "Analyzing",
    statusTone: "muted" as const,
    confidence: "—",
    leadTone: "default" as const,
    leadIcon: <CameraIcon size={16} />
  }
];

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
    assignee: { initials: "JM", color: "bg-secondary text-secondary-content" },
    title: "Pull soil tests on Pottawatomie F-13 — likely nitrogen.",
    meta: "Joaquin Mendez · tomorrow morning if conditions hold",
    due: { label: "Tomorrow" },
    done: false
  },
  {
    id: "task-3",
    assignee: { initials: "TW", color: "bg-primary text-primary-content" },
    title: "Clean up volunteer corn in the Nemaha F-04 headlands.",
    meta: "Tomas Whitlow · anytime this week",
    due: { label: "This week" },
    done: false
  },
  {
    id: "task-4",
    assignee: { initials: "MK", color: "bg-accent text-accent-content" },
    title: "Book a battery cell test for Drone 01 before Sunday.",
    meta: "Maya Kapoor · ground service · done at 11:42 AM",
    due: { label: "Done" },
    done: true
  }
];

const attentionItems = [
  {
    id: "att-1",
    field: "Doniphan F-22",
    context: "spotted this morning",
    body: "Tar spot in the northeast corner, spreading toward the road. Joaquin is free this afternoon if you want to send him out.",
    primary: "Open the scan →",
    secondary: "Send Joaquin"
  },
  {
    id: "att-2",
    field: "Pottawatomie F-13",
    context: "trending two weeks",
    body: "NDVI is off twelve percent across the field — a steady decline, not a single bad scan. Usually points to nitrogen running thin.",
    primary: "Compare scans →",
    secondary: "View plan"
  },
  {
    id: "att-3",
    field: "Drone 01",
    context: "battery health",
    body: "Degrading about four percent month over month. Worth booking a cell test before the next Doniphan flight.",
    primary: "Schedule a check →",
    secondary: "Snooze a week"
  }
];

const devicesOnTheMove = [
  {
    id: "dev-r04",
    name: "Rover 04",
    detail: "Scanning F-14 · 73% through route",
    icon: <RoverIcon size={16} />,
    trailingTop: "68%",
    trailingBottom: "ETA 4:08",
    status: "active" as const
  },
  {
    id: "dev-d02",
    name: "Drone 02",
    detail: "Mid-flight · 40 min left",
    icon: <DroneIcon size={16} />,
    trailingTop: "42%",
    trailingBottom: "Ends 3:12",
    status: "active" as const
  },
  {
    id: "dev-r03",
    name: "Rover 03",
    detail: "Heading to F-04 via volunteer corn pass",
    icon: <RoverIcon size={16} />,
    trailingTop: "88%",
    trailingBottom: "Next 2:45",
    status: "active" as const
  },
  {
    id: "dev-d01",
    name: "Drone 01",
    detail: "Cell test · back Sun 1 PM",
    icon: <DroneIcon size={16} />,
    statusPill: { label: "Offline", tone: "muted" as const },
    status: "offline" as const
  }
];

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default function Overview() {
  return (
    <div className="flex flex-col gap-7">
      <PageHeader />
      <StatRow />
      <MapSection />
      <div className="grid items-start gap-5 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-5">
          <RecentScansTable />
          <ScoutListCard />
        </div>
        <div className="flex flex-col gap-5">
          <NeedsAttentionCard />
          <FieldConditionsCard />
          <DevicesOnTheMoveCard />
        </div>
      </div>
    </div>
  );
}

// --- Page sections --------------------------------------------------------

function PageHeader() {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-base-content/55">
          <span>Saturday, May 23 · 2:32 PM</span>
          <span className="text-base-content/30">·</span>
          <span className="flex items-center gap-1.5 text-success">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            Spray window open until 5:40 PM
          </span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-neutral">Good afternoon, Brandon.</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
          Two fields are worth looking at today — Doniphan F-22 and Pottawatomie F-13. The rest of the operation is steady.
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
        <button
          className="flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90"
          type="button"
        >
          <CameraIcon size={14} />
          New scan
        </button>
      </div>
    </header>
  );
}

function StatRow() {
  return (
    <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        delta={{ value: "+18%", tone: "success" }}
        icon={<CameraIcon size={16} />}
        label="Scans this week"
        meta="vs 1,053 last week"
        value="1,247"
      />
      <StatCard
        icon={<FarmIcon size={16} />}
        label="Acres under management"
        meta="Seven farms · 33 fields"
        value="12,840"
      />
      <StatCard
        icon={<MapPinIcon />}
        label="Fields worth a look"
        meta="Doniphan F-22 · Pottawatomie F-13 · Jackson F-32"
        tone="accent"
        value="3"
      />
      <StatCard
        icon={<RoverIcon size={16} />}
        label="Fleet on the move"
        meta="Drone 01 in scheduled maintenance"
        value="5 of 6"
      />
    </div>
  );
}

function MapSection() {
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
    <MapPanel
      header={{
        title: "Field map",
        meta: "Seven farms · 12,840 acres · updated 18 sec ago",
        orgSelector: { label: "All farms", icon: <MapPinIcon /> },
        viewModes: mapViewModes,
        timeRange: { label: "Today" },
        openFullMapHref: "/map"
      }}
      initialViewState={{ longitude: -95.57, latitude: 39.835, zoom: 11.2 }}
      layers={mapLayers}
      liveness={{ label: "5 devices live · 3 scans this hour" }}
      mapboxAccessToken={MAPBOX_TOKEN}
    >
      <FieldsLayer features={fieldFeatures} />
      <WatchlistLayer features={watchlistFeatures} />
      {devicePins.map((device) => (
        <DevicePinMarker device={device} key={device.id} />
      ))}
    </MapPanel>
  );
}

// --- Recent scans table ---------------------------------------------------

function RecentScansTable() {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-neutral">Recent scans</h2>
          <p className="text-xs text-base-content/60">Last twelve scans across drones, rovers, and mobile.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <div className="flex items-stretch overflow-hidden rounded-md border border-base-content/12">
            <FilterPill active label="All" />
            <FilterPill label="Flagged" />
            <FilterPill label="In queue" />
          </div>
          <a className="text-sm font-medium text-primary" href="/scans">
            All scans →
          </a>
        </div>
      </header>
      <div className="grid grid-cols-[200px_180px_140px_1fr_80px] gap-3 border-b border-base-content/8 bg-base-content/[0.03] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-base-content/55">
        <span>Scan</span>
        <span>Field</span>
        <span>Source</span>
        <span>Status</span>
        <span className="text-right">Confidence</span>
      </div>
      <ul>
        {recentScans.map((scan, idx) => (
          <li
            className={`grid grid-cols-[200px_180px_140px_1fr_80px] items-center gap-3 px-5 py-3.5 ${
              idx === recentScans.length - 1 ? "" : "border-b border-base-content/6"
            }`}
            key={scan.id}
          >
            <ScanLead icon={scan.leadIcon} subtitle={scan.timeMeta} title={scan.title} tone={scan.leadTone} />
            <Stack subtitle={scan.farm} title={scan.fieldCode} />
            <Stack subtitle={scan.sourceDetail} title={scan.source} />
            <div>
              <StatusPill label={scan.status} tone={scan.statusTone} />
            </div>
            <span className="text-right text-sm font-semibold text-neutral">{scan.confidence}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterPill({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <button
      className={`px-3 py-1 text-xs ${
        active ? "bg-base-content/[0.05] font-semibold text-neutral" : "text-base-content/65 hover:text-neutral"
      }`}
      type="button"
    >
      {label}
    </button>
  );
}

function ScanLead({
  icon,
  title,
  subtitle,
  tone
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  tone: "default" | "accent";
}) {
  const wrap =
    tone === "accent" ? "bg-accent/15 text-accent" : "bg-base-content/[0.06] text-base-content/70";
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md ${wrap}`}>{icon}</span>
      <Stack subtitle={subtitle} title={title} />
    </div>
  );
}

function Stack({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="truncate text-sm font-medium text-neutral">{title}</span>
      <span className="truncate text-xs text-base-content/55">{subtitle}</span>
    </div>
  );
}

// --- Scout list -----------------------------------------------------------

function ScoutListCard() {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-neutral">Today's scout list</h2>
          <p className="text-xs text-base-content/60">Four checks on the board · three for this afternoon.</p>
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

// --- Needs attention ------------------------------------------------------

function NeedsAttentionCard() {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-neutral">Needs your attention</h3>
          <span className="flex items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5">
            <span className="h-1 w-1 rounded-full bg-accent" />
            <span className="text-xs font-semibold text-accent">3</span>
          </span>
        </div>
        <span className="text-xs text-base-content/55">Today</span>
      </header>
      <ul>
        {attentionItems.map((item, idx) => (
          <li
            className={`flex flex-col gap-2 px-4 py-3.5 ${
              idx === attentionItems.length - 1 ? "" : "border-b border-base-content/6"
            }`}
            key={item.id}
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-primary">{item.field}</span>
              <span className="text-base-content/30">·</span>
              <span className="text-base-content/55">{item.context}</span>
            </div>
            <p className="text-sm leading-snug text-neutral">{item.body}</p>
            <div className="flex items-center gap-3.5 pt-0.5">
              <a className="text-xs font-semibold text-primary" href="#">
                {item.primary}
              </a>
              <a className="text-xs text-base-content/55 hover:text-neutral" href="#">
                {item.secondary}
              </a>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --- Field conditions -----------------------------------------------------

function FieldConditionsCard() {
  return (
    <section className="flex flex-col rounded-xl border border-base-content/10 bg-base-100 p-5">
      <header className="mb-3.5 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral">Field conditions</h3>
        <span className="text-xs text-base-content/55">Nemaha · 11 min ago</span>
      </header>
      <div className="mb-3.5 flex items-center gap-2 rounded-md bg-success/10 px-3 py-2.5">
        <span className="h-1.5 w-1.5 rounded-full bg-success" />
        <span className="text-sm font-medium text-success">Spray window open until 5:40 PM</span>
      </div>
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

// --- Devices on the move --------------------------------------------------

function DevicesOnTheMoveCard() {
  return (
    <section className="overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <header className="flex items-center justify-between border-b border-base-content/10 px-4 py-3.5">
        <h3 className="text-sm font-semibold text-neutral">Devices on the move</h3>
        <a className="text-xs font-medium text-primary" href="/devices">
          Manage fleet →
        </a>
      </header>
      <ul>
        {devicesOnTheMove.map((device, idx) => (
          <li
            className={`flex items-center gap-3 px-4 py-3 ${
              idx === devicesOnTheMove.length - 1 ? "" : "border-b border-base-content/6"
            }`}
            key={device.id}
          >
            <span
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${
                device.status === "offline" ? "bg-base-content/[0.06] text-base-content/45" : "bg-base-content/[0.06] text-base-content/70"
              }`}
            >
              {device.icon}
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span
                className={`text-sm font-semibold ${
                  device.status === "offline" ? "text-base-content/70" : "text-neutral"
                }`}
              >
                {device.name}
              </span>
              <span className="text-xs text-base-content/55">{device.detail}</span>
            </div>
            {device.statusPill ? (
              <StatusPill label={device.statusPill.label} tone={device.statusPill.tone} />
            ) : (
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-neutral">{device.trailingTop}</span>
                <span className="text-xs text-base-content/55">{device.trailingBottom}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
