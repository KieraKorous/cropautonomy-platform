---
name: gaia-design-system
description: Defines the gaia-field design system for the CropAutonomy and GAIAbots monorepo — brand palette, the @gaia/ui component kit (Section, SectionIntro, MediaSplit, CtaSection, FeatureCard, AudienceCard, DeviceCard, FutureFamilyCard, RoadmapList, LeadForm, Header, Footer, Wordmark, StatusPill, IconBadge, CheckList, FeatureRow, icons), brand voice rules, and the workflow for composing new pages or sections. Use this skill whenever working on any UI surface in this repo — landing pages, marketing sections, hero treatments, audience grids, lead-capture forms, portal screens (future), knowledge-base pages (future), email templates (future) — or whenever the user says "design", "build a section", "add a card", "redesign", "restyle", "make this look better", "polish the hero", "extract a component", or mentions cropautonomy.com, gaiabots.ai, the @gaia/ui kit, the gaia-field theme, the Wordmark/logo, or any of the device families (GAIA-R, GAIA-D, GAIA-S, GAIA-C, GAIA-E, GAIA-A). Also use when porting Paper designs to code, building forms, refactoring chrome (header/footer), or wiring brand copy. Critical: this skill encodes hard NO rules — no editorial styling, no arbitrary text-[NNpx] sizes, no arbitrary text-[#hex] / bg-[#hex] colors, imagery sourced only from Unsplash/Pexels/Coverr — that override the Paper MCP design guide and Tailwind defaults. Consult it before generating any UI code for this repo, even for "small" changes.
---

# Gaia design system

This is the design + build skill for the CropAutonomy / GAIAbots monorepo. The system is real, narrow, and opinionated — the rules below are not stylistic preferences, they are project decisions the user has enforced through review. Always compose from the existing kit before inventing.

## Core posture

CropAutonomy and GAIAbots form one ecosystem with two brand surfaces. Both are coming-soon / active development through August 2026 — never write copy or design treatments that imply hardware is shipping. The aesthetic is **agtech-grounded, industrial-calm**: real photography, generous whitespace, plain section headers, normal typographic hierarchy, conventional product-site composition. The reference points are Stripe, Linear, John Deere Operations Center, Climate FieldView — not magazine spreads or mission-control fantasies.

## Architecture this rides on

- pnpm monorepo: `apps/cropautonomy-web`, `apps/gaiabots-web`, shared `packages/ui` (transpiled into each app via `transpilePackages` in `packages/config/next.config.mjs`).
- Each app's `app/layout.tsx` mounts the shared `Header` + `Footer` with brand-specific config; `app/page.tsx` is pure section composition from `@gaia/ui`.
- Theme is DaisyUI v5 `gaia-field` plus Tailwind v4 `@theme` custom tokens, defined in `packages/ui/src/theme.css`. Apps set `data-theme="gaia-field"` on `<html>`.
- Read `CLAUDE.md` at the repo root for the broader architecture conventions (auth, queueing, hosting, monorepo strategy).

For deeper context see:
- [references/palette.md](references/palette.md) — full token list (DaisyUI + custom) with usage notes
- [references/components.md](references/components.md) — `@gaia/ui` inventory: every export, its props, and when to reach for it
- [references/voice.md](references/voice.md) — brand voice for CropAutonomy and GAIAbots with copy do/don't

## Hard rules (non-negotiable)

These rules came from explicit user feedback during the design system's construction. They override the Paper MCP design guide, Tailwind defaults, and any training-data instincts. Apply them proactively when generating any UI.

### 1. No editorial styling — ever

The "editorial" register is the current AI-default look and the user calls it slop. The Paper MCP `paper-mcp-instructions` guide actively recommends editorial moves; **ignore that guide on this project**.

Specifically forbidden:
- Numbered section kickers (`01 — `, `02 — `, etc.)
- All-caps mono uppercase eyebrow labels used as ornament — telemetry chips, status pills, frame coords, scan-complete badges sprayed on photography
- Oversized display headlines aiming for magazine drama (80px+ with aggressive negative tracking)
- Asymmetric H2-with-caption split (huge left headline + small right paragraph)
- Pseudo-poetic single-line hero subheads ("The operating layer for the autonomous farm")
- Decorative crosshairs, lat/long readouts, or instrument-cluster overlays on product imagery
- Horizontal rule dividers between every section
- Framing copy like "Built as infrastructure, not generic SaaS" / "Four primitives that compose…"

**Why:** These patterns are pretentious, dated as the AI-default look, and obscure the actual product story behind decorative instrumentation. The user has rejected them by name.

**Instead:** plain section H2s via `SectionIntro`, normal eyebrow labels in `text-sm font-semibold text-primary`, confident-but-restrained display sizes (`text-4xl` → `text-7xl`, not 100px+), substantive paragraphs, real product imagery, conventional 3-up / 4-up card grids.

### 2. Canonical text scale only

Never use arbitrary text sizes like `text-[14px]`, `text-[17px]`, `text-[44px]`. Always use Tailwind's standard ladder: `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` / `text-2xl` / `text-3xl` / `text-4xl` / `text-5xl` / `text-6xl` / `text-7xl`.

Rough conversion when porting external designs or Paper mocks:

| Source px | Use |
|---|---|
| 10–12 | `text-xs` |
| 13–14 | `text-sm` |
| 15–16 | `text-base` |
| 17–18 | `text-lg` |
| 19–22 | `text-xl` |
| 23–28 | `text-2xl` |
| 29–32 | `text-3xl` |
| 33–38 | `text-4xl` |
| 39–48 | `text-5xl` |
| 49–60 | `text-6xl` |
| 61–72 | `text-7xl` |

**Why:** Typography needs to ladder cleanly across the system. Arbitrary px values fragment the scale and make future global tweaks impossible. Consistency over micro-precision — even when a tighter value lands closer to a comp, the system step wins.

### 3. Canonical color tokens only

Same discipline for color: never drop `text-[#hex]` or `bg-[#hex]` literals into components. Extend `packages/ui/src/theme.css` via `@theme` and reference the named token. Currently registered customs:

- `text-leaf-soft` / `bg-leaf-soft` (#a8d3b4) — soft-green accent for use on dark surfaces (CTA eyebrows, bullet checks inside `CheckList tone="light"`). The `success` token (#2f6b45) is too dark on `bg-neutral`.
- `bg-shell-deep` / `text-shell-deep` (#0f1411) — deepest dark surface, slightly darker than `neutral`. Footer ground and hero dark overlays.

If you need a new accent, add it to the `@theme` block at the top of `packages/ui/src/theme.css` and document it in `references/palette.md`:

```css
@theme {
  --color-leaf-soft: #a8d3b4;
  --color-shell-deep: #0f1411;
  /* add new --color-* here */
}
```

Then use the named class everywhere — never the hex.

### 4. Imagery sourcing

Photography and video may only come from **Unsplash**, **Pexels**, or **Coverr**. No other stock sources, no generated/AI imagery, no decorative SVG patterns standing in for photography.

- Hoist every image URL to a `const` at the top of each `page.tsx` (e.g. `const HERO_IMAGE = "..."`). Never inline URLs in JSX — it makes substitution during review painful.
- Verify URLs actually render before reporting done. Invented Unsplash photo hashes fail silently as broken-image icons. If you don't have a known-good hash, search the actual source rather than guessing.
- Use plain `<img>` tags, not `next/image` — the apps' `next.config.mjs` doesn't whitelist remote image domains yet. Add the disable-rule comment when needed: `{/* eslint-disable-next-line @next/next/no-img-element */}`.
- Always include `alt` text. Decorative images use `alt=""` plus `aria-hidden`.

## Workflow: adding a new section or page

Follow this sequence to keep the system coherent.

1. **Locate the right surface.** Marketing/landing? Lives in `apps/{cropautonomy|gaiabots}-web/app/page.tsx`. Chrome (header, footer)? Lives in `app/layout.tsx` driven by the `headerConfig` / `footerConfig` objects exported there.

2. **Start from a `Section` wrapper.** Import from `@gaia/ui` and pick a tone:
   - `tone="light"` — cream `base-100`, default for fresh sections
   - `tone="warm"` — `base-200/60` with hairline border-y; use for visual rhythm between light sections
   - `tone="dark"` — `bg-neutral` for CTA panels and dark showcase strips
   - `tone="hero-dark"` — `bg-shell-deep` for the deepest dark (typically a single hero with overlay imagery)

3. **Open with `SectionIntro`** (eyebrow + heading + lead). Use `align="center"` for landmark sections (Features, Devices); `align="left"` with optional `accessory` for sections paired with a side action (Audiences with "Joining the access list →"). The `tone="light"` variant flips colors for use inside dark Sections.

4. **Pick the right card primitive.** See [references/components.md](references/components.md) for the full inventory. Don't invent custom card shells when `FeatureCard` / `AudienceCard` / `DeviceCard` / `FutureFamilyCard` fits.

5. **Two-column image+text → `MediaSplit`.** Don't hand-build the grid; use the component, which handles narrow/wide content widths and image-left/right positioning.

6. **Dark CTA with form → `CtaSection` + `LeadForm`.** Page provides the copy column as the first child of `CtaSection`, then drops `<LeadForm source="..." defaultInterest="..." copy={...} placeholders={...} />` as the second.

7. **Page-local components are fine when the kit doesn't fit.** The GAIAbots Connect diagram is a good example — specific to one page, shouldn't be hoisted. Define inline at the bottom of `page.tsx`. Only promote to `@gaia/ui` when a second page needs the same thing.

8. **Hoist all image URLs to top-of-file `const`s** before building the section.

9. **When adding a new lead-form interest category**, fan out to all three coordinated places (per the root `CLAUDE.md`): the `LeadInterest` union in `packages/domain`, the `validInterests` set in each app's `app/api/leads/route.ts`, and the SQL `check` constraints in `packages/db/migrations/`. Then add the option to the `interestOptions` array in `LeadForm.tsx`.

10. **Before reporting done:** `pnpm -r typecheck`. The `lint` script is just `tsc --noEmit` — don't assume ESLint, Vitest, or any other tooling exists. There's also no production dev-server verification step automated — if you want to confirm visually, run `pnpm dev:cropautonomy` or `pnpm dev:gaiabots` and check the browser before claiming the change ships.

## Brand quick-pointer

- **CropAutonomy**: platform brand. Voice: confident, grounded, technically credible, future-facing. Avoid hype and overpromising autonomy.
- **GAIAbots**: robotics/hardware brand. Voice: precise, technical, field-aware. Avoid toy-robot framing and unreleased capability claims.

Full voice guide with examples in [references/voice.md](references/voice.md). Canonical brand briefs live in `docs/brand/cropautonomy-brand-brief.md` and `docs/brand/gaiabots-brand-brief.md`.

## What's NOT in this skill (yet)

- Portal/authenticated UI patterns — those haven't been built yet. When the portal lands, grow this skill to cover dashboard shells, table patterns, empty states, and form layouts beyond lead capture.
- Knowledge base templates — when `gaiabots.ai` grows beyond the landing page.
- Email templates — Resend is in the stack but no template system exists yet.

If you encounter one of these and there's no prior pattern, propose adding a new component to `@gaia/ui` rather than improvising inline in the app — keep the system the source of truth.

## Related memory

Two cross-session memory files at `~/.claude/projects/g--code-kiera-cropautonomy-platform/memory/` carry the original feedback that produced rules 1 and 2:

- `feedback_no_editorial_style.md`
- `feedback_no_arbitrary_text_sizes.md`

This skill is now the canonical reference. The memories stay for triggering recall in adjacent conversations (e.g., chatting about why a rule exists), but when the two disagree the skill wins.
