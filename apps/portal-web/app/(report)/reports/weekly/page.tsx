import {
  getMe,
  listCaptures,
  listDevices,
  listFarms,
  listFields,
  type CaptureSummary,
  type Device,
  type FarmSummary,
  type FieldSummary
} from "../../../../lib/api";
import { PrintButton } from "./PrintButton";

// The weekly operations report — a print-optimized document built from real
// org data (captures, fields/acreage, fleet activity). Reached from the
// Overview's "Export weekly"; the user prints it or saves it as a PDF. Scout
// list + field conditions are still placeholder data in the app, so those
// sections are rendered but marked "Sample" so the document never overstates.
export const dynamic = "force-dynamic";

// Captures are fetched in a single generous batch and windowed client-side —
// the list endpoint has no date filter yet. Bumped well past a typical week's
// volume; revisit if an org routinely exceeds this in seven days.
const CAPTURE_FETCH_LIMIT = 500;

export default async function WeeklyReportPage() {
  const [me, farmsResult, fieldsResult, capturesResult, devicesResult] = await Promise.all([
    getMe().catch(() => null),
    listFarms().catch(() => ({ farms: [] as FarmSummary[] })),
    listFields().catch(() => ({ fields: [] as FieldSummary[] })),
    listCaptures({ limit: CAPTURE_FETCH_LIMIT }).catch(() => ({ captures: [] as CaptureSummary[] })),
    listDevices().catch(() => ({ devices: [] as Device[] }))
  ]);

  const orgName = me?.org.name ?? "Your organization";
  const farms = farmsResult.farms;
  const fields = fieldsResult.fields;
  const devices = devicesResult.devices;

  const { weekStart, weekEndExclusive, rangeLabel } = currentWeek();
  const weekCaptures = capturesResult.captures.filter((c) => {
    const t = new Date(c.capturedAt).getTime();
    return t >= weekStart.getTime() && t < weekEndExclusive.getTime();
  });

  // --- Derived rollups ----------------------------------------------------
  const fieldById = new Map(fields.map((f) => [f.id, f]));
  const farmName = new Map(farms.map((f) => [f.id, f.name]));

  // Captures this week by field (newest signal of where work happened).
  const byField = new Map<string, number>();
  let unassignedCaptures = 0;
  for (const c of weekCaptures) {
    if (!c.fieldId) {
      unassignedCaptures += 1;
      continue;
    }
    byField.set(c.fieldId, (byField.get(c.fieldId) ?? 0) + 1);
  }
  const captureRows = Array.from(byField.entries())
    .map(([fieldId, count]) => {
      const field = fieldById.get(fieldId);
      return {
        fieldName: field?.name ?? "Unknown field",
        farm: field ? farmName.get(field.farmId) ?? "—" : "—",
        count
      };
    })
    .sort((a, b) => b.count - a.count);

  // Acreage + field count per farm.
  const farmRollups = farms
    .map((farm) => {
      const farmFields = fields.filter((f) => f.farmId === farm.id);
      const acres = farmFields.reduce((sum, f) => sum + (f.areaAcres ?? 0), 0);
      return { id: farm.id, name: farm.name, fieldCount: farmFields.length, acres };
    })
    .sort((a, b) => b.acres - a.acres);

  const totalAcres = fields.reduce((sum, f) => sum + (f.areaAcres ?? 0), 0);
  const activeDevices = devices.filter((d) => d.status === "active").length;
  const generatedLabel = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 print:px-0 print:py-0">
      {/* Controls — screen only */}
      <div className="mb-5 flex items-center justify-between print:hidden">
        <a
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
        >
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Back to overview
        </a>
        <PrintButton />
      </div>

      {/* The document sheet */}
      <article className="rounded-xl border border-base-content/10 bg-base-100 p-8 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between gap-6 border-b border-base-content/15 pb-5">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary">
              Weekly operations report
            </span>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral">{orgName}</h1>
            <p className="text-sm text-base-content/65">{rangeLabel}</p>
          </div>
          <div className="text-right text-xs text-base-content/50">
            <p className="font-semibold text-base-content/70">CropAutonomy</p>
            <p>Generated {generatedLabel}</p>
          </div>
        </header>

        {/* Summary */}
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-base-content/10 bg-base-content/10 sm:grid-cols-4 print:border-base-content/20">
          <SummaryStat label="Captures this week" value={weekCaptures.length.toLocaleString("en-US")} />
          <SummaryStat label="Acres managed" value={Math.round(totalAcres).toLocaleString("en-US")} />
          <SummaryStat
            label="Fields"
            value={fields.length.toLocaleString("en-US")}
            sub={`${farms.length} ${farms.length === 1 ? "farm" : "farms"}`}
          />
          <SummaryStat label="Active devices" value={`${activeDevices} of ${devices.length}`} />
        </section>

        {/* Capture activity */}
        <Section title="Capture activity" subtitle="Captures recorded this week, by field.">
          {weekCaptures.length === 0 ? (
            <EmptyRow message="No captures recorded this week." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-base-content/15 text-left text-xs uppercase tracking-wider text-base-content/55">
                  <Th>Field</Th>
                  <Th>Farm</Th>
                  <Th className="text-right">Captures</Th>
                </tr>
              </thead>
              <tbody>
                {captureRows.map((row) => (
                  <tr key={`${row.farm}-${row.fieldName}`} className="border-b border-base-content/8">
                    <Td className="font-medium text-neutral">{row.fieldName}</Td>
                    <Td className="text-base-content/70">{row.farm}</Td>
                    <Td className="text-right tabular-nums text-neutral">{row.count}</Td>
                  </tr>
                ))}
                {unassignedCaptures > 0 ? (
                  <tr className="border-b border-base-content/8">
                    <Td className="italic text-base-content/55">Unassigned</Td>
                    <Td className="text-base-content/55">—</Td>
                    <Td className="text-right tabular-nums text-base-content/70">{unassignedCaptures}</Td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          )}
        </Section>

        {/* Acreage & fields */}
        <Section title="Acreage & fields" subtitle="Fields under management, by farm.">
          {farmRollups.length === 0 ? (
            <EmptyRow message="No farms set up yet." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-base-content/15 text-left text-xs uppercase tracking-wider text-base-content/55">
                  <Th>Farm</Th>
                  <Th className="text-right">Fields</Th>
                  <Th className="text-right">Acres</Th>
                </tr>
              </thead>
              <tbody>
                {farmRollups.map((farm) => (
                  <tr key={farm.id} className="border-b border-base-content/8">
                    <Td className="font-medium text-neutral">{farm.name}</Td>
                    <Td className="text-right tabular-nums text-base-content/70">{farm.fieldCount}</Td>
                    <Td className="text-right tabular-nums text-neutral">
                      {farm.acres > 0 ? farm.acres.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
                    </Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-base-content/20 font-semibold">
                  <Td className="text-neutral">Total</Td>
                  <Td className="text-right tabular-nums text-neutral">{fields.length}</Td>
                  <Td className="text-right tabular-nums text-neutral">
                    {Math.round(totalAcres).toLocaleString("en-US")}
                  </Td>
                </tr>
              </tbody>
            </table>
          )}
        </Section>

        {/* Device / fleet activity */}
        <Section title="Fleet activity" subtitle="Registered devices and when each was last seen.">
          {devices.length === 0 ? (
            <EmptyRow message="No devices registered yet." />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-base-content/15 text-left text-xs uppercase tracking-wider text-base-content/55">
                  <Th>Device</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Last seen</Th>
                </tr>
              </thead>
              <tbody>
                {devices.map((device) => (
                  <tr key={device.id} className="border-b border-base-content/8">
                    <Td className="font-medium text-neutral">{deviceName(device)}</Td>
                    <Td className="text-base-content/70">{familyLabel(device.deviceFamily)}</Td>
                    <Td className="capitalize text-base-content/70">{device.status}</Td>
                    <Td className="text-right text-base-content/70">{lastSeenLabel(device.lastSeenAt)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Scout list & conditions — placeholder data, clearly marked */}
        <Section
          title="Scout list & field conditions"
          subtitle="Outstanding tasks and current conditions."
          sample
        >
          <p className="text-sm text-base-content/60">
            Scout tasks and field-condition data aren&apos;t wired to live sources yet. Once they
            are, this section will summarize the week&apos;s open tasks and prevailing conditions.
          </p>
        </Section>

        <footer className="mt-8 border-t border-base-content/10 pt-4 text-xs text-base-content/45">
          Generated by CropAutonomy · {orgName} · {rangeLabel}
        </footer>
      </article>
    </div>
  );
}

// --- Week window ----------------------------------------------------------

// The calendar week (Monday 00:00 → next Monday 00:00) containing today, plus a
// human label like "Jun 16 – 22, 2026".
function currentWeek(): { weekStart: Date; weekEndExclusive: Date; rangeLabel: string } {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  const daysSinceMonday = (now.getDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0, …
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setDate(weekStart.getDate() + 7);
  const lastDay = new Date(weekEndExclusive.getTime() - 1);

  const startLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const sameMonth = weekStart.getMonth() === lastDay.getMonth();
  const endLabel = lastDay.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric"
  });
  const rangeLabel = `${startLabel} – ${endLabel}, ${lastDay.getFullYear()}`;
  return { weekStart, weekEndExclusive, rangeLabel };
}

// --- Device helpers (mirror the Overview's labeling) ----------------------

function deviceName(device: Device): string {
  return device.nickname ?? device.displayName ?? device.serialNumber;
}

function familyLabel(family: Device["deviceFamily"]): string {
  if (family === "gaia_d") return "Drone";
  if (family === "phone") return "Phone";
  return "Rover";
}

function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return "No telemetry";
  const mins = Math.round((Date.now() - new Date(lastSeenAt).getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

// --- Presentational pieces ------------------------------------------------

function SummaryStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-base-100 px-4 py-3.5">
      <p className="text-xs text-base-content/55">{label}</p>
      <p className="mt-0.5 text-xl font-semibold leading-tight text-neutral">{value}</p>
      {sub ? <p className="text-xs text-base-content/50">{sub}</p> : null}
    </div>
  );
}

function Section({
  title,
  subtitle,
  sample,
  children
}: {
  title: string;
  subtitle?: string;
  sample?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 break-inside-avoid">
      <div className="mb-2.5 flex items-center gap-2.5">
        <h2 className="text-base font-semibold text-neutral">{title}</h2>
        {sample ? (
          <span className="rounded-full bg-base-content/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-base-content/55">
            Sample
          </span>
        ) : null}
      </div>
      {subtitle ? <p className="mb-3 text-sm text-base-content/55">{subtitle}</p> : null}
      {children}
    </section>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-2 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 ${className}`}>{children}</td>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-base-content/15 bg-base-content/[0.02] px-4 py-4 text-sm text-base-content/55">
      {message}
    </p>
  );
}
