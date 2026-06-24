import {
  listCaptures,
  listFarms,
  listFields,
  type CaptureSummary,
  type FarmSummary,
  type FieldSummary
} from "../../../lib/api";
import { FieldMapExplorer } from "../overview/FieldMapExplorer";
import { buildFieldMapData } from "../overview/fieldMapData";

// The full-screen field map (reached from the Overview's "Open full map"). Same
// interactive controls as the Overview card — farm filter, view modes, layer
// toggle — but filling the content area. Auth-scoped, so force-dynamic.
export const dynamic = "force-dynamic";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default async function FullMapPage() {
  const [farmsResult, fieldsResult, capturesResult] = await Promise.all([
    listFarms().catch(() => ({ farms: [] as FarmSummary[] })),
    listFields().catch(() => ({ fields: [] as FieldSummary[] })),
    listCaptures({ limit: 200 }).catch(() => ({ captures: [] as CaptureSummary[] }))
  ]);

  const mapData = buildFieldMapData(
    fieldsResult.fields,
    farmsResult.farms,
    capturesResult.captures
  );

  if (!MAPBOX_TOKEN) {
    return (
      <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
        <span className="rounded-full bg-accent/15 px-2.5 py-1 text-xs font-semibold text-accent">
          Map needs setup
        </span>
        <h2 className="text-base font-semibold text-neutral">Field map can&apos;t render without a Mapbox token.</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          Set{" "}
          <code className="rounded bg-base-content/[0.06] px-1.5 py-0.5 text-xs">NEXT_PUBLIC_MAPBOX_TOKEN</code> and restart
          the dev server.
        </p>
      </section>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)]">
      <FieldMapExplorer
        fields={mapData.fieldCollection}
        farmMarkers={mapData.farmMarkers}
        farmOptions={mapData.farmOptions}
        activityPins={mapData.activityPins}
        acres={mapData.acres}
        mapboxToken={MAPBOX_TOKEN}
        fill
      />
    </div>
  );
}
