# @gaia/ui component inventory

The source of truth lives at `packages/ui/src/components/`. The kit is small and self-documenting — when in doubt, read the source. This file is a fast-reference index so you don't have to grep for signatures.

## Quick map: pick by goal

| Goal | Component | File |
|---|---|---|
| Site chrome at the top of every page | `Header` | `Header.tsx` |
| Site chrome at the bottom of every page | `Footer` | `Footer.tsx` |
| Brand mark + name (links to `/`) | `Wordmark` | `Wordmark.tsx` |
| Wrap a content section with consistent padding + tone | `Section` | `Section.tsx` |
| Eyebrow + heading + lead at the top of a section | `SectionIntro` | `Section.tsx` |
| Two-column image-and-text split | `MediaSplit` | `Section.tsx` |
| Dark CTA wrapper for lead capture | `CtaSection` | `Section.tsx` |
| Lead-capture form (typed against `@gaia/domain`) | `LeadForm` | `LeadForm.tsx` |
| Feature with icon + title + body + bullets (3-up grid) | `FeatureCard` | `cards.tsx` |
| Audience card with photo + title + body (3- or 4-up) | `AudienceCard` | `cards.tsx` |
| Hardware device showcase (photo + label + specs) | `DeviceCard` | `cards.tsx` |
| Future / concept hardware family card | `FutureFamilyCard` | `cards.tsx` |
| Vertical timeline of roadmap milestones | `RoadmapList` | `Roadmap.tsx` |
| Status pill (colored dot + label) | `StatusPill` | `atoms.tsx` |
| Icon-in-rounded-square badge | `IconBadge` | `atoms.tsx` |
| Checkmark + text bullet list | `CheckList` | `atoms.tsx` |
| Icon + title + body horizontal row | `FeatureRow` | `atoms.tsx` |
| Any common icon (arrows, checks, product glyphs) | re-exports | `icons.tsx` |

## Header

```ts
Header({ brand, navLinks, sisterBrand?, cta, ctaTone? })
```

- `brand: "cropautonomy" | "gaiabots"` — drives the `Wordmark`
- `navLinks: { label, href }[]` — center desktop nav
- `sisterBrand?: { label, href }` — small text link on right (the cross-link to the sister brand)
- `cta: { label, href }` — primary right-side CTA button
- `ctaTone?: "primary" | "neutral"` — `"primary"` = green pill (CropAutonomy default), `"neutral"` = dark pill (GAIAbots default)

Mounted from `app/layout.tsx` per app. To change nav links or CTA copy, edit the `headerConfig` object in that layout — not the page.

## Footer

```ts
Footer({ brand, tagline, domain, copyright, columns })
```

- `columns: { title, links: { label, href }[] }[]` — renders best with exactly 4 columns. Current grid: `lg:grid-cols-[320px_1fr_1fr_1fr_1fr]` where the first 320px is brand+tagline.
- Always renders on `bg-shell-deep` with `text-neutral-content`.

If a different column count is needed later, update the grid in `Footer.tsx` to compute from `columns.length`.

## Wordmark

```ts
Wordmark({ brand, variant?, href?, className? })
```

- `brand: "cropautonomy" | "gaiabots"`
- `variant?: "default" | "light"` — `"light"` flips the mark background for dark surfaces (footer uses this)
- `href?: string` — wraps in `<a>` with `aria-label` when provided

The marks are inline SVG inside `Wordmark.tsx`:

- **CropAutonomy** — a sprout glyph (vertical stem + two leaves with soft fill) on `bg-primary` with `text-primary-content` stroke
- **GAIAbots** — an aperture/optic glyph (concentric circle + axis ticks) on `bg-neutral` (default) or `bg-base-100` (light) with `text-accent` stroke

These are v0 marks, deliberately simple, designed to evolve when a real brand identity is commissioned. When iterating on a mark, edit `CropAutonomyGlyph` / `GaiabotsGlyph` inside `Wordmark.tsx` — don't add new logo components.

## Section / SectionIntro / MediaSplit / CtaSection

```ts
Section({ tone?, id?, children, containerClassName?, className? })
```

- `tone: "light" | "warm" | "dark" | "hero-dark"`
- Standard inner container: `max-w-[1440px] px-6 py-20 lg:px-16 lg:py-24`

```ts
SectionIntro({ eyebrow?, title, lead?, align?, tone?, accessory?, className? })
```

- `align: "center" | "left"` — centered for landmark sections, left for paired sections with a side action
- `tone: "default" | "light"` — `"light"` flips eyebrow/heading/lead colors for use inside dark Sections
- `accessory?` — right-side element when using left-align (e.g. an inline "Joining the access list →" link)

