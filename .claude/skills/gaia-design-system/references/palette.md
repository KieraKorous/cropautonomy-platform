# gaia-field palette

The theme is defined in `packages/ui/src/theme.css`. All apps set `data-theme="gaia-field"` on `<html>` to activate it. Reference these tokens via Tailwind/DaisyUI utility classes (`bg-primary`, `text-base-content/70`, etc.) — never reach for hex literals in component code.

## DaisyUI theme tokens

Surface colors — warm agricultural neutrals:

| Token | Hex | Role |
|---|---|---|
| `base-100` | `#f7f5ef` | Cream / parchment. Default page ground, card surfaces. |
| `base-200` | `#e8e2d4` | Wheat. Alternating section grounds (typically `base-200/60`). |
| `base-300` | `#d3c8b4` | Oat. Image/input placeholders, sub-panels. |
| `base-content` | `#18211c` | Ink. Body text on cream surfaces. |

Brand colors:

| Token | Hex | Role |
|---|---|---|
| `primary` | `#244f37` | Deep moss. CropAutonomy brand color; primary buttons; eyebrow labels on light surfaces. |
| `primary-content` | `#f7f5ef` | Cream. Text on primary surfaces. |
| `secondary` | `#263c4a` | Steel slate. Secondary surfaces, supporting pill tones (e.g. "Planned" milestone). |
| `secondary-content` | `#f7f5ef` | Cream. Text on secondary. |
| `accent` | `#b26b2c` | Oxidized copper. GAIAbots brand mark; sparing data-on accents; "In progress" status pills. |
| `accent-content` | `#fff8ed` | Warm white. Text on accent. |
| `neutral` | `#171b19` | Charcoal. Dark CTA surfaces, GAIAbots mark background. |
| `neutral-content` | `#f7f5ef` | Cream. Text on dark surfaces. |

Semantic state colors:

| Token | Hex | Role |
|---|---|---|
| `info` | `#2f6f8f` | Informational accents (rare). |
| `success` | `#2f6b45` | "Shipped" milestone, positive states. |
| `warning` | `#a86f18` | Warning states. |
| `error` | `#914037` | Error states. |

Structural tokens:

- `rounded-box` → 0.5rem — cards, large surfaces
- `rounded-field` → 0.375rem — inputs, buttons, pills
- `rounded-selector` → 0.375rem — radio/checkbox

## Custom `@theme` tokens

Registered for cases where DaisyUI's standard set doesn't cover the need.

| Class | Hex | Why it exists |
|---|---|---|
| `text-leaf-soft` / `bg-leaf-soft` | `#a8d3b4` | Soft green accent legible on dark surfaces — used for CTA eyebrows (`text-leaf-soft`) and bullet check marks in `CheckList tone="light"`. The `success` token (`#2f6b45`) is too dark to read on `bg-neutral`. |
| `bg-shell-deep` / `text-shell-deep` | `#0f1411` | Deepest dark — slightly darker than `neutral`. Used for footer ground and hero dark overlays where you want the surface to feel set *into* the page rather than floating on it. |

### Adding new custom tokens

Edit the `@theme` block at the top of `packages/ui/src/theme.css`:

```css
@theme {
  --color-leaf-soft: #a8d3b4;
  --color-shell-deep: #0f1411;
  /* add new --color-* tokens here */
}
```

After registering:

1. Update this file with the new class, hex, and "why" rationale.
2. Use the named class throughout — do not reference the hex value directly.
3. If the token is meant for a specific role (e.g. only on dark surfaces), say so in the "why" line so future readers don't misuse it.

## Opacity modifiers

Tailwind v4 allows any opacity step via `/N` (e.g., `text-base-content/70`, `bg-primary/10`). The compiler will JIT any value, but prefer the standard steps for consistency.

Canonical opacity patterns currently in use:

| Pattern | Use |
|---|---|
| `text-base-content/70` | Body text on light surfaces |
| `text-base-content/55` to `/60` | Muted/secondary text on light surfaces |
| `text-neutral-content/70` to `/80` | Body text on dark surfaces |
| `text-neutral-content/45` to `/55` | Muted/secondary text on dark surfaces |
| `border-base-content/10` | Hairline borders on light |
| `border-neutral-content/10` | Hairline borders on dark |
| `bg-base-200/60` | Alt-section ground (warm) |
| `bg-primary/10` | Soft pill / icon-badge fill |
| `bg-primary/15` | Slightly heavier pill fill |
| `bg-accent/15` | Accent pill fill |

Don't reach for `/72` or `/78` if `/70` or `/80` would do the job.

## Body gradient

`packages/ui/src/theme.css` also sets a subtle top-to-bottom green wash on `body`:

```css
background:
  linear-gradient(180deg, rgba(36, 79, 55, 0.08), rgba(247, 245, 239, 0) 36rem),
  #f7f5ef;
```

This adds a faint moss tint to the top viewport, fading to clean cream by ~36rem. It's intentional — don't remove it or override it on per-page basis without a reason.
