import type { ReactNode } from "react";

import {
  GROWTH_STAGES,
  SPECIES,
  type CropSpecies,
  type GrowthStage,
  type Weather
} from "../crop";
import { useSimStore } from "../store/simStore";
import type { TimeOfDay } from "../types";

const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: "dawn", label: "Dawn" },
  { id: "day", label: "Day" },
  { id: "dusk", label: "Dusk" },
  { id: "night", label: "Night" }
];

const SPECIES_LIST = Object.values(SPECIES);
const WEATHERS: { id: Weather; label: string }[] = [
  { id: "clear", label: "Clear" },
  { id: "cloudy", label: "Cloudy" },
  { id: "rain", label: "Rain" },
  { id: "fog", label: "Fog" },
  { id: "dust", label: "Dust" }
];

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatClock(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// DOM overlay HUD. Deliberately quiet/industrial — status, telemetry, and the
// core sim controls (play / pause / reset / environment). Panels use the portal's
// DaisyUI tokens so the sim reads as part of the console, not a game.
export function Hud() {
  const running = useSimStore((s) => s.running);
  const elapsed = useSimStore((s) => s.elapsed);
  const fps = useSimStore((s) => s.fps);
  const timeOfDay = useSimStore((s) => s.timeOfDay);
  const showGrid = useSimStore((s) => s.showGrid);
  const showRows = useSimStore((s) => s.showRows);
  const showCrops = useSimStore((s) => s.showCrops);
  const navMode = useSimStore((s) => s.navMode);
  const waypointCount = useSimStore((s) => s.waypoints.length);
  const species = useSimStore((s) => s.species);
  const growthStage = useSimStore((s) => s.growthStage);
  const weather = useSimStore((s) => s.weather);
  const cropCount = useSimStore((s) => s.crops.length);
  const telemetry = useSimStore((s) => s.telemetry);

  const toggleRun = useSimStore((s) => s.toggleRun);
  const reset = useSimStore((s) => s.reset);
  const setTimeOfDay = useSimStore((s) => s.setTimeOfDay);
  const toggleGrid = useSimStore((s) => s.toggleGrid);
  const toggleRows = useSimStore((s) => s.toggleRows);
  const toggleCrops = useSimStore((s) => s.toggleCrops);
  const setNavMode = useSimStore((s) => s.setNavMode);
  const clearWaypoints = useSimStore((s) => s.clearWaypoints);
  const setSpecies = useSimStore((s) => s.setSpecies);
  const setGrowthStage = useSimStore((s) => s.setGrowthStage);
  const setWeather = useSimStore((s) => s.setWeather);
  const regenerate = useSimStore((s) => s.regenerate);

  const batteryPct = Math.round(telemetry.battery * 100);
  const batteryTone =
    batteryPct > 40 ? "bg-success" : batteryPct > 15 ? "bg-warning" : "bg-error";
  const headingDeg = Math.round(((telemetry.heading % (Math.PI * 2)) * 180) / Math.PI);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* Top-left: identity + status */}
      <div className="absolute left-4 top-4 flex flex-col gap-2">
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-base-content/10 bg-base-100/80 px-3.5 py-2 backdrop-blur">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-base-content/60">
            Virtual Field
          </span>
          <span
            className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              running ? "bg-success/15 text-success" : "bg-base-content/10 text-base-content/60"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                running ? "animate-pulse bg-success" : "bg-base-content/40"
              }`}
            />
            {running ? "Running" : "Paused"}
          </span>
          <span className="font-mono text-xs tabular-nums text-base-content/70">
            {formatClock(elapsed)}
          </span>
        </div>

        {/* Navigation mode */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-base-content/10 bg-base-100/80 px-2.5 py-1.5 backdrop-blur">
          <span className="text-[11px] uppercase tracking-wide text-base-content/50">Nav</span>
          <div className="join">
            <button
              type="button"
              onClick={() => setNavMode("coverage")}
              className={`btn btn-xs join-item ${
                navMode === "coverage" ? "btn-primary" : "btn-ghost"
              }`}
            >
              Coverage
            </button>
            <button
              type="button"
              onClick={() => setNavMode("waypoints")}
              className={`btn btn-xs join-item ${
                navMode === "waypoints" ? "btn-primary" : "btn-ghost"
              }`}
            >
              Waypoints
            </button>
          </div>
          {navMode === "waypoints" ? (
            <>
              <span className="font-mono text-[11px] tabular-nums text-base-content/60">
                {waypointCount}
              </span>
              <button
                type="button"
                onClick={clearWaypoints}
                disabled={waypointCount === 0}
                className="btn btn-xs btn-ghost disabled:opacity-40"
              >
                Clear
              </button>
            </>
          ) : null}
        </div>

        {navMode === "waypoints" && waypointCount === 0 ? (
          <span className="rounded-md bg-base-100/70 px-2 py-1 text-[11px] text-base-content/60 backdrop-blur">
            Click the ground to drop waypoints.
          </span>
        ) : null}
      </div>

      {/* Top-right: performance + field/environment controls */}
      <div className="absolute right-4 top-4 flex w-56 flex-col items-end gap-2">
        <div className="pointer-events-auto rounded-lg border border-base-content/10 bg-base-100/80 px-3 py-1.5 backdrop-blur">
          <span className="font-mono text-xs tabular-nums text-base-content/70">{fps} FPS</span>
        </div>

        <div className="pointer-events-auto w-full rounded-lg border border-base-content/10 bg-base-100/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
              Field
            </span>
            <span className="font-mono text-[11px] tabular-nums text-base-content/50">
              {cropCount.toLocaleString()} plants
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <Field label="Crop">
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value as CropSpecies)}
                className="select select-xs w-full border-base-content/15 bg-base-100 font-medium"
              >
                {SPECIES_LIST.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Growth">
              <select
                value={growthStage}
                onChange={(e) => setGrowthStage(e.target.value as GrowthStage)}
                className="select select-xs w-full border-base-content/15 bg-base-100 font-medium"
              >
                {GROWTH_STAGES.map((g) => (
                  <option key={g} value={g}>
                    {titleCase(g)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weather">
              <select
                value={weather}
                onChange={(e) => setWeather(e.target.value as Weather)}
                className="select select-xs w-full border-base-content/15 bg-base-100 font-medium"
              >
                {WEATHERS.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.label}
                  </option>
                ))}
              </select>
            </Field>
            <button
              type="button"
              onClick={regenerate}
              className="btn btn-xs btn-ghost mt-0.5 justify-start px-1 text-base-content/70"
            >
              ↻ Regenerate field
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-left: robot telemetry */}
      <div className="absolute bottom-4 left-4 pointer-events-auto w-60 rounded-lg border border-base-content/10 bg-base-100/80 p-3.5 backdrop-blur">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
            Rover-01
          </span>
          <span className="text-[11px] text-base-content/50">placeholder</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Metric label="Position" value={`${telemetry.position.x.toFixed(1)}, ${telemetry.position.z.toFixed(1)}`} />
          <Metric label="Heading" value={`${headingDeg}°`} />
          <Metric label="Speed" value={`${telemetry.speed.toFixed(1)} m/s`} />
          <Metric label="Battery" value={`${batteryPct}%`} />
        </dl>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-base-content/10">
          <div className={`h-full rounded-full ${batteryTone}`} style={{ width: `${batteryPct}%` }} />
        </div>
      </div>

      {/* Bottom-center: controls */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="flex items-center gap-2 rounded-xl border border-base-content/10 bg-base-100/85 px-3 py-2 backdrop-blur">
          <button
            type="button"
            onClick={toggleRun}
            className={`btn btn-sm ${running ? "btn-neutral" : "btn-primary"} min-w-[5.5rem]`}
          >
            {running ? "Pause" : "Run"}
          </button>
          <button type="button" onClick={reset} className="btn btn-sm btn-ghost">
            Reset
          </button>

          <div className="mx-1 h-6 w-px bg-base-content/10" />

          <div className="join">
            {TIMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTimeOfDay(t.id)}
                className={`btn btn-xs join-item ${
                  timeOfDay === t.id ? "btn-primary" : "btn-ghost"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mx-1 h-6 w-px bg-base-content/10" />

          <button
            type="button"
            onClick={toggleGrid}
            className={`btn btn-xs ${showGrid ? "btn-secondary" : "btn-ghost"}`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={toggleRows}
            className={`btn btn-xs ${showRows ? "btn-secondary" : "btn-ghost"}`}
          >
            Rows
          </button>
          <button
            type="button"
            onClick={toggleCrops}
            className={`btn btn-xs ${showCrops ? "btn-secondary" : "btn-ghost"}`}
          >
            Crops
          </button>
        </div>
      </div>

      {/* Bottom-right: onboard camera feed. This is just the labelled frame — the
          live image is the WebGL picture-in-picture drawn by <OnboardView />,
          which anchors to the exact same corner + size (see PIP in OnboardView). */}
      <div className="pointer-events-none absolute bottom-4 right-4 h-[148px] w-[232px] overflow-hidden rounded-md border border-base-content/25 shadow-lg">
        <div className="absolute left-0 top-0 flex items-center gap-1.5 rounded-br-md bg-base-100/80 px-2 py-1 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">
            RGB · Rover-01
          </span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[10px] uppercase tracking-wide text-base-content/45">{label}</dt>
      <dd className="font-mono tabular-nums text-base-content/85">{value}</dd>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-[11px] text-base-content/55">{label}</span>
      {children}
    </label>
  );
}
