---
name: CropAutonomy Portal
description: Authenticated operations console for CropAutonomy, built on the shared gaia-field design system in a dense operational layout.
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
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
  body-sm:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.5
  metric:
    fontFamily: "system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1
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
spacing:
  xs: "0.5rem"
  sm: "0.875rem"
  md: "1.25rem"
  lg: "1.75rem"
  gap-grid: "1.25rem"
components:
  button-primary:
    backgroundColor: "{colors.field-green-deep}"
    textColor: "{colors.linen-100}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.875rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-deep}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  panel:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  panel-header:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-deep}"
    padding: "1rem 1.25rem"
  stat-card:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.lg}"
    padding: "1rem"
  status-pill-success:
    backgroundColor: "{colors.success-green}"
    textColor: "{colors.success-green}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  status-pill-accent:
    backgroundColor: "{colors.burnt-field-amber}"
    textColor: "{colors.burnt-field-amber}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  status-pill-muted:
    backgroundColor: "{colors.linen-200}"
    textColor: "{colors.ink-text}"
    rounded: "{rounded.pill}"
    padding: "0.125rem 0.5rem"
  filter-pill:
    backgroundColor: "transparent"
    textColor: "{colors.ink-text}"
    rounded: "0"
    padding: "0.25rem 0.75rem"
  table-row:
    backgroundColor: "{colors.linen-100}"
    textColor: "{colors.ink-text}"
    padding: "0.875rem 1.25rem"
---

# Design System: CropAutonomy Portal

## 1. Overview

**Creative North Star: "The Gaia Field System, Operations Voice"**

The portal is the operator's daily console. It uses the same `gaia-field` palette as the public landings, but at much higher density: scale steps drop one level (0.875rem body, 0.75rem metadata), spacing tightens, and the AppShell sidebar + topbar replaces marketing's section rhythm. The mood is quiet by default. Color appears only where state demands attention: amber pills for "needs review", success green for an open spray window, muted pills for offline devices.

The signature surfaces are the **map panel** (full-bleed Mapbox view with field polygons, watchlist polygons, and device pins as the primary layer), the **stat row** (compact 4-up metric cards with optional tone accent), and the **dense tables** (scan list, scout list, devices list) styled as panel-internal lists with hairline `ink-text/[0.06]` row dividers. Cards do not float; they sit on a `linen-100` surface with hairline borders.

This is mission-control restraint, not SaaS dashboard polish. The "Good afternoon, Brandon" headline is plain language because operators are mid-task, not consuming a marketing surface.

**Key Characteristics:**
- Higher density than the marketing surfaces: body at 0.875rem, metadata at 0.75rem
- Map panel as the page hero, not a metric strip
- Status conveyed through pills with shape + label + color (never color alone)
- Plain-language headings ("Good afternoon, Brandon", "Today's scout list", "Devices on the move")
- Sidebar + topbar AppShell, fixed; content area scrolls
- Modal-first interactions are forbidden — operators are in a workflow

## 2. Colors

Identical palette to the public landings; role assignments tuned for operational state.

