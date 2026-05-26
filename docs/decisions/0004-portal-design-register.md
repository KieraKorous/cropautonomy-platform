# 0004 — Portal design extends the landing register

- **Status:** Accepted
- **Decided:** 2026-05-23

## Context

The CropAutonomy brand brief uses words like *"mission control,"* *"industrial,"* *"GIS dashboards,"* and *"robotics telemetry."* Read literally — and AI-default design instincts read them literally — those words produce a sci-fi / military HUD: dark charcoal chrome, IBM Plex Mono telemetry strings, ALL CAPS tracked micro-labels, red/amber severity pills, dot-separated breadcrumb noise (`CRITICAL · 06:42 / DONIPHAN / F-22`), NDVI heatmaps with cyan rivers, pixel-art logo treatments.

That register has nothing to do with the product we actually built. The landing page already establishes the system: light surfaces, full English sentences, restrained color, no monospace, no jargon. When we built a portal that drifted into the "mission control" aesthetic, the response was *"it's reverted right back to using the editorial style — it's the voice, the design, it's everything — it looks like new AI editorial slop."*

## Decision

Internal app surfaces (dashboard, portal, any authenticated UI) match the same visual and voice register as the public landing pages. Ground in the *actual existing components and landing page*, not the brand brief's adjectives.

The established system:

### Surfaces

- Light `bg-base-100` (`#f7f5ef`) on `bg-base-200` (`#e8e2d4`). Never dark charcoal chrome. **No dark surfaces anywhere on the brand.**
- Cards: `rounded-xl` (12px), `border border-base-content/10` (barely-there hairlines), generous `p-6 / p-7 / p-8`.

### Type

- Inter for everything. **No monospace anywhere.**
- Heading: `text-xl..text-4xl font-semibold tracking-tight text-neutral`.
- Body: `text-sm`/`text-base` `leading-6`/`leading-7` `text-base-content/70`.
- Never `text-[NNpx]` arbitrary sizes — use the Tailwind ladder.

### Color

- Primary `#244f37` used sparingly: icon backgrounds at `primary/10`, eyebrow text, a single dot in a status chip.
- No red/amber severity badges, no neon, no decorative gradients.

### Status & labels

- Inline lowercase text like *"Now in active development · prototype Aug 2026"* with one tiny primary dot — **not** colored pills with ALL CAPS tracked labels.

### Voice

- Full sentences in human, plain English. *"Made for the people who actually walk the rows."* *"Capture and queue scans without connectivity. Syncs back when you're in range."* Talks to the user in second person.
- **Not** jargon abbreviations strung together with `·` separators.

### Brand-brief words to disregard at face value

*"Mission control," "industrial," "GIS," "robotics telemetry"* are atmospheric references, not aesthetic instructions. Don't render them literally as the AI-default HUD.

### Anti-patterns specific to this project

- No IBM Plex Mono.
- No ALL CAPS tracked micro-labels.
- No `text-[NNpx]` arbitrary sizes.
- No severity color pills.
- No dark mode chrome.
- No decorative dot-separator strings.
- No pixel-art logo glyphs.
- No editorial register (no Vogue/Frieze-style oversized serifs, dropped capitals, byline metadata, etc.).

## Consequences

- The portal feels intentionally calm and quiet next to most ag-tech dashboards. That's the point.
- Designers and agents need to read the actual code (`apps/*/app/page.tsx`, `packages/ui/src/components/`) before designing new screens — the brand brief alone is insufficient and actively misleading if read literally.
- When data needs status, we lean on copy and a single dot, not a color taxonomy.

## How to apply

When the next prompt says *"build a dashboard for this,"* start by reading `apps/*/app/page.tsx` and the existing components in `packages/ui/src/components/` to ground in the actual component vocabulary, then translate dashboard data into that vocabulary.

## Alternatives considered

- **Lean into the brand brief's atmospheric words literally.** Rejected. Produces the AI-default mission-control aesthetic that has nothing to do with the product. The brief's adjectives describe what operators *do*, not how the UI should *look*.
- **Separate visual systems for marketing and the portal.** Rejected. Operators and prospects are the same people in this domain. A jarring shift between marketing and product signals "two different teams built these" — exactly what a single-founder, system-builder posture should not signal.
