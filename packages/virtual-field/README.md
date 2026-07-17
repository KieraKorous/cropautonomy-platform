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
  device.ts            GAIA device types — DeviceKind + DeviceSpec table (see below)
  depot.ts             the shed that houses + charges the fleet; bay/helipad layout
  devices/fleet.ts     peer-class partition (rovers split among rovers, drones among drones)
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
    field.ts           row/lane/dock/survey geometry — single source of truth
    Crops.tsx          instanced crop layer rendered FROM the entity records
    Weather.tsx        rain / dust particle layers
    Device.tsx         Device (shared nav/steering/airframe) + Fleet
    bodies/            RoverBody · DroneBody — meshes that own their own effectors
    FieldSections.tsx  per-rover coverage-section tint
    Depot.tsx          the shed — bays, roof helipads, charge posts
    PhysicsWorld.tsx   Rapier: ground collider, obstacles, rover colliders
    Sensors.tsx        LiDAR sweep + GPS/IMU/odometry + point-cloud viz
    OnboardView.tsx    picture-in-picture rover camera (PIP sizing lives here)
    Vision.tsx         detections, dataset capture, AI inference loop
    Waypoints.tsx      waypoint path + markers
    DragPlane.tsx      pick-up-and-drop catcher
    layers.ts          VIZ_LAYER — sim-only viz, hidden from the device camera
    deviceState.ts     live pose registry (kind + altitude) + drag target (no React churn)
    driveInput.ts      manual input — WASD/arrows, Q/E strafe, R/F climb
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
- **Sim-only viz lives on `VIZ_LAYER`** so the device camera feed and captured
  dataset frames stay clean RGB.

## Device model

The fleet is a list of GAIA devices (`store.devices: DeviceKind[]`), one per slot.
**`DeviceKind` uses the platform's authoritative `device_family` literals**
(`gaia_r`, `gaia_d`; `gaia_s` next) from `packages/db/migrations/0012_*.sql` — not
sim-local names — so a simulated device maps 1:1 to a real registered one.

Everything that differs between device types lives in one `DEVICE_SPECS` table in
[`device.ts`](src/device.ts): speeds, battery model, collider, camera mount, avoidance,
manual rates, detection thresholds, dock setback, colors. `Device.tsx` owns only what
they share — pose, nav, the steering core, the reset/restore/home token protocol,
telemetry, drag. Adding a device type is a table entry plus a body component; the
fleet's add-menu is derived from the table, so it appears in the HUD automatically.

Invariants worth knowing:

- **Altitude is real, and ground devices are pinned arithmetically.** `climbRate` /
  `descentRate` are `0` for `gaia_r`, so its `y` provably cannot move no matter what a
  nav command asks for — the rover path is unchanged by the drone's existence.
- **Coverage splits among peers of the same class** (`devices/fleet.ts`). Rovers divide
  the field between rovers, drones between drones — so 1 rover + 1 drone each cover
  everything, which is what you'd actually want.
- **Home is a real place.** The depot ([`depot.ts`](src/depot.ts)) is a shed at the
  headland: ground devices park in its open-fronted bays, aerial devices land on roof
  helipads directly above them (so the two classes stack vertically rather than fight
  for floor space). It's the spawn point, the "⌂ Depot" target, and where devices
  **recharge** (`spec.chargeRate`) — which is what makes the battery model matter.
  Unlike the sim-only overlays, the shed renders on the default layer: it's a real
  structure, so device cameras and captured frames see it.
- **The drone's survey swath is derived, not tuned.** `surveySwath()` computes its
  camera's ground footprint at cruise, so changing the altitude changes the flight plan
  to match (~12m strips at 12m vs the rover's ~0.75m alleys).
- **Detection thresholds are per-device** (`spec.detect`). A nadir camera at altitude
  frames far more, far smaller plants; the rover's values would make the drone detect
  almost nothing.
- **Bodies own their own moving parts.** Wheels and rotors spin from each body's own
  `useFrame` reading its runtime speed, so the steering code knows nothing about either.

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

Beyond the roadmap: **GAIA-D (aerial drone)** — flies a camera-derived serpentine
survey at altitude with a nadir camera feeding the same CV/AI pipeline, overflies
obstacles, and auto-lands on low battery.

Not yet built: **GAIA-S (sensor station)** — the next device, and where soil /
microclimate monitoring belongs. (There is no "soil sampler" in GAIA; the letter
taxonomy is reserved for GAIAbots hardware — see `docs/brand/gaiabots-brand-brief.md`.)
Also outstanding from the PRD backlog: stereo/thermal/multispectral cameras,
segmentation masks + optical flow, radar, RRT, SLAM, calibration/latency modelling.
