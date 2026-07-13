"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { MarkerDragEvent } from "react-map-gl/mapbox";
import { MapPanel, Marker, MapPinIcon } from "@gaia/ui";
import type { FarmSummary, FarmWrite, TeamSummary } from "../../../lib/api";
import { TeamMultiSelect } from "../_components/TeamMultiSelect";
import { UnsavedChangesPrompt } from "../_components/UnsavedChangesPrompt";
import {
  createFarmAction,
  deleteFarmAction,
  setFarmTeamAction,
  timezoneForCoordsAction,
  updateFarmAction
} from "./actions";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

// Quick-pick timezones, labeled by abbreviation (PST, EST, …). The stored value
// is always the IANA name (what the DB column holds + what tz-lookup returns);
// the abbreviation is just the label. An auto-filled zone outside this list is
// rendered as its own option at render time.
const COMMON_ZONES: { tz: string; region: string }[] = [
  { tz: "America/New_York", region: "Eastern" },
  { tz: "America/Chicago", region: "Central" },
  { tz: "America/Denver", region: "Mountain" },
  { tz: "America/Phoenix", region: "Arizona" },
  { tz: "America/Los_Angeles", region: "Pacific" },
  { tz: "America/Anchorage", region: "Alaska" },
  { tz: "Pacific/Honolulu", region: "Hawaii" }
];

// Current short abbreviation for an IANA zone (DST-aware), e.g. "PST" / "PDT".
// Falls back to the raw name / GMT offset when no abbreviation exists.
function tzAbbrev(tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "short"
    }).formatToParts(new Date());
    return parts.find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}
// Continental-US framing for a farm that has no pin yet — zoomed out enough that
// the operator can find their ground with a click or two.
const DEFAULT_VIEW = { longitude: -95.57, latitude: 39.835, zoom: 3.4 };

type Coords = { lat: number; lng: number };

