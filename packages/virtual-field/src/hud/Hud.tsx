import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";

import { captureScenario, downloadScenario, parseScenario } from "../scenario";

import {
  GROWTH_STAGES,
  SPECIES,
  type CropSpecies,
  type GrowthStage,
  type Weather
} from "../crop";
import { DEVICE_SPECS, MAX_DEVICES, deviceName, deviceSpec } from "../device";
import { PIP } from "../scene/OnboardView";
import { useSimStore } from "../store/simStore";
import type { TimeOfDay } from "../types";

function toggleFullscreen() {
  const el = document.getElementById("virtual-field-root");
  if (!document.fullscreenElement) el?.requestFullscreen?.();
  else document.exitFullscreen?.();
}

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
  const obstacleCount = useSimStore((s) => s.obstacles.length);
  const telemetry = useSimStore((s) => s.telemetry);
  const sensors = useSimStore((s) => s.sensors);
  const showLidar = useSimStore((s) => s.showLidar);
  const sensorNoise = useSimStore((s) => s.sensorNoise);
  const rtk = useSimStore((s) => s.rtk);
  const cameraMode = useSimStore((s) => s.cameraMode);
  const showDetections = useSimStore((s) => s.showDetections);
  const detections = useSimStore((s) => s.detections);
  const captureCount = useSimStore((s) => s.captureCount);
  const aiRunning = useSimStore((s) => s.aiRunning);
  const aiPredictions = useSimStore((s) => s.aiPredictions);
  const aiStats = useSimStore((s) => s.aiStats);
  const devices = useSimStore((s) => s.devices);
  const activeDevice = useSimStore((s) => s.activeDevice);
  const activeSpec = deviceSpec(devices[activeDevice] ?? "gaia_r");
  const fleet = useSimStore((s) => s.fleet);

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
  const returnHome = useSimStore((s) => s.returnHome);
  const regenerateObstacles = useSimStore((s) => s.regenerateObstacles);
  const clearObstacles = useSimStore((s) => s.clearObstacles);
  const toggleLidar = useSimStore((s) => s.toggleLidar);
  const toggleSensorNoise = useSimStore((s) => s.toggleSensorNoise);
  const toggleRtk = useSimStore((s) => s.toggleRtk);
  const setCameraMode = useSimStore((s) => s.setCameraMode);
  const toggleDetections = useSimStore((s) => s.toggleDetections);
  const requestCapture = useSimStore((s) => s.requestCapture);
  const loadScenario = useSimStore((s) => s.loadScenario);
  const seed = useSimStore((s) => s.seed);
  const toggleAi = useSimStore((s) => s.toggleAi);
  const resetAi = useSimStore((s) => s.resetAi);
  const setActiveDevice = useSimStore((s) => s.setActiveDevice);
  const addDevice = useSimStore((s) => s.addDevice);
  const removeDevice = useSimStore((s) => s.removeDevice);

  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Scenario save/load (digital-twin snapshot of the whole world).
  const fileRef = useRef<HTMLInputElement>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  const onSaveScenario = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    downloadScenario(captureScenario(`virtual-field-${stamp}`));
  };
  const onLoadScenario = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again
    if (!file) return;
    const scenario = parseScenario(await file.text());
    if (!scenario) {
      setScenarioError("Not a valid scenario file.");
      return;
    }
    setScenarioError(null);
    loadScenario(scenario);
  };

  const batteryPct = Math.round(telemetry.battery * 100);
  const batteryTone =
    batteryPct > 40 ? "bg-success" : batteryPct > 15 ? "bg-warning" : "bg-error";
  const headingDeg = Math.round(((telemetry.heading % (Math.PI * 2)) * 180) / Math.PI);

  // AI analytics derived from the accumulated scan (the sim knows ground truth,
  // so precision/recall are the model's real scores).
  const scanned = aiStats.scanned;
  const diseaseRate = scanned > 0 ? aiStats.predictedDiseased / scanned : 0;
  const precisionDen = aiStats.truePos + aiStats.falsePos;
  const recallDen = aiStats.truePos + aiStats.falseNeg;
  const precision = precisionDen > 0 ? aiStats.truePos / precisionDen : null;
  const recall = recallDen > 0 ? aiStats.truePos / recallDen : null;
  const projectedFruit =
    scanned > 0 && aiStats.estFruit > 0
      ? Math.round((aiStats.estFruit / scanned) * cropCount)
      : 0;

  const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

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
          <button
            type="button"
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="btn btn-ghost btn-xs -mr-1 px-1 text-base-content/60"
          >
            {isFullscreen ? "⤢ Exit" : "⤢ Full"}
          </button>
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
            <button
              type="button"
              onClick={() => setNavMode("manual")}
              className={`btn btn-xs join-item ${
                navMode === "manual" ? "btn-primary" : "btn-ghost"
              }`}
            >
              Manual
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

        {navMode === "manual" ? (
          <span className="rounded-md bg-base-100/70 px-2 py-1 text-[11px] text-base-content/60 backdrop-blur">
            {activeSpec.manualHint}
          </span>
        ) : null}

        {/* Fleet: one chip per slot (device type + battery), click to select. */}
        <div className="pointer-events-auto flex items-center gap-2 rounded-lg border border-base-content/10 bg-base-100/80 px-2.5 py-1.5 backdrop-blur">
          <span className="text-[11px] uppercase tracking-wide text-base-content/50">Fleet</span>
          <div className="flex items-center gap-1">
            {devices.map((kind, i) => {
              const spec = deviceSpec(kind);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveDevice(i)}
                  title={`${deviceName(kind, i)} · ${Math.round((fleet[i]?.battery ?? 1) * 100)}%`}
                  className={`btn btn-xs ${
                    activeDevice === i ? "btn-primary" : "btn-ghost"
                  } font-mono`}
                >
                  {spec.short.replace("GAIA-", "")}
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Add a device — the menu is derived from the spec table, so a new
              GAIA device type appears here the moment it's added to DEVICE_SPECS. */}
          <div className="dropdown dropdown-end">
            <button
              tabIndex={0}
              type="button"
              disabled={devices.length >= MAX_DEVICES}
              className="btn btn-xs btn-ghost disabled:opacity-40"
            >
              +
            </button>
            <ul
              tabIndex={0}
              className="menu dropdown-content z-10 mt-1 w-40 rounded-md border border-base-content/10 bg-base-100 p-1 shadow-lg"
            >
              {Object.values(DEVICE_SPECS).map((s) => (
                <li key={s.kind}>
                  <button
                    type="button"
                    className="text-xs"
                    onClick={() => addDevice(s.kind)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {devices.length > 1 ? (
            <button
              type="button"
              onClick={() => removeDevice(activeDevice)}
              title={`Remove ${deviceName(devices[activeDevice] ?? "gaia_r", activeDevice)}`}
              className="btn btn-xs btn-ghost text-base-content/50"
            >
              ×
            </button>
          ) : null}
        </div>
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

            <div className="mt-1 flex items-center justify-between border-t border-base-content/10 pt-2">
              <span className="text-[11px] text-base-content/55">
                Obstacles{" "}
                <span className="font-mono text-base-content/75">{obstacleCount}</span>
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={regenerateObstacles}
                  className="btn btn-xs btn-ghost"
                >
                  Scatter
                </button>
                <button type="button" onClick={clearObstacles} className="btn btn-xs btn-ghost">
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Vision / dataset capture */}
        <div className="pointer-events-auto w-full rounded-lg border border-base-content/10 bg-base-100/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
              Vision
            </span>
            <span className="font-mono text-[11px] tabular-nums text-base-content/50">
              {captureCount} captured
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleDetections}
              className={`btn btn-xs ${showDetections ? "btn-secondary" : "btn-ghost"}`}
            >
              Detections
            </button>
            <button type="button" onClick={requestCapture} className="btn btn-xs btn-primary">
              Capture frame
            </button>
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-base-content/45">
            Downloads the onboard view as PNG + labelled bounding boxes (JSON).
          </p>
        </div>

        {/* AI perception layer */}
        <div className="pointer-events-auto w-full rounded-lg border border-base-content/10 bg-base-100/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
              AI scout
            </span>
            <span
              className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                aiRunning ? "bg-success/15 text-success" : "bg-base-content/10 text-base-content/55"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  aiRunning ? "animate-pulse bg-success" : "bg-base-content/40"
                }`}
              />
              {aiRunning ? "Inferring" : "Idle"}
            </span>
          </div>
          <div className="mb-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleAi}
              className={`btn btn-xs ${aiRunning ? "btn-neutral" : "btn-primary"}`}
            >
              {aiRunning ? "Stop" : "Run scout"}
            </button>
            <button type="button" onClick={resetAi} className="btn btn-xs btn-ghost">
              Reset
            </button>
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Metric label="Scanned" value={scanned.toLocaleString()} />
            <Metric label="Disease" value={pct(diseaseRate)} />
            <Metric label="Precision" value={pct(precision)} />
            <Metric label="Recall" value={pct(recall)} />
            <Metric
              label="Est. fruit"
              value={aiStats.estFruit > 0 ? aiStats.estFruit.toLocaleString() : "—"}
            />
            <Metric
              label="Proj. field"
              value={projectedFruit > 0 ? projectedFruit.toLocaleString() : "—"}
            />
          </dl>
        </div>

        {/* Scenario manager — snapshot / restore the whole world */}
        <div className="pointer-events-auto w-full rounded-lg border border-base-content/10 bg-base-100/80 p-3 backdrop-blur">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
              Scenario
            </span>
            <span className="font-mono text-[10px] tabular-nums text-base-content/45">
              seed {seed}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={onSaveScenario} className="btn btn-xs btn-secondary">
              Save
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="btn btn-xs btn-ghost"
            >
              Load
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={onLoadScenario}
            />
          </div>
          <p className="mt-1.5 text-[10px] leading-tight text-base-content/45">
            Saves the whole world — field, weather, obstacles, fleet poses, tasks.
          </p>
          {scenarioError ? <p className="mt-1 text-[10px] text-error">{scenarioError}</p> : null}
        </div>
      </div>

      {/* Bottom-left: rover telemetry + sensors */}
      <div className="absolute bottom-4 left-4 pointer-events-auto w-64 rounded-lg border border-base-content/10 bg-base-100/80 p-3.5 backdrop-blur">
        <div className="mb-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-base-content/60">
            {deviceName(devices[activeDevice] ?? "gaia_r", activeDevice)}
          </span>
          {telemetry.charging ? (
            <span className="flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[10px] font-semibold text-success">
              <span className="animate-pulse">⚡</span>
              {batteryPct}%
            </span>
          ) : (
            <span className="font-mono text-[11px] tabular-nums text-base-content/50">
              {telemetry.battery > 0 ? `${batteryPct}%` : "flat"}
            </span>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <Metric label="Position" value={`${telemetry.position.x.toFixed(1)}, ${telemetry.position.z.toFixed(1)}`} />
          <Metric label="Heading" value={`${headingDeg}°`} />
          <Metric label="Speed" value={`${telemetry.speed.toFixed(1)} m/s`} />
          {activeSpec.flies ? (
            <Metric label="Altitude" value={`${telemetry.position.y.toFixed(1)} m`} />
          ) : (
            <Metric label="Battery" value={`${batteryPct}%`} />
          )}
        </dl>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-base-content/10">
          <div className={`h-full rounded-full ${batteryTone}`} style={{ width: `${batteryPct}%` }} />
        </div>

        {/* Sensors */}
        <div className="mt-3 border-t border-base-content/10 pt-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-base-content/45">
            Sensors
          </span>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <Metric
              label={`GPS ${rtk ? "(RTK)" : ""}`}
              value={`${sensors.gps.lat.toFixed(5)}, ${sensors.gps.lon.toFixed(5)}`}
            />
            <Metric label="Fix ± m" value={sensors.gps.accuracyM.toFixed(2)} />
            <Metric label="IMU yaw/s" value={`${sensors.yawRateDeg.toFixed(0)}°`} />
            <Metric label="Odometer" value={`${sensors.odometerM.toFixed(1)} m`} />
            <Metric label="Alt AGL" value={`${sensors.altitudeAgl.toFixed(1)} m`} />
            {activeSpec.lidar ? (
              <Metric
                label="LiDAR near"
                value={sensors.lidarNearest === null ? "—" : `${sensors.lidarNearest.toFixed(2)} m`}
              />
            ) : null}
            {activeSpec.lidar ? (
              <Metric
                label="Ultrasonic"
                value={sensors.ultrasonic === null ? "clear" : `${sensors.ultrasonic.toFixed(2)} m`}
              />
            ) : null}
          </dl>
          <div className="mt-2.5 flex items-center gap-1">
            <SensorToggle
              on={showLidar && activeSpec.lidar}
              onClick={toggleLidar}
              label="LiDAR"
              disabled={!activeSpec.lidar}
              title={activeSpec.lidar ? undefined : `${activeSpec.label} carries no LiDAR`}
            />
            <SensorToggle on={sensorNoise} onClick={toggleSensorNoise} label="Noise" />
            <SensorToggle on={rtk} onClick={toggleRtk} label="RTK" />
          </div>
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
          <button
            type="button"
            onClick={returnHome}
            className="btn btn-sm btn-ghost"
            title="Send the fleet back to the depot to dock and recharge"
          >
            ⌂ Depot
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
      <div
        className="pointer-events-none absolute bottom-4 right-4 overflow-hidden rounded-md border border-base-content/25 shadow-lg"
        style={{ width: PIP.w, height: PIP.h }}
      >
        {aiRunning ? (
          <svg
            viewBox={`0 0 ${PIP.w} ${PIP.h}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            {aiPredictions.map((p, i) => {
              const color = p.predictedDiseased ? "#ef6f5e" : "#6fe0a0";
              const bx = p.x * PIP.w;
              const by = p.y * PIP.h;
              const bw = p.w * PIP.w;
              const bh = p.h * PIP.h;
              return (
                <g key={i}>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.92}
                  />
                  {bw > 30 ? (
                    <text x={bx + 1} y={Math.max(7, by - 1.5)} fill={color} fontSize={6}>
                      {p.predictedDiseased ? "disease" : p.species} {Math.round(p.confidence * 100)}%
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : showDetections ? (
          <svg
            viewBox={`0 0 ${PIP.w} ${PIP.h}`}
            className="absolute inset-0 h-full w-full"
            preserveAspectRatio="none"
          >
            {detections.map((d, i) => {
              const color = d.diseased ? "#f6b73c" : "#7fe6ff";
              const bx = d.x * PIP.w;
              const by = d.y * PIP.h;
              const bw = d.w * PIP.w;
              const bh = d.h * PIP.h;
              return (
                <g key={i}>
                  <rect
                    x={bx}
                    y={by}
                    width={bw}
                    height={bh}
                    fill="none"
                    stroke={color}
                    strokeWidth={1}
                    opacity={0.9}
                  />
                  {bw > 26 ? (
                    <text x={bx + 1} y={Math.max(7, by - 1.5)} fill={color} fontSize={6}>
                      {d.species}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>
        ) : null}
        <div className="absolute left-0 top-0 flex items-center gap-1.5 rounded-br-md bg-base-100/80 px-2 py-1 backdrop-blur">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-base-content/70">
            {cameraMode === "depth" ? "Depth" : "RGB"}
            {activeSpec.flies ? " · Nadir" : ""} · {deviceName(devices[activeDevice] ?? "gaia_r", activeDevice)}
          </span>
        </div>
        <div className="pointer-events-auto absolute right-0 top-0 flex rounded-bl-md bg-base-100/80 backdrop-blur">
          <button
            type="button"
            onClick={() => setCameraMode("rgb")}
            className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              cameraMode === "rgb" ? "text-primary" : "text-base-content/45"
            }`}
          >
            RGB
          </button>
          <button
            type="button"
            onClick={() => setCameraMode("depth")}
            className={`px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              cameraMode === "depth" ? "text-primary" : "text-base-content/45"
            }`}
          >
            Depth
          </button>
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

function SensorToggle({
  on,
  onClick,
  label,
  disabled,
  title
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  /** Devices that don't carry the sensor get a dead-but-explained switch. */
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`btn btn-xs ${on ? "btn-secondary" : "btn-ghost"} disabled:opacity-40`}
    >
      {label}
    </button>
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
