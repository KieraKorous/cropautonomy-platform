import { useSimStore } from "../store/simStore";
import type { TimeOfDay } from "../types";

const TIMES: { id: TimeOfDay; label: string }[] = [
  { id: "dawn", label: "Dawn" },
  { id: "day", label: "Day" },
  { id: "dusk", label: "Dusk" },
  { id: "night", label: "Night" }
];

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
  const telemetry = useSimStore((s) => s.telemetry);

  const toggleRun = useSimStore((s) => s.toggleRun);
  const reset = useSimStore((s) => s.reset);
  const setTimeOfDay = useSimStore((s) => s.setTimeOfDay);
  const toggleGrid = useSimStore((s) => s.toggleGrid);
  const toggleRows = useSimStore((s) => s.toggleRows);
  const toggleCrops = useSimStore((s) => s.toggleCrops);

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
      </div>

      {/* Top-right: performance */}
      <div className="absolute right-4 top-4 pointer-events-auto rounded-lg border border-base-content/10 bg-base-100/80 px-3 py-1.5 backdrop-blur">
        <span className="font-mono text-xs tabular-nums text-base-content/70">
          {fps} FPS
        </span>
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
