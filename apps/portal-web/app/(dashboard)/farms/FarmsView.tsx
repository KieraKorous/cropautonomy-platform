"use client";

import { useState } from "react";
import { FarmIcon, MapPinIcon, PlusIcon } from "@gaia/ui";
import type { FarmSummary } from "../../../lib/api";
import { FarmFormModal } from "./FarmFormModal";

// Farms grid: a card per farm, plus the dashed "new farm" tile for managers.
// Clicking a card opens the edit modal; the tile opens the same modal in create
// mode. Farms are fetched on the server and passed in, so opening a modal never
// re-hits the API. After a create/edit/delete the server action revalidates
// /farms, so this list (and the open modal's farm) reflect changes.
export function FarmsView({
  farms,
  canManage
}: {
  farms: FarmSummary[];
  canManage: boolean;
}) {
  // null = closed; "new" = create; a string = the id of the farm being edited.
  const [editing, setEditing] = useState<string | "new" | null>(null);

  // Resolve the open farm from the current list so a post-edit refresh reflows
  // the modal (or closes it if the farm was deleted out from under it).
  const selected =
    editing && editing !== "new" ? farms.find((f) => f.id === editing) ?? null : null;

  if (farms.length === 0) {
    return (
      <>
        <EmptyState canManage={canManage} onCreate={() => setEditing("new")} />
        <FarmFormModal
          open={editing !== null}
          farm={selected}
          onClose={() => setEditing(null)}
        />
      </>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {farms.map((farm) => (
          <FarmCard
            key={farm.id}
            farm={farm}
            onOpen={canManage ? () => setEditing(farm.id) : undefined}
          />
        ))}

        {canManage ? (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="group flex min-h-[9.5rem] flex-col items-center justify-center gap-2.5 rounded-xl border-2 border-dashed border-base-content/20 bg-base-100 text-base-content/55 transition-colors hover:border-primary/40 hover:bg-base-content/[0.02] hover:text-primary"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-base-content/[0.04] text-base-content/45 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
              <PlusIcon size={24} />
            </span>
            <span className="text-sm font-medium">New farm</span>
          </button>
        ) : null}
      </div>

      <FarmFormModal
        open={editing !== null}
        farm={selected}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

// One farm card: name, location summary, and the field/acre rollup. Becomes a
// clickable button (opens the edit modal) when the viewer can manage farms;
// otherwise it's a static panel.
function FarmCard({ farm, onOpen }: { farm: FarmSummary; onOpen?: () => void }) {
  const location = locationLine(farm);
  const acres = farm.areaAcres ?? 0;

  const body = (
    <>
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <FarmIcon size={20} />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-neutral" title={farm.name}>
            {farm.name}
          </span>
          <span className="flex items-center gap-1 truncate text-xs text-base-content/55">
            <MapPinIcon size={12} />
            <span className="truncate">{location}</span>
          </span>
        </div>
      </div>

      {farm.description ? (
        <p className="line-clamp-2 text-sm text-base-content/65">{farm.description}</p>
      ) : null}

      <div className="mt-auto flex items-center gap-4 border-t border-base-content/10 pt-3 text-xs text-base-content/55">
        <span>
          <span className="font-semibold text-neutral">{farm.fieldCount}</span>{" "}
          {farm.fieldCount === 1 ? "field" : "fields"}
        </span>
        <span>
          <span className="font-semibold text-neutral">
            {acres.toLocaleString("en-US", { maximumFractionDigits: 1 })}
          </span>{" "}
          acres
        </span>
      </div>
    </>
  );

  const className =
    "flex min-h-[9.5rem] flex-col gap-3 rounded-xl border border-base-content/10 bg-base-100 p-4 text-left";

  if (!onOpen) {
    return <div className={className}>{body}</div>;
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${className} transition-colors hover:border-primary/40`}
    >
      {body}
    </button>
  );
}

// A short human location line from the address parts, falling back through the
// pin coordinates to a "no location" hint.
function locationLine(farm: FarmSummary): string {
  const parts = [farm.addressLocality, farm.addressRegion].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  if (farm.addressCountry) return farm.addressCountry;
  if (farm.location) {
    const [lng, lat] = farm.location.coordinates;
    return `${lat.toFixed(3)}, ${lng.toFixed(3)}`;
  }
  return "No location set";
}

// Shown when the org has no farms yet — first-run prompt to add the first one.
function EmptyState({
  canManage,
  onCreate
}: {
  canManage: boolean;
  onCreate: () => void;
}) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-10">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
        <FarmIcon size={24} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold text-neutral">No farms yet</h2>
        <p className="max-w-xl text-sm text-base-content/65">
          {canManage
            ? "Add your first farm to start mapping the operation. Fields, zones, and captures all hang off a farm."
            : "No farms have been set up for this organization yet. An admin or manager can add the first one."}
        </p>
      </div>
      {canManage ? (
        <button
          type="button"
          onClick={onCreate}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90"
        >
          <PlusIcon size={16} />
          Add your first farm
        </button>
      ) : null}
    </section>
  );
}
