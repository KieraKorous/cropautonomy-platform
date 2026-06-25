import {
  ApiError,
  listFarms,
  listFields,
  listZones,
  type FarmSummary,
  type FieldSummary,
  type ZoneSummary
} from "../../../lib/api";
import { FieldsView } from "./FieldsView";

// Fields — the working unit of the land hierarchy (org → farm → field → zone).
// Lists the org's fields grouped under their farm and lets managers create,
// edit, and delete them. Each field carries a manual acreage and an optional
// centroid pin; drawn boundaries land in a later slice.
export const dynamic = "force-dynamic";

export default async function FieldsPage() {
  let fields: FieldSummary[] = [];
  let farms: FarmSummary[] = [];
  let zones: ZoneSummary[] = [];
  let canManage = false;
  let zonesCanManage = false;
  let loadError: string | null = null;

  try {
    // Fields + farms are essential (a failure shows the error state). Zones are a
    // best-effort enrichment — caught so a hiccup (or a not-yet-applied migration)
    // never blocks the core list.
    const [fieldsResult, farmsResult, zonesResult] = await Promise.all([
      listFields(),
      listFarms(),
      listZones().catch(() => ({ orgId: "", canManage: false, zones: [] as ZoneSummary[] }))
    ]);
    fields = fieldsResult.fields;
    canManage = fieldsResult.canManage;
    farms = farmsResult.farms;
    zones = zonesResult.zones;
    zonesCanManage = zonesResult.canManage;
  } catch (err) {
    loadError =
      err instanceof ApiError ? err.message : "Could not reach the fields service.";
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Fields</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Every block under management, grouped by the farm it belongs to. Fields carry their
            acreage and a map pin; scans and zones hang off a field.
          </p>
        </div>
        {!loadError && fields.length > 0 ? (
          <span className="text-sm text-base-content/55">
            {fields.length} {fields.length === 1 ? "field" : "fields"}
          </span>
        ) : null}
      </header>

      {loadError ? (
        <ErrorState message={loadError} />
      ) : (
        <FieldsView
          fields={fields}
          farms={farms}
          zones={zones}
          canManage={canManage}
          zonesCanManage={zonesCanManage}
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
      <h2 className="text-base font-semibold text-neutral">Can&apos;t reach your ground.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Fields aren&apos;t loading right now. Refresh in a moment — if it keeps happening, make sure
        you have an active organization or try again shortly.
      </p>
      <p className="text-xs text-base-content/40">{message}</p>
    </section>
  );
}
