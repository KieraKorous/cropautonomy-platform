---
name: GaiaBots Web
description: Public landing for the GaiaBots robotics brand, built on the shared gaia-field design system with a dark-hero treatment.
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
    fontSize: "clamp(3rem, 7vw, 4.5rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.015em"
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
    letterSpacing: "0.06em"
rounded:
  pill: "9999px"
  sm: "0.375rem"
  md: "0.5rem"
  lg: "0.75rem"
  xl: "1rem"
  "2xl": "1.25rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1.25rem"
  lg: "2rem"
  xl: "4rem"
  section: "6rem"
components:
  button-primary-on-dark:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-deep}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
  button-primary-on-dark-hover:
    backgroundColor: "{colors.linen-200}"
    textColor: "{colors.ink-deep}"
  button-outline-on-dark:
    backgroundColor: "transparent"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.sm}"
    padding: "0.625rem 1.25rem"
  eyebrow-pill-accent:
    backgroundColor: "{colors.burnt-field-amber}"
    textColor: "{colors.burnt-field-amber}"
    rounded: "{rounded.pill}"
    padding: "0.375rem 0.75rem"
  device-card:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1.5rem"
  future-family-card:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  diagram-row:
    backgroundColor: "{colors.shell-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.md}"
    padding: "1rem"
  diagram-platform-card:
    backgroundColor: "{colors.field-green-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.md}"
    padding: "1.5rem"
  cta-section:
    backgroundColor: "{colors.shell-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.xl}"
    padding: "3rem"
---

# Design System: GaiaBots Web

## 1. Overview

**Creative North Star: "The Gaia Field System, Hardware Voice"**

GaiaBots.ai is the robotics-brand surface of the shared `gaia-field` design system. Same tokens, same component vocabulary as CropAutonomy, with one disciplined inversion: the hero is dark (`shell-deep`), not warm linen. That dark hero signals "engineering org with hardware in development" without resorting to sci-fi or product-render aesthetics. Everything below the hero returns to the shared warm-linen rhythm.

The amber accent (`burnt-field-amber`) carries more weight here than on CropAutonomy because development status is the central message: it appears in the hero eyebrow, on device status badges, and in the system diagram on the device-side ingestion nodes. The leaf-soft green is reserved for the operator-team side of the same diagram, so the two color roles are immediately legible (hardware vs. people).

**Key Characteristics:**
- Dark `shell-deep` hero, warm `linen-100` body, dark `shell-deep` CTA — three dark surfaces are intentional and structural
- Amber accent is louder here than on CropAutonomy; it carries "in development" everywhere
- Real aerial and ground photography under a dark gradient overlay, never rendered hardware
- Device cards expose specs as compact key/value tables, not decorative spec strips
- System diagram is the signature component: device-side amber, platform-center green, team-side leaf-soft

## 2. Colors

Same palette as the shared system. Role assignments shift to reflect the robotics-brand voice: amber carries development status, leaf-soft carries operator/team roles, primary green carries the platform itself.