// Create / edit a farm. Native <dialog> (Escape + backdrop close), driven by the
// `open` flag from FarmsView. `farm === null` while open = create mode; a farm =
// edit mode. Submitting goes through a server action that revalidates /farms, so
// the grid reflects the change after onClose.
export function FarmFormModal({
  open,
  farm,
  teams,
  canAssignTeams,
  onClose
}: {
  open: boolean;
  farm: FarmSummary | null;
  // All org teams + whether the caller may file this farm onto them (teams.assign).
  teams: TeamSummary[];
  canAssignTeams: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const isEdit = farm != null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [addressLocality, setAddressLocality] = useState("");
  const [addressRegion, setAddressRegion] = useState("");
  const [addressPostalCode, setAddressPostalCode] = useState("");
  const [addressCountry, setAddressCountry] = useState("");
  const [timezone, setTimezone] = useState("");
  const [location, setLocation] = useState<Coords | null>(null);
  // Fed to MapPanel.recenterTo to fly the map after geocoding a typed address.
  const [recenter, setRecenter] = useState<{ lng: number; lat: number; zoom?: number } | null>(
    null
  );
  const [geocoding, setGeocoding] = useState(false);
  // Flips true once the user edits an address field, so we geocode their input
  // and not the address we seed when an existing farm opens.
  const addressDirtyRef = useRef(false);
  // Flips true on any user-driven location change (map click, drag, geocode), so
  // we re-derive the timezone — but not when we seed an existing farm's pin.
  const locationDirtyRef = useRef(false);
  // The postal code / country we last auto-filled from a geocode. Lets a later
  // lookup (e.g. after the city changed) refresh them, while never overwriting a
  // value the operator typed themselves.
  const autofilledPostalRef = useRef<string | null>(null);
  const autofilledCountryRef = useRef<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Team assignment (edit only; optimistic — each toggle persists immediately).
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamBusy, setTeamBusy] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);

  // Tracks real user edits (not programmatic seeding) so closing with unsaved
  // changes can prompt to save.
  const dirtyRef = useRef(false);
  const [closePrompt, setClosePrompt] = useState(false);
  const markDirty = () => {
    dirtyRef.current = true;
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // Seed the form when the dialog opens (or switches to a different farm). Keyed
  // on the farm id + open so an in-place refresh of the farm prop doesn't clobber
  // edits the user is mid-way through.
  const farmId = farm?.id;
  useEffect(() => {
    if (!open) return;
    setName(farm?.name ?? "");
    setDescription(farm?.description ?? "");
    setAddressLine1(farm?.addressLine1 ?? "");
    setAddressLine2(farm?.addressLine2 ?? "");
    setAddressLocality(farm?.addressLocality ?? "");
    setAddressRegion(farm?.addressRegion ?? "");
    setAddressPostalCode(farm?.addressPostalCode ?? "");
    setAddressCountry(farm?.addressCountry ?? "");
    setTimezone(farm?.timezone ?? "");
    setLocation(
      farm?.location
        ? { lng: farm.location.coordinates[0], lat: farm.location.coordinates[1] }
        : null
    );
    setSaving(false);
    setConfirmingDelete(false);
    setDeleting(false);
    setError(null);
    setRecenter(null);
    setGeocoding(false);
    setTeamIds(farm?.teamIds ?? []);
    setTeamBusy(null);
    setTeamError(null);
    addressDirtyRef.current = false;
    locationDirtyRef.current = false;
    autofilledPostalRef.current = null;
    autofilledCountryRef.current = null;
    dirtyRef.current = false;
    setClosePrompt(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, farmId]);

  // Toggle this farm on/off one team. Optimistic; reverts on failure. Persists
  // immediately (no Save needed) — separate from the form's fields.
  async function onToggleTeam(teamId: string, assigned: boolean) {
    if (!farm) return;
    const prev = teamIds;
    setTeamBusy(teamId);
    setTeamError(null);
    setTeamIds(assigned ? [...prev, teamId] : prev.filter((t) => t !== teamId));
    try {
      await setFarmTeamAction(farm.id, teamId, assigned);
      router.refresh();
    } catch (err) {
      setTeamIds(prev);
      setTeamError(err instanceof Error ? err.message : "Couldn't update the farm's teams.");
    } finally {
      setTeamBusy(null);
    }
  }

  // Move the pin from a user action (map click / drag / geocode) and flag it so
  // the timezone re-derives. Seeding an existing farm's pin uses setLocation
  // directly, so it never trips this.
  function setLocationFromUser(coords: Coords) {
    locationDirtyRef.current = true;
    markDirty();
    setLocation(coords);
  }

  // Re-derive the timezone whenever the user fixes the location. Debounced so a
  // flurry of map clicks coalesces into one lookup; skipped on the seeded pin.
  useEffect(() => {
    if (!location || !locationDirtyRef.current) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const tz = await timezoneForCoordsAction(location.lat, location.lng);
      if (!cancelled && tz) setTimezone(tz);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [location]);

  // Geocode the typed address (debounced) and fly the map + drop the pin there.
  // Only runs after the user actually edits an address field — never on the seed.
  useEffect(() => {
    if (!open || !MAPBOX_TOKEN || !addressDirtyRef.current) return;
    const query = [addressLine1, addressLocality, addressRegion, addressPostalCode, addressCountry]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", ");
    if (query.length < 4) return;
    const handle = setTimeout(() => void geocodeAddress(query), 700);
    return () => clearTimeout(handle);
    // Driven by the street/city/state fields only. Postal code + country are
    // OUTPUTS we auto-fill from the geocode result below, so they're kept out of
    // the deps — otherwise auto-filling them would re-trigger this lookup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, addressLine1, addressLocality, addressRegion]);

  async function geocodeAddress(query: string) {
    setGeocoding(true);
    try {
      const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(
        query
      )}&limit=1&access_token=${MAPBOX_TOKEN}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const data = (await res.json()) as {
        features?: Array<{
          geometry?: { coordinates?: [number, number] };
          // v6 returns the resolved address components under properties.context.
          properties?: {
            context?: {
              postcode?: { name?: string };
              country?: { name?: string };
            };
          };
        }>;
      };
      const feature = data.features?.[0];
      const coords = feature?.geometry?.coordinates;
      if (!coords) return;
      const [lng, lat] = coords;
      setLocationFromUser({ lat, lng });
      setRecenter({ lng, lat, zoom: 13 });
      // Timezone is re-derived by the location effect.

      // Backfill the postal code + country the geocoder resolved. Only overwrite
      // a field that's blank or still holds our own previous auto-fill — a value
      // the operator typed themselves is left untouched.
      const ctx = feature?.properties?.context;
      const postcode = ctx?.postcode?.name?.trim();
      const country = ctx?.country?.name?.trim();
      if (postcode) {
        setAddressPostalCode((cur) => {
          if (cur.trim() && cur !== autofilledPostalRef.current) return cur;
          autofilledPostalRef.current = postcode;
          return postcode;
        });
      }
      if (country) {
        setAddressCountry((cur) => {
          if (cur.trim() && cur !== autofilledCountryRef.current) return cur;
          autofilledCountryRef.current = country;
          return country;
        });
      }
    } catch {
      // Network/geocode failures are non-fatal — the manual pin still works.
    } finally {
      setGeocoding(false);
    }
  }

  // Wrap an address setter so editing it marks the address dirty (enables geocode).
  function editAddress(setter: (v: string) => void, value: string) {
    addressDirtyRef.current = true;
    markDirty();
    setter(value);
  }

  async function save() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setClosePrompt(false);
      setError("Farm name is required.");
      return;
    }
    setClosePrompt(false);
    setSaving(true);
    setError(null);
    const body: FarmWrite & { name: string } = {
      name: trimmedName,
      description: description.trim() || null,
      addressLine1: addressLine1.trim() || null,
      addressLine2: addressLine2.trim() || null,
      addressLocality: addressLocality.trim() || null,
      addressRegion: addressRegion.trim() || null,
      addressPostalCode: addressPostalCode.trim() || null,
      addressCountry: addressCountry.trim() || null,
      timezone: timezone.trim() || null,
      location
    };
    try {
      if (isEdit && farm) {
        await updateFarmAction(farm.id, body);
      } else {
        await createFarmAction(body);
      }
      onClose();
    } catch (err) {
      setSaving(false);
      setError(err instanceof Error ? err.message : "Couldn't save the farm.");
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    void save();
  }

  // Guarded close: prompt to save when there are unsaved edits, otherwise close.
  function requestClose() {
    if (saving || deleting) return;
    if (dirtyRef.current) setClosePrompt(true);
    else onClose();
  }

  async function onDelete() {
    if (!farm) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteFarmAction(farm.id);
      onClose();
    } catch (err) {
      setDeleting(false);
      setConfirmingDelete(false);
      // The API 409s with a "remove this farm's fields first" message when the
      // farm still has fields — surface it verbatim.
      setError(err instanceof Error ? err.message : "Couldn't delete the farm.");
    }
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        // Escape — intercept so we can prompt before closing.
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
      className="m-auto w-full max-w-2xl rounded-xl border border-base-content/10 bg-base-100 p-0 text-base-content shadow-lg backdrop:bg-neutral/40"
    >
      <form onSubmit={onSubmit} className="relative flex max-h-[85vh] flex-col">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-base-content/10 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral">
            {isEdit ? "Edit farm" : "New farm"}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1 text-base-content/55 transition-colors hover:bg-base-content/[0.06] hover:text-neutral"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
          <Field label="Farm name" required>
            <input
              type="text"
              value={name}
              maxLength={200}
              onChange={(e) => {
                setName(e.target.value);
                markDirty();
              }}
              placeholder="e.g. Home Quarter"
              className={inputClass}
              autoFocus
            />
          </Field>

          {/* Teams — which crews this farm belongs to (edit only; a farm can be
              on several). Each toggle persists immediately. */}
          {isEdit && canAssignTeams ? (
            <>
              <TeamMultiSelect
                teams={teams}
                selectedIds={teamIds}
                busyId={teamBusy}
                subjectLabel="farm"
                inline
                onToggle={onToggleTeam}
              />
              {teamError ? <p className="text-sm text-error">{teamError}</p> : null}
            </>
          ) : null}

          <Field label="Description">
            <textarea
              value={description}
              maxLength={2000}
              rows={2}
              onChange={(e) => {
                setDescription(e.target.value);
                markDirty();
              }}
              placeholder="Optional notes about this operation"
              className={`${inputClass} resize-none`}
            />
          </Field>

          {/* Address */}
          <fieldset className="flex flex-col gap-3">
            <legend className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
              Address
            </legend>
            <Field label="Street">
              <input
                type="text"
                value={addressLine1}
                maxLength={200}
                onChange={(e) => editAddress(setAddressLine1, e.target.value)}
                placeholder="Line 1"
                className={inputClass}
              />
            </Field>
            <input
              type="text"
              value={addressLine2}
              maxLength={200}
              onChange={(e) => {
                setAddressLine2(e.target.value);
                markDirty();
              }}
              placeholder="Line 2 (optional)"
              className={inputClass}
              aria-label="Address line 2"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="City / locality">
                <input
                  type="text"
                  value={addressLocality}
                  maxLength={120}
                  onChange={(e) => editAddress(setAddressLocality, e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="State / region">
                <input
                  type="text"
                  value={addressRegion}
                  maxLength={120}
                  onChange={(e) => editAddress(setAddressRegion, e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Postal code">
                <input
                  type="text"
                  value={addressPostalCode}
                  maxLength={40}
                  onChange={(e) => editAddress(setAddressPostalCode, e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Country">
                <input
                  type="text"
                  value={addressCountry}
                  maxLength={120}
                  onChange={(e) => editAddress(setAddressCountry, e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Timezone">
              <select
                value={timezone}
                onChange={(e) => {
                  setTimezone(e.target.value);
                  markDirty();
                }}
                className={inputClass}
              >
                <option value="">Select timezone…</option>
                {/* An auto-filled / seeded zone outside the quick-pick list stays
                    selectable, labeled by its own abbreviation. */}
                {timezone && !COMMON_ZONES.some((z) => z.tz === timezone) ? (
                  <option value={timezone}>
                    {tzAbbrev(timezone)} · {timezone}
                  </option>
                ) : null}
                {COMMON_ZONES.map((z) => (
                  <option key={z.tz} value={z.tz}>
                    {tzAbbrev(z.tz)} · {z.region}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>

          {/* Location pin */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-base-content/45">
                Location pin
              </span>
              {location ? (
                <button
                  type="button"
                  onClick={() => {
                    setLocation(null);
                    markDirty();
                  }}
                  className="text-xs font-medium text-base-content/55 transition-colors hover:text-error"
                >
                  Clear pin
                </button>
              ) : null}
            </div>
            {MAPBOX_TOKEN ? (
              open ? (
                <MapPanel
                  key={farmId ?? "new"}
                  header={{
                    title: "Centroid",
                    meta: geocoding
                      ? "Finding address…"
                      : location
                        ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                        : "Click the map or type an address"
                  }}
                  initialViewState={
                    location
                      ? { longitude: location.lng, latitude: location.lat, zoom: 12 }
                      : DEFAULT_VIEW
                  }
                  mapboxAccessToken={MAPBOX_TOKEN}
                  height={240}
                  enableFullscreen
                  recenterTo={recenter}
                  recenterTarget={
                    location ? { lng: location.lng, lat: location.lat, zoom: 13 } : null
                  }
                  footerLeft={null}
                  footerRight={null}
                  onMapClick={(c) => setLocationFromUser({ lat: c.lat, lng: c.lng })}
                >
                  {location ? (
                    <Marker
                      latitude={location.lat}
                      longitude={location.lng}
                      anchor="bottom"
                      draggable
                      onDragEnd={(e: MarkerDragEvent) =>
                        setLocationFromUser({ lat: e.lngLat.lat, lng: e.lngLat.lng })
                      }
                    >
                      <span className="text-primary drop-shadow">
                        <MapPinIcon size={28} />
                      </span>
                    </Marker>
                  ) : null}
                </MapPanel>
              ) : null
            ) : (
              <p className="rounded-lg border border-dashed border-base-content/20 bg-base-content/[0.02] px-4 py-3 text-xs text-base-content/55">
                Set <code className="rounded bg-base-content/[0.06] px-1 py-0.5">NEXT_PUBLIC_MAPBOX_TOKEN</code> to drop a
                location pin. The address still saves without it.
              </p>
            )}
          </div>

          {error ? <p className="text-sm text-error">{error}</p> : null}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 border-t border-base-content/10 px-6 py-4">
          {isEdit ? (
            confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-base-content/65">Delete permanently?</span>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="rounded-md px-2.5 py-1.5 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={deleting}
                  className="rounded-md bg-error px-3 py-1.5 text-sm font-semibold text-error-content transition-colors hover:bg-error/90 disabled:opacity-50"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium text-error transition-colors hover:bg-error/10"
              >
                Delete farm
              </button>
            )
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-md px-3.5 py-2 text-sm font-medium text-base-content/65 transition-colors hover:text-neutral"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "Saving…" : isEdit ? "Save changes" : "Create farm"}
            </button>
          </div>
        </div>

        <UnsavedChangesPrompt
          open={closePrompt}
          saving={saving}
          onSave={() => void save()}
          onDiscard={onClose}
          onKeepEditing={() => setClosePrompt(false)}
        />
      </form>
    </dialog>
  );
}

const inputClass =
  "w-full rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm text-neutral outline-none transition-colors focus:border-primary/50";

function Field({
  label,
  required,
  children
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-base-content/65">
        {label}
        {required ? <span className="text-error"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
