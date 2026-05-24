---
name: CropAutonomy Web
description: Public landing for the CropAutonomy platform, built on the shared gaia-field design system.
colors:
  field-green-deep: "#244f37"
  field-green-soft: "#a8d3b4"
  burnt-field-amber: "#b26b2c"
  slate-deep: "#263c4a"
  shell-deep: "#0f1411"
  ink-deep: "#171b19"
  ink-text: "#18211c"
  linen-100: "#f7f5ef"
  linen-200: "#e8e2d4"
  linen-300: "#d3c8b4"
  info-blue: "#2f6f8f"
  success-green: "#2f6b45"
  warning-amber: "#a86f18"
  error-clay: "#914037"
typography:
  display:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(3rem, 6vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "clamp(1.875rem, 3vw, 2.25rem)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.65
  body-sm:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "0.05em"
rounded:
  pill: "9999px"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.25rem"
  lg: "2rem"
  xl: "4rem"
  section: "6rem"
components:
  button-primary:
    backgroundColor: "{colors.field-green-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.ink-deep}"
    textColor: "{colors.linen-100}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink-deep}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
  button-outline-hover:
    backgroundColor: "{colors.linen-200}"
    textColor: "{colors.ink-deep}"
  eyebrow-pill:
    backgroundColor: "{colors.field-green-deep}"
    textColor: "{colors.field-green-deep}"
    rounded: "{rounded.pill}"
    padding: "0.375rem 0.75rem"
  feature-card:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1.75rem"
  audience-card:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  cta-section:
    backgroundColor: "{colors.shell-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.xl}"
    padding: "3rem"
  lead-form-input:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 0.875rem"
---

# Design System: CropAutonomy Web

## 1. Overview

**Creative North Star: "The Gaia Field System"**

CropAutonomy.com is the public face of the shared `gaia-field` design system (the DaisyUI theme name is the literal commitment). Warm linen surfaces, deep agricultural green primary, burnt-field amber accent, near-black ink for type. The palette is grounded in soil, leaf, and equipment, not in screen-default neutrals. The system is already in place across the app's components (`@gaia/ui`). This document captures it so future work enhances it instead of drifting from it.

The page reads like quiet operational infrastructure that happens to be public-facing. Section rhythm is generous (96px between sections, 48px–80px inside). Hero pairs a serif-weight semibold display with a single primary CTA and a single outline CTA, never a third. Imagery is real working farms in natural light, never studio renders.

**Key Characteristics:**
- Warm linen base (`linen-100` #f7f5ef), not stark white
- Deep field green primary, used sparingly on key CTAs and eyebrow accents
- Generous section spacing, restrained hierarchy, never a card grid for its own sake
- One dark surface per page (the CTA section on `shell-deep`), used as a punctuation mark
- System type stack; no decorative or display font dependencies

## 2. Colors

A grounded agricultural palette: deep field green carries the brand, warm linens carry the page, amber and slate provide minimal punctuation. No high-chroma anywhere.

### Primary
- **Field Green Deep** (#244f37, `--color-primary`): Hero primary CTA, link accents on warm surfaces, eyebrow text color, the brand pill background tint at ~10% opacity.

### Secondary
- **Slate Deep** (#263c4a, `--color-secondary`): Reserved for product surfaces where two non-amber accents are needed. Used sparingly on the landing.
- **Burnt Field Amber** (#b26b2c, `--color-accent`): State accent — "in development", status pills, attention markers. Never decorative.

### Neutral
- **Ink Deep** (#171b19, `--color-neutral`): Primary text on linen, dark CTA surface, heading color.
- **Ink Text** (#18211c, `--color-base-content`): Body copy on linen surfaces.
- **Linen 100** (#f7f5ef, `--color-base-100`): Default page surface. The warmth is the point.
- **Linen 200** (#e8e2d4, `--color-base-200`): Tonal hover, alternate section tone (`tone="warm"` on `Section`), button-outline hover.
- **Linen 300** (#d3c8b4, `--color-base-300`): Dividers, subtle borders.
- **Shell Deep** (#0f1411, `--color-shell-deep`): The single dark surface per page (CTA section). Reserved.
- **Field Green Soft** (#a8d3b4, `--color-leaf-soft`): Accent on dark surfaces only; eyebrow text inside the CTA section.

### Functional
- **Info Blue** (#2f6f8f), **Success Green** (#2f6b45), **Warning Amber** (#a86f18), **Error Clay** (#914037). Each has a `*-content` foreground; never rely on color alone for state.

### Named Rules
**The One Dark Surface Rule.** Exactly one `shell-deep` section per page (the CTA). Two dark sections turn the page into a magazine; the landing is operational infrastructure, not a campaign.

**The Quiet Accent Rule.** Burnt-field amber and field-green-deep are state and brand. Neither appears in body copy, decorative dividers, or icon strokes for their own sake. If a section uses no primary or accent color, that is correct.

## 3. Typography

**Display Font:** system-ui (with -apple-system, "Segoe UI", Roboto fallback)
**Body Font:** system-ui
**Label/Mono Font:** system-ui (no separate mono stack today)

**Character:** A single system stack carrying every weight. Calm, functional, no editorial flourish. Hierarchy comes from scale and weight contrast, not font pairing.

### Hierarchy
- **Display** (600, `clamp(3rem, 6vw, 3.75rem)`, 1.1): Hero h1 only. One per page.
- **Headline** (600, `clamp(1.875rem, 3vw, 2.25rem)`, 1.15, tracking -0.01em): Section h2 (`Features`, `Audiences`, `Roadmap`).
- **Title** (600, 1.125rem, 1.3): Card titles (`FeatureCard`, `AudienceCard`), panel headers.
- **Body** (400, 1.125rem, 1.65): Section lead copy and primary paragraphs. Cap line length at 65–75ch.
- **Body Small** (400, 0.875rem, 1.55): Supporting copy under titles and metadata.
- **Label** (600, 0.75rem, tracking 0.05em): Eyebrow labels above headlines. Sometimes uppercase, sometimes not — uppercase only when it's a structural label (e.g., "Where we are"), not when it's a soft tag.

### Named Rules
**The One Display Rule.** Exactly one display-weight headline per page (the hero). Subsequent headings drop to Headline scale.

## 4. Elevation

The system is **flat by default**. No box-shadows on cards, panels, or buttons at rest. Depth is conveyed through tonal layering: warm linen alternates with marginally-darker `linen-200` between sections (`<Section tone="warm">`), and the single dark `shell-deep` CTA section provides the only true visual elevation.

### Shadow Vocabulary
None at rest. Hover and focus states use background tint shifts, not shadows.

### Named Rules
**The Flat Surface Rule.** Surfaces do not lift. If you reach for `box-shadow`, you are probably trying to compensate for a layout that isn't working. Fix the layout instead.

## 5. Components

### Buttons
- **Shape:** Rounded small (6px / `rounded-md`).
- **Primary:** `field-green-deep` background, `linen-100` text, 10px / 20px vertical / horizontal padding. DaisyUI `.btn .btn-primary` with `rounded-md` override.
- **Hover:** Background shifts toward `ink-deep`. No transform, no shadow.
- **Outline:** Transparent with `ink-text/20` border, `ink-deep` text. Hover fills with `linen-200`.
- **Tertiary / link:** Inline anchor text in `field-green-deep`, semibold, with a trailing arrow glyph (e.g., "Joining the access list →"). No underline; the arrow carries the affordance.

### Eyebrow Pill (signature)
- Inline-flex pill with `field-green-deep` at 10% background, `field-green-deep` text, optional leading 6px dot in the same color. Used above hero headlines and section intros to mark phase ("Now in active development · prototype Aug 2026"). Always specific, never decorative.

### Cards / Containers (`FeatureCard`, `AudienceCard`)
- **Corner Style:** `rounded-lg` (8px) on feature cards, `rounded-lg` (8px) on audience cards, `rounded-xl` (12px) on hero image container.
- **Background:** `linen-100`.
- **Shadow Strategy:** None (see Elevation).
- **Border:** Hairline `ink-text/[0.08]` only when visually necessary; default is no border.
- **Internal Padding:** 1.25rem to 1.75rem depending on content density.

### Inputs / Fields (`LeadForm`)
- **Style:** `linen-100` background, hairline `ink-text/20` stroke, `rounded-md` (6px), 10px / 14px padding.
- **Focus:** Stroke shifts to `field-green-deep`; no glow, no shadow.
- **Error:** Stroke shifts to `error-clay`; helper text below in `error-clay`. Never color-only.

### Navigation (`Header`)
- **Style:** `linen-100` background, hairline bottom border in `linen-300`. Inline nav links in `ink-deep`, weight 500, hover shifts to `field-green-deep`.
- **Brand:** Wordmark in `ink-deep`, no logo lockup.
- **Sister brand link:** Smaller, muted weight, signals ecosystem membership without competing with primary CTA.
- **Mobile:** Stacks; CTA stays primary, never hidden behind a menu.

### Section (signature wrapper)
- `tone="light"` → `linen-100`; `tone="warm"` → `linen-200`; `tone="dark"` → `shell-deep` (CTA only).
- Alternating warm/light cadence creates rhythm without dividers or shadows.

### Roadmap List (signature)
- Vertical list with status badges (`statusTone: success | accent | secondary | muted`). Status is the only color in the list. Layout uses a left rail with quarter labels, right rail with status, body copy spanning the middle.

### CTA Section
- Full-bleed `shell-deep` panel, `rounded-xl`, with `linen-100` text and `field-green-soft` eyebrow. Pairs marketing copy (left) with the LeadForm (right) in a single visual block.

## 6. Do's and Don'ts

### Do:
- **Do** keep the page on warm `linen-100`/`linen-200` and reserve `shell-deep` for the single CTA per page.
- **Do** use the eyebrow pill ("Now in active development · prototype Aug 2026") to set phase honestly on every page.
- **Do** pair every CTA with an outline secondary action — never a third button.
- **Do** use real working-farm photography in natural light, full-bleed in containers with `rounded-xl`.
- **Do** describe Field Capture in future tense and roadmap framing.
- **Do** cap body copy at 65–75ch.
- **Do** size touch targets for gloved or one-handed phone use (minimum 44px hit area).
- **Do** route every state with shape, label, or icon redundancy alongside color.

### Don't:
- **Don't** use the hero-metric template (big number, small label, supporting stats, gradient accent). The page is operational, not pitch-deck.
- **Don't** use identical card grids beyond what `Features`/`Audiences` already commit to — three or four cards in a row is the cap.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe on cards, alerts, or list items.
- **Don't** apply `background-clip: text` with a gradient on any heading. Use a single solid color.
- **Don't** add decorative gradients. The shell-deep CTA carries a subtle photographic gradient — that is the entire gradient budget.
- **Don't** use glassmorphism, backdrop-blur, or frosted-card effects.
- **Don't** introduce playful consumer visuals, soft startup styling, or editorial / magazine-typographic layouts.
- **Don't** make present-tense claims for Field Capture before it ships.
- **Don't** frame CropAutonomy as a mobile-first phone scouting app — Field Capture is one input method into the platform.
- **Don't** use em dashes in body copy. Use commas, colons, periods, or parentheses.
- **Don't** animate CSS layout properties; reserve motion for state transitions.