### Primary
- **Field Green Deep** (#244f37, `--color-primary`): The CropAutonomy platform card in the system diagram; "Visit CropAutonomy" link affordances on light surfaces.

### Secondary
- **Burnt Field Amber** (#b26b2c, `--color-accent`): Hero status pill ("Hardware in active development"), device status badges ("Concept · in development"), device-side rows in the system diagram. The dominant accent on this site.
- **Slate Deep** (#263c4a, `--color-secondary`): Available, used sparingly; reserved for product-side variant patterns.

### Neutral
- **Shell Deep** (#0f1411, `--color-shell-deep`): Hero surface, "Connect" section background, CTA section. Three intentional dark surfaces per page.
- **Ink Deep** (#171b19, `--color-neutral`): Body text on linen, button text on light buttons placed over dark surfaces.
- **Linen 100** (#f7f5ef, `--color-base-100`): Default body surface (`Devices`, `Future`, `KnowledgeBase` sections), light button background on dark surfaces.
- **Linen 200** (#e8e2d4, `--color-base-200`): Tonal hover, alternate section tone.
- **Linen 300** (#d3c8b4): Dividers, subtle borders.
- **Field Green Soft / Leaf Soft** (#a8d3b4, `--color-leaf-soft`): Operator/team-side rows in the system diagram, eyebrow text on dark surfaces ("One ecosystem", "Follow development").

### Functional
- **Info Blue** (#2f6f8f), **Success Green** (#2f6b45), **Warning Amber** (#a86f18), **Error Clay** (#914037). Each has a `*-content` foreground; never rely on color alone for state.

### Named Rules
**The Hardware-Amber Rule.** Burnt-field amber on this site means "hardware status" or "in development". Never decorative. If you're using amber to make a section feel warmer, use linen instead.

**The Two-Tone Diagram Rule.** In the system diagram, device-side rows are amber, team-side rows are leaf-soft, and the platform-center card is field-green-deep. This three-tone assignment is the diagram's entire visual logic — don't add a fourth.

## 3. Typography

**Display Font:** system-ui (with -apple-system, "Segoe UI", Roboto fallback)
**Body Font:** system-ui
**Label/Mono Font:** system-ui (no separate mono stack today)

**Character:** Same stack as CropAutonomy; hero display scale is one step larger (`clamp(3rem, 7vw, 4.5rem)` vs `clamp(3rem, 6vw, 3.75rem)`) because the dark surface absorbs more visual weight. Labels use slightly wider tracking (0.06em) for the technical / spec-card feel.

### Hierarchy
- **Display** (600, `clamp(3rem, 7vw, 4.5rem)`, 1.05): Hero h1 only. One per page.
- **Headline** (600, `clamp(1.875rem, 3vw, 2.25rem)`, 1.15): Section h2 (`Devices`, `Connect`, `Future`, `KnowledgeBase`).
- **Title** (600, 1.125rem, 1.3): Card titles, diagram-platform-card heading, device codes.
- **Body** (400, 1.125rem, 1.65): Section lead copy.
- **Body Small** (400, 0.875rem, 1.55): Spec table values, diagram subtitles, supporting copy.
- **Label** (600, 0.75rem, tracking 0.06em, uppercase): Diagram column headers ("Field devices", "Field teams", "CropAutonomy platform"). Eyebrows over headlines may or may not be uppercase.

### Named Rules
**The One Display Rule.** Exactly one display-weight headline per page (the hero).

## 4. Elevation

Flat by default. The visual depth on this site comes from **dark/light surface alternation**, not from shadows. The hero, the Connect/diagram section, and the CTA are dark `shell-deep` surfaces with hairline `linen-100/10` borders on internal cards; everything else is warm linen.

### Shadow Vocabulary
None at rest. State (hover, focus) uses tint shifts and border-color shifts.

### Named Rules
**The Flat Surface Rule.** No shadows. Depth is achieved by alternating dark and light sections.

## 5. Components

### Buttons
- **Shape:** Rounded small (6px / `rounded-md`).
- **Primary-on-dark:** `linen-100` background, `ink-deep` text, 10px / 20px padding. Used on hero ("Follow development") and CTA.
- **Outline-on-dark:** Transparent with `linen-100/30` border, `linen-100` text. Hover fills with `linen-100/10`.
- **Light-surface buttons:** Same shape language as CropAutonomy (primary in `field-green-deep`, outline in `ink-text/20` border).

### Eyebrow Pill (signature)
- On dark surfaces: `burnt-field-amber` at 15% background with a `burnt-field-amber/30` border, `burnt-field-amber` text, leading 6px dot in the same color. Used for "Hardware in active development" in the hero.
- On light surfaces: `field-green-deep` text only (no pill), prefixed to the section ("Coming to GAIAbots.ai", "Where we are").

### Cards / Containers (`DeviceCard`, `FutureFamilyCard`)
- **Corner Style:** `rounded-lg` (8px) on device and future-family cards, `rounded-2xl` (20px) on the system-diagram outer container.
- **Background:** `linen-100` on light sections; nested cards inside the dark diagram use `shell-deep` with `linen-100/10` hairline border.
- **Shadow Strategy:** None.
- **Border:** Hairline `linen-100/10` on dark surfaces; minimal or none on light.
- **Internal Padding:** 1.25rem to 1.5rem.

### Device Card (signature)
- Image-forward card pairing a wide aspect image with a code badge (`GAIA-R`, `GAIA-D`), a status badge ("Concept · in development"), a paragraph, and a compact spec table (left key, right value, hairline divider). Spec table uses Body Small at 0.875rem.

### System Diagram (signature)
- Five-column horizontal flow on `lg`: device column → arrow → platform card → arrow → team column. Stacks vertically below `lg`. Each column has an uppercase Label header; rows are `diagram-row` cards (amber for devices, leaf-soft for team); the center is a `field-green-deep` platform card with chip-style tags ("Ingestion API", "Scan storage", etc.) using `primary-content/10` chip backgrounds.

### Inputs / Fields (`LeadForm`)
- Same as CropAutonomy: `linen-100` background, hairline stroke, `rounded-md`, focus shifts stroke to `field-green-deep`.

### Navigation (`Header`)
- Same shape as CropAutonomy with `brand="gaiabots"`. Sister-brand link points back to CropAutonomy.

### Section (signature wrapper)
- `tone="light"` → `linen-100`; `tone="warm"` → `linen-200`; `tone="dark"` → `shell-deep`. This site uses all three.

## 6. Do's and Don'ts

### Do:
- **Do** keep one `shell-deep` hero per page, with an amber eyebrow pill signaling development status.
- **Do** use real aerial/ground photography under a left-to-right `shell-deep` gradient overlay (92% → 72% → 40% alpha).
- **Do** use the amber/leaf-soft/green three-tone assignment in the system diagram exactly as defined.
- **Do** present device specs as compact key/value tables, not decorative spec rails.
- **Do** maintain hardware status framing ("Concept · in development", "Hardware in active development") on every device surface until that device actually ships.
- **Do** reinforce that GAIA captures feed the same CropAutonomy pipeline as operator Field Capture — once per page is enough.
- **Do** cap body copy at 65–75ch.
- **Do** route every state with shape, label, or icon redundancy alongside color.

### Don't:
- **Don't** use rendered/CGI hardware imagery; real photography only, even if the hardware in frame isn't ours yet.
- **Don't** add a "GAIA-U", "GAIA-User", or "GAIA-Handheld" card to the device grid. Field Capture is not a GaiaBots device.
- **Don't** introduce sci-fi visual language: no chrome, no neon glow, no "the future of farming" headlines.
- **Don't** use consumer gadget framing (Apple-keynote product shots, unboxing aesthetic, hero-metric template).
- **Don't** apply `background-clip: text` with a gradient on any heading.
- **Don't** use side-stripe colored borders (`border-left` > 1px) on cards, alerts, or rows.
- **Don't** use glassmorphism or backdrop-blur on the dark surfaces — the photographic gradient is the entire dark-surface treatment.
- **Don't** introduce editorial / magazine-typographic layouts (oversized serifs, asymmetric grids, scroll-driven typographic effects).
- **Don't** imply commercial availability for GAIA-R or GAIA-D before they ship.
- **Don't** use em dashes in body copy.
- **Don't** animate CSS layout properties.
