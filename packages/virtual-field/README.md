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
  store/simStore.ts    Zustand store — single source of truth + throttled telemetry
  scene/               everything inside the <Canvas>
    Scene.tsx          composition + OrbitControls + fog/background
    environment.ts     per-time-of-day lighting/atmosphere presets (asset-free)
    Lighting.tsx       procedural sky + sun + fill
    Ground.tsx         soil plane + technical grid + furrow-row hint
    Robot.tsx          placeholder rover, driven imperatively in useFrame
  hud/Hud.tsx          DOM overlay: status, telemetry, sim controls
```

## Design notes

- **No network assets.** Sky is drei's procedural shader and fog is solid colour —
  no HDR fetch — so the sim honours the portal's CSP and loads offline.
- **The store re-renders React a few times a second, not 60×.** Robot motion is
  integrated imperatively in `useFrame` and applied straight to the mesh; only a
  throttled telemetry sample (~6.7 Hz) reaches the store for the HUD.
- **Furrow ridges are ground detail, not the crop entity system.** The real crop
  model (species, growth stage, health, GPS, bounding volume) arrives in Phase 3.

## Roadmap (from the PRD)

Phase 1 ✅ rendering · ground · camera · lighting · placeholder robot (this slice).
Then: 2) movement + waypoints · 3) procedural fields + crops + weather ·
4) physics (Rapier) + navigation · 5) sensor sim · 6) CV dataset generation ·
7) AI integration · 8) multi-robot · 9) full digital twin.