```ts
MediaSplit({ image, imageAlt?, imagePosition?, children, contentWidth? })
```

- `imagePosition: "left" | "right"` — image side
- `contentWidth: "narrow" | "wide"` — narrow = 520px content column, wide = 580px content column

```ts
CtaSection({ id?, children })
```

- Dark `bg-neutral` wrapper with `grid-cols-[520px_1fr]` layout (copy + form)
- Page provides both children: first the copy block (eyebrow + heading + lead + `CheckList`), second the `<LeadForm />`

## LeadForm

```ts
LeadForm({ source, defaultInterest?, copy?, placeholders?, className? })
```

- `source: LeadSource` (from `@gaia/domain`) — `"cropautonomy.com"` | `"gaiabots.ai"`
- `defaultInterest?: LeadInterest` — defaults to `"farm_or_grower"`
- `copy?: { submitLabel?, consentLabel?, messageLabel?, interestLabel?, reassurance? }` — copy overrides per surface
- `placeholders?: { name?, email?, organization?, message? }` — sample placeholder text

Posts to `/api/leads`. Hidden `source` input is set automatically.

To add interest categories, follow the three-way coordination documented in `CLAUDE.md`:

1. Extend the `LeadInterest` union in `packages/domain`
2. Add the value to `validInterests` in each app's `app/api/leads/route.ts`
3. Add the SQL check constraint in `packages/db/migrations/`
4. Append the option to `interestOptions` in `LeadForm.tsx`

Skipping any of these creates a runtime validation failure.

## Cards

```ts
FeatureCard({ icon, title, body, bullets? })
```
3-up feature grids. The Features section on the CropAutonomy landing uses this.

```ts
AudienceCard({ title, body, image, imageAlt? })
```
Photo + title + body. 4-up grid. The Audiences section on the CropAutonomy landing uses this.

```ts
DeviceCard({ code, label, status, image, imageAlt?, description, specs })
```
Hardware showcase. The Devices section on the GAIAbots landing uses this. `specs: readonly [label, value][]` — each row renders as label/value with the label in a 36-unit column.

```ts
FutureFamilyCard({ code, title, body, status? })
```
Concept-stage device family card. The Future families section on the GAIAbots landing uses this. `status` defaults to `"Concept"`.

## Roadmap

```ts
RoadmapList({ items: RoadmapMilestone[] })

type RoadmapMilestone = {
  when: string;           // "Now", "Next", "August 2026", "Beyond"
  quarter: string;        // "Q2 2026", "Prototype target", "Late 2026 →"
  title: string;
  body: string;
  status: string;         // "Shipped", "In progress", "Planned", "Exploring"
  statusTone: Tone;       // drives both pill color and "when" label color
};
```

Where `Tone = "primary" | "accent" | "secondary" | "success" | "muted"`.

## Atoms

```ts
StatusPill({ label, tone? })
```
Colored dot + label in a rounded-full background. Tones match `Tone`.

```ts
IconBadge({ children, tone?, size? })
```
Rounded-square icon container.
- `tone: "primary" | "accent" | "muted-light"`
- `size: "sm" | "md" | "lg"` → 36px / 44px / 48px

```ts
CheckList({ items, tone?, size? })
```
Vertical list of items with leading checkmark.
- `tone: "default" | "light"` — `"light"` uses `text-leaf-soft` checks for use on dark surfaces
- `size: "sm" | "md"` — `"md"` is the form-of-life feature list size; `"sm"` is in-card bullets

```ts
FeatureRow({ icon, title, body })
```
`IconBadge` + title + body horizontal row. Used inside `MediaSplit` for sub-feature lists (the "Made for the people who actually walk the rows" section uses three of these).

## Icons

All re-exported from `@gaia/ui` and built atop a shared `Base` wrapper in `icons.tsx` so stroke widths and rendering stay consistent.

Universal: `ArrowRight`, `Check`

Functional/product: `CameraIcon`, `BrainIcon`, `ChartIcon`, `GlobeIcon`, `ShieldIcon`, `GridIcon`, `PencilIcon`, `UsersIcon`, `PlusIcon`

Device-themed: `RoverIcon`, `DroneIcon`

All accept `{ className?, size? }`. Defaults: `ArrowRight` and `Check` are 14px (inline); product icons are 22px. Color inherits via `currentColor` — set color on a wrapping element (e.g., `<IconBadge tone="primary">` colors the child icon `text-primary`).

Need a new icon? Add to `packages/ui/src/components/icons.tsx` using the shared `Base` wrapper. Keep stroke-width to `1.8` for product glyphs and `2` for arrows/checks to match the rest of the set.
