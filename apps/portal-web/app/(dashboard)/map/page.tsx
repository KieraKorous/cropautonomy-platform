import {
  listCaptures,
  listFarms,
  listFields,
  listMyTeams,
  listZones,
  type CaptureSummary,
  type FarmSummary,
  type FieldSummary,
  type MyTeam,
  type ZoneSummary
} from "../../../lib/api";
import { TeamFilter } from "../_components/TeamFilter";
import { FieldMapExplorer } from "../overview/FieldMapExplorer";
import { buildFieldMapData } from "../overview/fieldMapData";

// The full-screen field map (reached from the Overview's "Open full map"). Same
// interactive controls as the Overview card — farm filter, view modes, layer
// toggle — but filling the content area. Auth-scoped, so force-dynamic.
export const dynamic = "force-dynamic";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export default async function FullMapPage({
  searchParams
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;

  // Restrict the map to the caller's own teams (mine:true also scopes admins),
  // optionally narrowed to one team via the switcher.
  const [farmsResult, fieldsResult, capturesResult, zonesResult, myTeams] =
    await Promise.all([
      listFarms({ mine: true, teamId: team }).catch(() => ({ farms: [] as FarmSummary[] })),
      listFields({ mine: true, teamId: team }).catch(() => ({ fields: [] as FieldSummary[] })),
      listCaptures({ limit: 200, mine: true, teamId: team }).catch(() => ({
        captures: [] as CaptureSummary[]
      })),
      // Zones have no team assignment of their own — filter them client-side to
      // the visible fields below.
      listZones().catch(() => ({ zones: [] as ZoneSummary[] })),
      listMyTeams()
        .then((r) => r.teams)
        .catch(() => [] as MyTeam[])
    ]);

  // Drop zones whose parent field isn't in the (team-scoped) field set.
  const visibleFieldIds = new Set(fieldsResult.fields.map((f) => f.id));
  const scopedZones = zonesResult.zones.filter((z) => visibleFieldIds.has(z.fieldId));

  const mapData = buildFieldMapData(
    fieldsResult.fields,
    farmsResult.farms,
    capturesResult.captures,
    scopedZones
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
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-3">
      {myTeams.length > 0 ? (
        <div className="flex justify-end">
          <TeamFilter teams={myTeams} />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <FieldMapExplorer
          fields={mapData.fieldCollection}
          zones={mapData.zoneCollection}
          farmMarkers={mapData.farmMarkers}
          farmOptions={mapData.farmOptions}
          activityPins={mapData.activityPins}
          acres={mapData.acres}
          mapboxToken={MAPBOX_TOKEN}
          fill
        />
      </div>
    </div>
  );
}
