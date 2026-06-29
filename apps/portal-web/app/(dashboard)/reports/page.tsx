import { getMe, listCaptures, type CaptureSummary } from "../../../lib/api";
import { ReportsView } from "./ReportsView";

// The interactive operations report — live, per-account org data rolled up into
// KPIs, a captures-over-time chart, findings, and per-field activity. The range
// toggle re-windows client-side, so the server just fetches one generous batch.
// The print-optimized weekly document lives at /reports/weekly (linked from
// inside the view). force-dynamic because every fetch reads the caller's token.
export const dynamic = "force-dynamic";

// Captures have no date filter on the API, so we window client-side over one
// generous batch. v0 org volume is low; captures older than this batch are
// excluded — revisit the limit (or add a server-side date filter) when an org's
// volume routinely exceeds it.
const CAPTURE_FETCH_LIMIT = 1000;

export default async function ReportsPage() {
  const [me, capturesResult] = await Promise.all([
    getMe().catch(() => null),
    listCaptures({ limit: CAPTURE_FETCH_LIMIT }).catch(() => ({
      captures: [] as CaptureSummary[]
    }))
  ]);

  const orgName = me?.org.name ?? "your operation";

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-1.5 border-b border-base-content/10 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral">Reports</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
          The read on {orgName} — how much you&apos;re capturing, what the analysis is finding, and
          where activity is trending. Pick a window to compare against the period before it.
        </p>
      </header>

      <ReportsView captures={capturesResult.captures} />
    </div>
  );
}