### Primary
- **Field Green Deep** (#244f37, `--color-primary`): Primary action button ("New scan"), primary links ("All scans →"), field labels in the Needs Attention card, sidebar active state.

### Secondary
- **Burnt Field Amber** (#b26b2c, `--color-accent`): "Fields worth a look" StatCard tone, accent status pills ("Needs review", "Due today"), assignee chips for accent owners, watchlist layer color on the map.
- **Slate Deep** (#263c4a, `--color-secondary`): Assignee chip background for the secondary owner ("JM"), secondary status tones ("Trending down", "Action queued", "Tomorrow").

### Neutral
- **Linen 100** (#f7f5ef, `--color-base-100`): All panel surfaces. The portal does not use a separate page background — the body is `linen-100` and panels sit on it with hairline borders.
- **Linen 200** (#e8e2d4): Muted status pill background, hover tonal shift, sidebar separator zone.
- **Ink Deep** (#171b19, `--color-neutral`): Headings, metric values, primary text.
- **Ink Text** (#18211c, `--color-base-content`): Body, with opacity steps (`/55`, `/60`, `/65`, `/70`) carrying secondary hierarchy.
- **Shell Deep** (#0f1411): Reserved for any future dark map-overlay panel or live-stream component. Not used in the current portal surface.

### Functional
- **Info Blue** (#2f6f8f), **Success Green** (#2f6b45, used for "Spray window open" and "Done" pills), **Warning Amber** (#a86f18), **Error Clay** (#914037). Each has a `*-content` foreground.

### Named Rules
**The Quiet-by-Default Rule.** The portal is calm at rest. Color appears where state demands attention (a flagged scan, a degrading device, a closing spray window) and nowhere else. A screen full of color means a screen full of noise.

**The Opacity Hierarchy Rule.** Secondary and tertiary text are achieved with `ink-text/65`, `/60`, `/55`, not with separate gray tokens. Stepping opacity preserves color temperature; stepping into pure gray breaks the palette.

## 3. Typography

**Display Font:** system-ui (with -apple-system, "Segoe UI", Roboto fallback)
**Body Font:** system-ui
**Label/Mono Font:** system-ui (no separate mono stack today; numeric tabular alignment uses CSS `font-variant-numeric` where required)

**Character:** A single system stack at compact operational scale. Body at 0.875rem, metadata at 0.75rem, page title at 1.5rem. Hierarchy is achieved through size, weight, and opacity, never font swap.

### Hierarchy
- **Display** (600, 1.5rem, 1.2, tracking -0.01em): Page title only ("Good afternoon, Brandon"). One per route.
- **Headline** (600, 1.125rem, 1.3): Panel-header h3 ("Field conditions", "Today's scout list"). Sentence case.
- **Title** (600, 1rem, 1.3): Inline element titles inside panels (scan title, device name, attention item header).
- **Body** (400, 0.875rem, 1.55): Default body and table cells. Cap line length on long-form blocks at ~80ch (denser than marketing).
- **Body Small** (400, 0.75rem, 1.5): Metadata, timestamps, table footers, sidebar nav meta.
- **Metric** (600, 1.25rem, 1): Stat-card values, weather stat values. Tabular numbers preferred via `font-variant-numeric: tabular-nums`.
- **Label** (600, 0.75rem, tracking 0.06em, uppercase): Table column headers ("Scan", "Field", "Source", "Status", "Confidence"), diagram column headers.

### Named Rules
**The One Display Rule.** Exactly one display headline per route (the page title).

**The Live Region Rule.** Real-time updates to text content (scan status, device telemetry, alert counts) must use `aria-live="polite"` regions. Operators rely on assistive tech in the cab; silent DOM updates are invisible.

## 4. Elevation

Flat by default. Panels are `linen-100` with hairline `ink-text/[0.10]` borders, not shadows. The portal's depth language is **border weight and tonal contrast**, not shadow.

### Shadow Vocabulary
None on resting panels. The map panel's internal overlays (org selector, view-mode toggle, layer toggle) may use a subtle 1px border and 4–8% tonal background lift; nothing further. Modals (when unavoidable) use a 24% black scrim and a single subtle drop-shadow on the panel only.

### Named Rules
**The Border Beats Shadow Rule.** When you want to define a surface boundary, reach for a 1px `ink-text/[0.08–0.12]` border before reaching for a shadow. Shadows on flat operational UI are noise.

**The Flat-At-Rest Rule.** Surfaces are flat at rest. Any shadow is a response to a transient state (open menu, dragging, hovering an interactive map pin) — never decorative.

## 5. Components

### AppShell (signature)
- Sidebar + topbar + content scroll region. Sidebar is `linen-100` with hairline right border, fixed width on `lg+`, collapsible below. Topbar includes search ("⌘K"), org switcher ("Korous Family Operations"), notification bell, user chip.
- Nav items: 16px icon left, label center, optional `meta` count or `badge` (tone-colored pill) right. Active item has a `linen-200` background tint and `ink-deep` text; inactive items use `ink-text/65`.
- Sidebar footer carries a `SidebarPulseCard` (tone success/accent/muted) summarizing fleet state.

### Page Header
- Page title (Display) + supporting one-line context paragraph + right-aligned action cluster (Ghost button + Primary button). Border-bottom hairline `ink-text/[0.10]`.
- Context strip above the title: timestamp + state indicator with leading 6px dot ("Spray window open until 5:40 PM" with `success-green` dot and text).

### Buttons
- **Shape:** Rounded small (6px / `rounded-md`).
- **Primary:** `field-green-deep` background, `linen-100` text, 8px / 14px padding (denser than marketing). Used sparingly — one per page-header action cluster.
- **Ghost:** Transparent, `ink-deep` text, hairline `ink-text/[0.15]` border, hover fills with `ink-text/[0.04]`.
- **Inline link / action:** Anchor in `field-green-deep`, semibold, with trailing arrow ("All scans →", "Manage fleet →").

### Stat Cards (signature)
- 4-up grid (`md:grid-cols-2 lg:grid-cols-4`). Each card: leading 16px icon, label (Body Small), metric (Metric scale), meta line (Body Small at lower opacity). Optional `delta` chip ("+18%" with `success-green` tone) and optional card-level `tone="accent"` switches the icon-and-metric to amber for state cards ("Fields worth a look").

### Map Panel (signature)
- Full-bleed Mapbox container with header strip: title, meta, org selector chip, view-mode toggle group, time-range chip, "Open full map →" link. Footer strip: liveness indicator ("5 devices live · 3 scans this hour"). Layer toggle row below the header lists tone-colored chips (`primary | muted | accent`) with optional counts.
- Pins: device pins are 22px circular markers with a 1px ring; watchlist polygons are filled with `accent` at 15% alpha and stroked with `accent`; field polygons are filled with `primary` at 8% alpha and stroked with `primary` at 40%.
- Empty / no-token state: dashed-border panel with an amber "Map needs setup" badge and explicit env-var instructions. Never silently blank.

### Tables / Lists (signature)
- Used for: recent scans, scout list, attention items, devices-on-the-move.
- Structure: panel header (h3 + supporting context line, right-aligned filter pills or "+ New" action) over a row list. Rows separated by hairline `ink-text/[0.06]` dividers; last row has no divider.
- Row grid is custom per table (e.g., scans use `[200px_180px_140px_1fr_80px]`); column header strip uses Label scale on a `ink-text/[0.03]` tonal background.
- Per-row leading icon in a 36px (`h-9 w-9`) `rounded-md` square, tone-tinted background (`ink-text/[0.06]` default, `accent/15` for flagged).

### Status Pills (signature)
- Rounded-full, Label scale (0.75rem semibold), 2px / 8px padding. Background uses the tone color at 15% alpha, text uses the tone color at full strength. Tones: `success`, `accent`, `secondary`, `muted` (linen-200 background, ink-text foreground).
- Always paired with a label; never used as a color-only dot for state.

### Filter Pill Group
- Inline button group inside a `rounded-md` outer border. Each pill is square-cornered (the group provides the rounding), Label scale, with active state shown by `ink-text/[0.05]` background tint and `ink-deep` text, semibold.

### Inputs / Fields
- Search input in topbar: `ink-text/[0.04]` background, `rounded-md`, with leading magnifier icon and trailing keyboard shortcut chip ("⌘K").
- Form inputs in the rest of the portal follow the marketing pattern: `linen-100` background, hairline `ink-text/20` stroke, focus shifts stroke to `field-green-deep`.

### Sidebar Pulse Card (signature)
- Small status card in the sidebar footer summarizing fleet state. Tone-tinted (success/accent/muted), title in Title scale, body in Body Small. Replaces the temptation to scatter live metrics across the sidebar.

### Scout Checkbox (signature)
- Custom checkbox: 14px square, 1.5px border. Default state `ink-text/30` border on transparent. Done state `success-green` background tint at 15% with `success-green` border and check icon. Strike-through text on completed task title.

## 6. Do's and Don'ts

### Do:
- **Do** use `linen-100` as the panel background and rely on hairline `ink-text/[0.08–0.12]` borders for surface boundaries.
- **Do** keep color reserved for state. A panel with no color anywhere is correct.
- **Do** pair every status indicator with a label and a recognizable shape (pill, icon), not color alone.
- **Do** use plain language in page titles and panel headers ("Good afternoon, Brandon", "Devices on the move", "Today's scout list").
- **Do** show empty and setup states explicitly (the Mapbox token banner is the model).
- **Do** use `aria-live="polite"` for any text content that updates from real-time data.
- **Do** size touch targets for gloved or one-handed phone use; the portal must work outdoors.
- **Do** use tabular-numeric (`font-variant-numeric: tabular-nums`) on metric values and confidence scores so columns align.
- **Do** keep one primary action per page-header action cluster.

### Don't:
- **Don't** reach for a modal as the first interaction. Inline editors, side panels, and progressive disclosure first. Modals only when the action must block all other work.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored stripe on alerts, list items, or cards. Use a tonal background or a status pill instead.
- **Don't** apply box-shadows to resting panels. Use borders.
- **Don't** apply `background-clip: text` with a gradient on any heading or metric.
- **Don't** use glassmorphism, backdrop-blur, or frosted-card ornament. The map's overlay controls use a solid `linen-100/95` background, not blur.
- **Don't** use the hero-metric template (big number, small label, supporting stats, gradient accent). StatCards are 4-up, equal weight, no decoration.
- **Don't** introduce playful consumer visuals, soft startup styling, neon gaming, or editorial / magazine-typographic layouts.
- **Don't** use fake screenshots or placeholder data in shipped views — empty states, "coming soon" markers, and skeletons instead.
- **Don't** use em dashes in body copy. Commas, colons, periods, parentheses.
- **Don't** animate CSS layout properties. Real-time updates use opacity and color transitions only.
- **Don't** hard-code single-farm or single-org assumptions in any screen, URL, query, or copy. Org context is always visible and switchable.
