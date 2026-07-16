# @gaia/virtual-field

Browser-based agricultural digital-twin simulator — the "Virtual Field" from
`GAIA_Virtual_Field_PRD.md`. Every future AI / robotics / vision algorithm should
be developed and demonstrated here before it touches physical hardware.

Built as a **package, not an app route**, so the surface can move later. Today it
mounts inside the portal at `app.cropautonomy.com/virtual-field`; tomorrow it
could move to a public marketing surface or a dedicated app with no rewrite —
consumers only depend on the exported `<VirtualField />` component + `useSimStore`.

## Usage

```tsx
// WebGL is client-only — load with ssr:false in Next.
const VirtualField = dynamic(
  () => import("@gaia/virtual-field").then((m) => m.VirtualField),
  { ssr: false }
);

// Mount inside a sized, positioned box:
<div className="h-[calc(100vh-7rem)] w-full">
  <VirtualField />
</div>
```

The HUD uses Tailwind/DaisyUI utility classes, so a consuming app must add the
package to its Tailwind `@source` set (see `apps/portal-web/app/globals.css`) or
the HUD classes get purged.

## Stack

Three.js · @react-three/fiber · @react-three/drei · Zustand. Rapier physics is
deferred to a later phase (see roadmap below).

## Layout

```
src/
  VirtualField.tsx     Canvas + HUD wrapper (public entry, "use client")
  index.ts             public exports
  types.ts             shared domain types
  crop.ts              crop entity system — species catalog + deterministic generator
  obstacle.ts          obstacle entities + generator
  scenario.ts          Scenario Manager — capture / download / parse a whole world
  store/simStore.ts    Zustand store — single source of truth + throttled telemetry
  nav/astar.ts         grid A* + line-of-sight path smoothing (return home)
  sensors/             targetIndex.ts (spatial hash) · lidar.ts (analytic ray-vs-circle)
  vision/detections.ts crops → camera-space 2D bounding boxes (dataset labels)
  ai/                  inference.ts (simulated detector) · analytics.ts (running stats)
  scene/               everything inside the <Canvas>
    Scene.tsx          composition + OrbitControls + fog/background
    environment.ts     time-of-day presets + applyWeather() (asset-free)
    Lighting.tsx       procedural sky + sun + fill
    Ground.tsx         soil plane + technical grid + furrow beds
    field.ts           row/lane/dock geometry — single source of truth
    Crops.tsx          instanced crop layer rendered FROM the entity records
    Weather.tsx        rain / dust particle layers
    Robot.tsx          Rover (nav + drive) and Fleet; ROVER_COLORS
    FieldSections.tsx  per-rover coverage-section tint
    PhysicsWorld.tsx   Rapier: ground collider, obstacles, rover colliders
    Sensors.tsx        LiDAR sweep + GPS/IMU/odometry + point-cloud viz
    OnboardView.tsx    picture-in-picture rover camera (PIP sizing lives here)
    Vision.tsx         detections, dataset capture, AI inference loop
    Waypoints.tsx      waypoint path + markers
    DragPlane.tsx      pick-up-and-drop catcher
    layers.ts          VIZ_LAYER — sim-only viz, hidden from the rover camera
    roverState.ts      live pose registry + drag target (no React churn)
    driveInput.ts      WASD / arrow manual-drive input
  hud/Hud.tsx          DOM overlay: status, nav, telemetry, sensors, vision, AI, scenario
```

## Design notes

- **No network assets.** Sky is drei's procedural shader and fog is solid colour —
  no HDR fetch — so the sim honours the portal's CSP and loads offline.
- **The store re-renders React a few times a second, not 60×.** Rover motion is
  integrated imperatively in `useFrame` and applied straight to the mesh; only
  throttled samples (telemetry, sensors, detections) reach the store for the HUD.
- **Crops are entities, not decoration.** The renderer, LiDAR, and CV labels all
  read the same `Crop` records, so what you see is exactly what the sim knows.
- **Determinism.** Crop layout is a pure function of `(species, growthStage, seed)`,
  which is why a scenario file stores three values instead of thousands of plants.
- **Sim-only viz lives on `VIZ_LAYER`** so the rover camera feed and captured
  dataset frames stay clean RGB.

## Roadmap (from the PRD) — complete

1 ✅ rendering · ground · camera · lighting · rover
2 ✅ movement · waypoints · onboard camera feed
3 ✅ procedural fields · crop entities · weather
4 ✅ physics (Rapier) · obstacle avoidance · A* return-home
5 ✅ sensor sim (LiDAR · GPS/RTK · IMU · odometry · ultrasonic, with noise/dropout)
6 ✅ CV dataset generation (RGB + bounding-box labels, depth camera)
7 ✅ AI integration (disease/fruit inference, precision/recall, yield analytics)
8 ✅ multi-robot coordination (fleet, split coverage, per-rover docks)
9 ✅ full digital twin (Scenario Manager: save/load the world)

Not yet built (PRD backlog): stereo/thermal/multispectral cameras, segmentation
masks + optical flow, radar, RRT, SLAM, calibration/latency modelling.
