import { Link, Navigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";

import { ChromeLayout } from "../components/ChromeLayout.js";
import {
  api,
  type FarmRecord,
  type FieldRecord,
  type ScoutTaskRecord,
  type TeamRecord,
  type ZoneRecord
} from "../lib/api.js";
import { blobToThumbnailDataUrl, nowIso } from "../lib/capture-camera.js";
import { enqueueCapture, getPairedDevice, type PairedDevice } from "../lib/db.js";
import { findFieldAtPoint } from "../lib/geo.js";
import { useLiveRequest } from "../lib/liveRequest.js";
import { setPendingCaptureContext, useActiveSession } from "../lib/session.js";
import { kickUploadWorker } from "../lib/upload.js";

// Single-screen picker: confirm where the operator is, start the session,
// hand off to the capture view. Farm/field/zone come from GPS (the field the
// phone is standing in is pre-selected) but the operator can override with the
// dropdowns; team defaults to their only team. The chosen context rides onto
// every capture the session produces.

export function SessionPickerPage() {
  const { session, loading, start } = useActiveSession();
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadCount, setUploadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState<PairedDevice | null>(null);
  // The operator's own teams + their current pick. 0 teams: no picker. 1 team:
  // read-only chip, that team is sent. 2+: a select (with a "No team" choice).
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [teamId, setTeamId] = useState<string | undefined>(undefined);
  // Where the operator is. Farms + fields load once; GPS pre-selects the field
  // the phone is standing in (and its farm). Zones load for the chosen field.
  const [farms, setFarms] = useState<FarmRecord[]>([]);
  const [fields, setFields] = useState<FieldRecord[]>([]);
  const [zones, setZones] = useState<ZoneRecord[]>([]);
  const [farmId, setFarmId] = useState<string | undefined>(undefined);
  const [fieldId, setFieldId] = useState<string | undefined>(undefined);
  const [zoneId, setZoneId] = useState<string | undefined>(undefined);
  // The operator's open/in-progress scout tasks — walk-outs to do. Tapping one
  // starts a session scoped to that task so its captures link back.
  const [tasks, setTasks] = useState<ScoutTaskRecord[]>([]);
  // Whether this device is configured to go live without watcher approval. Read
  // fresh on open so a portal toggle takes effect without re-pairing.
  const [autoLive, setAutoLive] = useState(false);
  const autoFiredRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  // A paired phone goes live through the request/accept gate; an unpaired phone
  // can still start a capture-only session directly.
  const live = useLiveRequest(device);

  useEffect(() => {
    void getPairedDevice().then(setDevice);
  }, []);

  // Load the operator's teams. Default to their only team when they have exactly
  // one; otherwise leave unassigned and let them pick (server also auto-defaults
  // the single-team case, so this is belt-and-suspenders).
  useEffect(() => {
    let alive = true;
    void api
      .getMyTeams()
      .then(({ teams: mine }) => {
        if (!alive) return;
        setTeams(mine);
        if (mine.length === 1) setTeamId(mine[0].id);
      })
      .catch(() => {
        /* no picker if teams can't be read — server still auto-defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Load farms + fields, then GPS-preselect the field the phone is standing in
  // (and its farm). The operator can still override with the dropdowns.
  useEffect(() => {
    let alive = true;
    void Promise.all([api.listFarms(), api.listFields()])
      .then(async ([farmsRes, fieldsRes]) => {
        if (!alive) return;
        setFarms(farmsRes.farms);
        setFields(fieldsRes.fields);
        const loc = await tryGetLocation();
        if (!alive || !loc) return;
        const match = findFieldAtPoint(fieldsRes.fields, { lng: loc.lng, lat: loc.lat });
        if (match) {
          setFieldId(match.id);
          setFarmId(match.farmId);
        }
      })
      .catch(() => {
        /* no farm/field pickers if they can't be read — start "no field set" */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Load the chosen field's zones for the "No zone" + zones dropdown. Clears when
  // no field is selected.
  useEffect(() => {
    if (!fieldId) {
      setZones([]);
      return;
    }
    let alive = true;
    void api
      .listZones(fieldId)
      .then(({ zones: z }) => {
        if (alive) setZones(z);
      })
      .catch(() => {
        if (alive) setZones([]);
      });
    return () => {
      alive = false;
    };
  }, [fieldId]);

  // Stash the current selection so the go-live *adopt* path (which builds the
  // session from the grant, without this context) can fold it back in. The plain
  // start() path passes the selection directly and doesn't rely on this.
  useEffect(() => {
    void setPendingCaptureContext({ farmId, fieldId, zoneId, teamId });
  }, [farmId, fieldId, zoneId, teamId]);

  // Load the operator's own open/in-progress scout tasks for the "My tasks" list.
  useEffect(() => {
    let alive = true;
    void api
      .getMyScoutTasks()
      .then(({ tasks: mine }) => {
        if (!alive) return;
        // Float immediate tasks to the top of "My tasks".
        const sorted = [...mine].sort(
          (a, b) =>
            (b.priority === "immediate" ? 1 : 0) - (a.priority === "immediate" ? 1 : 0)
        );
        setTasks(sorted);
      })
      .catch(() => {
        /* no task list if it can't be read — the plain start flow still works */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Learn this device's auto-live config once it's known.
  useEffect(() => {
    if (!device) return;
    let alive = true;
    void api
      .getDeviceLiveConfig(device.deviceId)
      .then((cfg) => {
        if (alive) setAutoLive(cfg.autoLiveEnabled);
      })
      .catch(() => {
        /* fall back to the manual request flow if config can't be read */
      });
    return () => {
      alive = false;
    };
  }, [device]);

  // Auto-live: connect to live automatically on open instead of waiting for the
  // operator to tap "Request to go live". Fires once; the server grants
  // immediately and the request hook adopts the session → redirect to /capture.
  useEffect(() => {
    if (!device || !autoLive || autoFiredRef.current) return;
    if (live.status !== "idle") return;
    autoFiredRef.current = true;
    void live.request();
  }, [device, autoLive, live]);

  if (loading) {
    return (
      <ChromeLayout title="Field Capture" eyebrow="CropAutonomy">
        <div className="grid h-full place-items-center text-sm text-base-content/55">
          Loading…
        </div>
      </ChromeLayout>
    );
  }

  if (session) {
    // Declarative redirect — calling navigate() during render emits React
    // warnings about updating BrowserRouter mid-render.
    return <Navigate to="/capture" replace />;
  }

  async function handleStart() {
    setBusy(true);
    setError(null);
    try {
      const initialLocation = await tryGetLocation();
      await start({ initialLocation, farmId, fieldId, zoneId, teamId });
      // No need to navigate — the next render returns <Navigate to="/capture" />.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }

  // Start a session scoped to a scout task: pre-fill farm/field from the task and
  // carry its id so captures collected during the session tag captures.scout_task_id
  // (and flip the task to in_progress on the first one).
  async function handleStartTask(task: ScoutTaskRecord) {
    setBusy(true);
    setError(null);
    try {
      const initialLocation = await tryGetLocation();
      // A manual farm/field pick overrides the task's defaults; otherwise inherit
      // the task's farm/field. Zone/team come from the pickers.
      await start({
        initialLocation,
        teamId,
        scoutTaskId: task.id,
        farmId: farmId ?? task.farmId ?? undefined,
        fieldId: fieldId ?? task.fieldId ?? undefined,
        zoneId
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start session.");
    } finally {
      setBusy(false);
    }
  }

  // Mark a task done straight from the list (e.g. after a walk-out, back at the
  // picker). Optimistically drops it from "My tasks".
  async function handleCompleteTask(task: ScoutTaskRecord) {
    setError(null);
    setTasks((prev) => prev.filter((t) => t.id !== task.id));
    try {
      await api.completeScoutTask(task.id, "done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the task.");
      setTasks((prev) => [task, ...prev]); // put it back on failure
    }
  }

  // Paired phones go live through the gate: fire the request, then wait for a
  // watcher's grant. On grant the hook adopts the session and this page redirects
  // to /capture (the `if (session)` branch below).
  async function handleRequestGoLive() {
    setError(null);
    // Forward farm/field to the server session; zone/team ride to the adopted
    // session via the pending-context merge (persisted by the effect above).
    await live.request({ farmId, fieldId });
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const location = await tryGetLocation();
      let added = 0;
      for (const file of Array.from(files)) {
        const isVideo = file.type.startsWith("video/");
        const isImage = file.type.startsWith("image/");
        if (!isVideo && !isImage) continue;
        const thumb =
          isImage && file.size < 20 * 1024 * 1024
            ? await blobToThumbnailDataUrl(file).catch(() => undefined)
            : undefined;
        await enqueueCapture({
          id: crypto.randomUUID(),
          teamId,
          source: "field_capture_pwa",
          mediaType: isVideo ? "video" : "photo",
          mimeType: file.type || (isVideo ? "video/mp4" : "image/jpeg"),
          sizeBytes: file.size,
          capturedAt: new Date(file.lastModified || Date.now()).toISOString(),
          location,
          thumbnailDataUrl: thumb,
          blob: file
        });
        added += 1;
      }
      setUploadCount((prev) => prev + added);
      kickUploadWorker();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not queue upload.");
    } finally {
      setUploading(false);
      if (uploadInputRef.current) uploadInputRef.current.value = "";
    }
  }

  return (
    <ChromeLayout title="Field Capture" eyebrow="CropAutonomy">
      <div className="flex h-full flex-col gap-6 px-6 pb-8 pt-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-neutral">
            Ready to walk a field
          </h2>
          <p className="mt-2 text-base text-base-content/65">
            Start a session and the portal will see your captures as they come in.
            We&rsquo;ll guess your field from GPS — check the farm, field, and zone
            below before you start.
          </p>
        </div>

        {farms.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm text-base-content/65">
            <span className="font-medium text-base-content/50">Farm</span>
            <select
              value={farmId ?? ""}
              onChange={(e) => {
                const next = e.currentTarget.value || undefined;
                setFarmId(next);
                // Drop a field (and its zone) that doesn't belong to the new farm.
                if (fieldId && next) {
                  const f = fields.find((x) => x.id === fieldId);
                  if (f && f.farmId !== next) {
                    setFieldId(undefined);
                    setZoneId(undefined);
                  }
                }
              }}
              className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-base font-medium text-neutral shadow-sm"
            >
              <option value="">No farm</option>
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {fields.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm text-base-content/65">
            <span className="font-medium text-base-content/50">Field</span>
            <select
              value={fieldId ?? ""}
              onChange={(e) => {
                const next = e.currentTarget.value || undefined;
                setFieldId(next);
                setZoneId(undefined);
                // Sync the farm to the field's parent so the pair stays consistent.
                if (next) {
                  const f = fields.find((x) => x.id === next);
                  if (f) setFarmId(f.farmId);
                }
              }}
              className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-base font-medium text-neutral shadow-sm"
            >
              <option value="">No field</option>
              {(farmId ? fields.filter((f) => f.farmId === farmId) : fields).map((field) => (
                <option key={field.id} value={field.id}>
                  {field.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {fieldId && zones.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm text-base-content/65">
            <span className="font-medium text-base-content/50">Zone</span>
            <select
              value={zoneId ?? ""}
              onChange={(e) => setZoneId(e.currentTarget.value || undefined)}
              className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-base font-medium text-neutral shadow-sm"
            >
              <option value="">No zone</option>
              {zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {teams.length === 1 && (
          <div className="flex items-center gap-2 text-sm text-base-content/65">
            <span className="font-medium text-base-content/50">Team</span>
            <span
              className="inline-flex items-center gap-1.5 rounded-full border border-base-content/15 bg-base-100 px-3 py-1 font-medium text-neutral"
            >
              {teams[0].color && (
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: teams[0].color }}
                  aria-hidden
                />
              )}
              {teams[0].name}
            </span>
          </div>
        )}

        {teams.length > 1 && (
          <label className="flex flex-col gap-1.5 text-sm text-base-content/65">
            <span className="font-medium text-base-content/50">Team</span>
            <select
              value={teamId ?? ""}
              onChange={(e) => setTeamId(e.currentTarget.value || undefined)}
              className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-base font-medium text-neutral shadow-sm"
            >
              <option value="">No team</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {tasks.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-base-content/50">My tasks today</h3>
            <ul className="flex flex-col gap-2">
              {tasks.map((task) => (
                <li
                  key={task.id}
                  className={`flex items-start gap-2 rounded-md bg-base-100 px-3 py-3 shadow-sm ${
                    task.priority === "immediate"
                      ? "border-2 border-error"
                      : "border border-base-content/15"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void handleCompleteTask(task)}
                    disabled={busy || uploading}
                    aria-label="Mark task done"
                    className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border-[1.5px] border-base-content/30 transition-colors hover:border-success hover:bg-success/10 disabled:opacity-60"
                  >
                    <span className="sr-only">Done</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleStartTask(task)}
                    disabled={busy || uploading}
                    className="flex min-w-0 flex-1 items-start gap-3 text-left transition-opacity disabled:opacity-60"
                  >
                    <span
                      className={`mt-0.5 h-2.5 w-2.5 flex-shrink-0 rounded-full ${
                        task.priority === "immediate" || task.priority === "high"
                          ? "bg-error"
                          : "bg-primary"
                      }`}
                      aria-hidden
                    />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-medium text-neutral">{task.title}</span>
                      <span className="mt-0.5 text-xs text-base-content/55">
                        {task.priority === "immediate" ? "Immediate · " : ""}
                        {task.status === "in_progress" ? "In progress · " : ""}
                        {task.dueOn ? `Due ${task.dueOn}` : "No date"}
                        {task.captureCount > 0
                          ? ` · ${task.captureCount} ${task.captureCount === 1 ? "capture" : "captures"}`
                          : ""}
                      </span>
                    </span>
                    <span className="mt-0.5 text-xs font-semibold text-primary">Start →</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {error}
          </div>
        )}

        {uploadCount > 0 && (
          <div className="rounded-md border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-base-content/75">
            Queued {uploadCount} {uploadCount === 1 ? "file" : "files"} for upload.
            They&rsquo;ll sync from the queue tab.
          </div>
        )}

        {device && (live.status === "pending" || live.status === "requesting") && (
          <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-base-content/80">
            <div className="flex items-center justify-between gap-3">
              <span>
                {autoLive
                  ? `Connecting “${device.deviceName}” to live…`
                  : `Waiting for a supervisor to accept “${device.deviceName}”…`}
              </span>
              <button
                type="button"
                onClick={() => void live.cancel()}
                className="font-semibold text-base-content/60 hover:text-error"
              >
                Cancel
              </button>
            </div>
            {live.debug ? (
              <p className="font-mono text-[11px] leading-tight text-base-content/55">
                {live.debug}
              </p>
            ) : null}
          </div>
        )}
        {device && live.status === "rejected" && (
          <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-warning/40 bg-warning/[0.07] px-5 py-5">
            <span className="rounded-full bg-warning/20 px-2.5 py-1 text-xs font-semibold text-warning">
              Request declined
            </span>
            <h2 className="text-base font-semibold text-neutral">Held at the gate.</h2>
            <p className="text-sm leading-relaxed text-base-content/70">
              A supervisor didn&rsquo;t wave “{device.deviceName}” onto the live wall
              this time. No harm done — line up another request whenever you&rsquo;re
              ready to roll.
            </p>
            <button
              type="button"
              onClick={handleRequestGoLive}
              className="mt-1 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content shadow-sm hover:bg-primary/90"
            >
              Request again
            </button>
          </section>
        )}
        {device && live.status === "error" && live.error && (
          <div className="rounded-md border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
            {live.error}
          </div>
        )}

        <div className="mt-auto flex flex-col gap-3">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={device ? handleRequestGoLive : handleStart}
              disabled={busy || uploading || live.status === "requesting" || live.status === "pending"}
              className="flex h-16 flex-1 items-center justify-center rounded-md bg-primary text-base font-semibold text-primary-content shadow-sm disabled:opacity-60"
            >
              {device
                ? live.status === "pending" || live.status === "requesting"
                  ? autoLive
                    ? "Connecting…"
                    : "Requested…"
                  : autoLive
                    ? "Connect to live"
                    : "Request to go live"
                : busy
                  ? "Starting…"
                  : "Start session"}
            </button>
            <button
              type="button"
              onClick={() => uploadInputRef.current?.click()}
              disabled={busy || uploading}
              className="flex h-16 flex-1 items-center justify-center rounded-md border border-base-content/15 bg-base-100 text-base font-semibold text-neutral shadow-sm disabled:opacity-60"
            >
              {uploading ? "Queuing…" : "Upload"}
            </button>
          </div>
          {device ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={busy || uploading}
              className="text-sm font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline disabled:opacity-60"
            >
              {busy ? "Starting…" : "Start a capture-only session instead"}
            </button>
          ) : (
            <Link
              to="/pair"
              className="text-sm font-medium text-base-content/55 underline-offset-2 hover:text-neutral hover:underline"
            >
              Pair this phone as a camera
            </Link>
          )}
        </div>

        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(e) => void handleUpload(e.currentTarget.files)}
        />
      </div>
    </ChromeLayout>
  );
}

async function tryGetLocation(): Promise<
  { lat: number; lng: number; accuracyMeters?: number } | undefined
> {
  if (!("geolocation" in navigator)) return undefined;
  return await new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracyMeters: p.coords.accuracy
        }),
      () => resolve(undefined),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 8000 }
    );
  });
}
