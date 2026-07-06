"use client";

import { useState } from "react";
import { FarmIcon, GridIcon, MapPinIcon, PlusIcon, RowsIcon } from "@gaia/ui";
import type { FarmSummary, FieldSummary, TeamSummary, ZoneSummary } from "../../../lib/api";
import { FieldFormModal } from "./FieldFormModal";
import { ZonesModal } from "./ZonesModal";

// Fields grouped by farm: a section per farm (heading + field/acre rollup) with
// its fields as cards beneath and a per-section "New field" tile that pre-selects
// that farm. Fields + farms are fetched on the server and passed in, so opening a
// modal never re-hits the API. After a create/edit/delete the server action
// revalidates /fields, so this list (and the open modal's field) reflect changes.
type ModalState =
  | { kind: "new"; farmId: string }
  | { kind: "edit"; fieldId: string }
  | null;

export function FieldsView({
  fields,
  farms,
  zones,
  canManage,
  zonesCanManage,
  teams,
  canAssignTeams
}: {
  fields: FieldSummary[];
  farms: FarmSummary[];
  zones: ZoneSummary[];
  canManage: boolean;
  zonesCanManage: boolean;
  teams: TeamSummary[];
  canAssignTeams: boolean;
}) {
  const [modal, setModal] = useState<ModalState>(null);
  const [zonesFieldId, setZonesFieldId] = useState<string | null>(null);

  // Resolve the edited field from the current list so a post-edit refresh reflows
  // the modal (or closes it if the field was deleted out from under it).
  const selected =
    modal?.kind === "edit" ? fields.find((f) => f.id === modal.fieldId) ?? null : null;
  // The farm a "new field" is seeded into; used to default the form's selector.
  const seededFarmId = modal?.kind === "new" ? modal.farmId : null;

  const zonesField = zonesFieldId ? fields.find((f) => f.id === zonesFieldId) ?? null : null;
  const zonesForField = zonesFieldId ? zones.filter((z) => z.fieldId === zonesFieldId) : [];
  const zoneCounts = new Map<string, number>();
  for (const z of zones) zoneCounts.set(z.fieldId, (zoneCounts.get(z.fieldId) ?? 0) + 1);

  // Fields need a farm to hang off — there's nothing to manage until one exists.
  if (farms.length === 0) {
    return <NoFarmsState canManage={canManage} />;
  }

  return (
    <>
      <div className="flex flex-col gap-8">
        {farms.map((farm) => {
          const farmFields = fields.filter((f) => f.farmId === farm.id);
          const acres = farmFields.reduce((sum, f) => sum + (f.areaAcres ?? 0), 0);
          return (
            <section key={farm.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-content/10 pb-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <FarmIcon size={15} />
                  </span>
                  <h2 className="text-base font-semibold text-neutral">{farm.name}</h2>
                </div>
                <span className="text-xs text-base-content/55">
                  <span className="font-semibold text-neutral">{farmFields.length}</span>{" "}
                  {farmFields.length === 1 ? "field" : "fields"}
                  {acres > 0 ? (
                    <>
                      {" · "}
                      <span className="font-semibold text-neutral">
                        {acres.toLocaleString("en-US", { maximumFractionDigits: 1 })}
                      </span>{" "}
                      acres
                    </>
                  ) : null}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {farmFields.map((field) => (
                  <FieldCard
                    key={field.id}
                    field={field}
                    zoneCount={zoneCounts.get(field.id) ?? 0}
                    canManageZones={zonesCanManage}
                    onOpen={canManage ? () => setModal({ kind: "edit", fieldId: field.id }) : undefined}
                    onZones={() => setZonesFieldId(field.id)}
                  />
                ))}

                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setModal({ kind: "new", farmId: farm.id })}
                    className="group flex min-h-[8.5rem] flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-base-content/20 bg-base-100 text-base-content/55 transition-colors hover:border-primary/40 hover:bg-base-content/[0.02] hover:text-primary"
                  >
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/45 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                      <PlusIcon size={22} />
                    </span>
                    <span className="text-sm font-medium">New field</span>
                  </button>
                ) : farmFields.length === 0 ? (
                  <p className="col-span-full rounded-xl border border-dashed border-base-content/15 bg-base-100 px-4 py-5 text-sm text-base-content/55">
                    No fields on this farm yet.
                  </p>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>

      <FieldFormModal
        open={modal !== null}
        field={selected}
        farms={farms}
        fields={fields}
        seededFarmId={seededFarmId}
        teams={teams}
        canAssignTeams={canAssignTeams}
        onClose={() => setModal(null)}
      />

      <ZonesModal
        open={zonesFieldId !== null}
        field={zonesField}
        zones={zonesForField}
        canManage={zonesCanManage}
        onClose={() => setZonesFieldId(null)}
      />
    </>
  );
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// A lightweight Mapbox Static Images URL for a field preview: the boundary box
// overlaid on the standard light basemap, auto-fit to the box with padding so the
// whole field shows (auto scales the zoom to the box's size). Falls back to a pin
// at the centroid when there's no box. Returns null when there's no token or no
// geometry — far cheaper than mounting a live MapPanel per card.
function fieldPreviewUrl(field: FieldSummary): string | null {
  if (!MAPBOX_TOKEN) return null;
  const size = "320x140@2x";
  const style = "mapbox/light-v11";
  if (field.boundary) {
    const feature = {
      type: "Feature" as const,
      properties: {
        stroke: "#5a7d3a",
        "stroke-width": 2,
        "stroke-opacity": 0.95,
        fill: "#7c9e54",
        "fill-opacity": 0.3
      },
      geometry: field.boundary
    };
    const overlay = `geojson(${encodeURIComponent(JSON.stringify(feature))})`;
    // Generous padding frames a bit of ground around the field, so the view is a
    // little larger than the box rather than hugging its edges.
    return `https://api.mapbox.com/styles/v1/${style}/static/${overlay}/auto/${size}?padding=48&access_token=${MAPBOX_TOKEN}`;
  }
  if (field.centroid) {
    const [lng, lat] = field.centroid.coordinates;
    return `https://api.mapbox.com/styles/v1/${style}/static/pin-s+5a7d3a(${lng},${lat})/${lng},${lat},13/${size}?access_token=${MAPBOX_TOKEN}`;
  }
  return null;
}

// Per-card map preview. Light-basemap thumbnail when the field has geometry; a
// muted placeholder otherwise. Lazy-loaded so off-screen cards defer requests.
function FieldThumbnail({ field }: { field: FieldSummary }) {
  const url = fieldPreviewUrl(field);
  if (!url) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg border border-base-content/10 bg-base-content/[0.03] text-base-content/35">
        <MapPinIcon size={18} />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={`Map preview of ${field.name}`}
      loading="lazy"
      className="h-28 w-full rounded-lg border border-base-content/10 object-cover"
    />
  );
}

// One field card: a map preview, name, crop, acreage, and a Zones entry. The body
// opens the edit modal (when the viewer can manage fields); the footer's Zones
// button opens the zones manager.
function FieldCard({
  field,
  zoneCount,
  canManageZones,
  onOpen,
  onZones
}: {
  field: FieldSummary;
  zoneCount: number;
  canManageZones: boolean;
  onOpen?: () => void;
  onZones: () => void;
}) {
  const acres = field.areaAcres ?? 0;

  return (
    <div className="flex min-h-[8.5rem] flex-col overflow-hidden rounded-xl border border-base-content/10 bg-base-100">
      <button
        type="button"
        onClick={onOpen}
        disabled={!onOpen}
        className="flex flex-1 flex-col gap-3 p-4 text-left transition-colors enabled:hover:bg-base-content/[0.02]"
      >
        <FieldThumbnail field={field} />

        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <GridIcon size={18} />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-neutral" title={field.name}>
              {field.name}
            </span>
            <span className="flex items-center gap-1 truncate text-xs text-base-content/55">
              <MapPinIcon size={12} />
              <span className="truncate">{field.boundary ? "Mapped" : "No boundary"}</span>
            </span>
          </div>
        </div>

        {field.crop ? (
          <span className="inline-flex w-fit items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {field.crop}
          </span>
        ) : (
          <span className="text-xs italic text-base-content/45">No crop assigned</span>
        )}

        {field.description ? (
          <p className="line-clamp-2 text-sm text-base-content/65">{field.description}</p>
        ) : null}
      </button>

      <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-4 py-2.5 text-xs text-base-content/55">
        <span>
          <span className="font-semibold text-neutral">
            {acres > 0 ? acres.toLocaleString("en-US", { maximumFractionDigits: 1 }) : "—"}
          </span>{" "}
          acres
        </span>
        <button
          type="button"
          onClick={onZones}
          className="inline-flex items-center gap-1.5 rounded-md border border-base-content/15 px-2.5 py-1 font-medium text-base-content/70 transition-colors hover:border-primary/40 hover:bg-primary/[0.06] hover:text-primary"
          title={zoneCount > 0 ? "Manage zones" : canManageZones ? "Add zones" : "View zones"}
        >
          {zoneCount > 0 ? (
            <>
              <RowsIcon size={13} />
              Zones
              <span className="rounded-full bg-base-content/10 px-1.5 font-semibold text-neutral">
                {zoneCount}
              </span>
            </>
          ) : canManageZones ? (
            <>
              <PlusIcon size={13} />
              Add zones
            </>
          ) : (
            <>
              <RowsIcon size={13} />
              No zones
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// Shown when the org has no farms yet — fields need a farm to belong to.
function NoFarmsState({ canManage }: { canManage: boolean }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <GridIcon size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-neutral">No farms yet</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          {canManage
            ? "Fields belong to a farm. Add a farm first, then come back to map its fields."
            : "No farms have been set up for this organization yet. An admin or manager can add one before fields can be created."}
        </p>
      </div>
      {canManage ? (
        <a
          href="/farms"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
        >
          <FarmIcon size={16} />
          Go to Farms
        </a>
      ) : null}
    </section>
  );
}
