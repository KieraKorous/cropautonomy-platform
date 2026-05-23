# Brand voice

Two brand surfaces, one ecosystem. Voice differs in posture but shares the underlying commitment to grounded, technically credible language.

## CropAutonomy — the platform brand

The platform farms, growers, and research teams will use. Voice is **confident, grounded, technically credible, practical, future-facing**.

### Sounds like

- "Autonomous agricultural intelligence for the modern farm."
- "Built for farms, agricultural businesses, agronomy teams, and research institutions."
- "Spotty cell coverage. Dust on the lens. A scout with one hand on a clipboard. CropAutonomy is being built around the realities of the field — not the comforts of an office dashboard."
- "Tell us what you grow, where you grow it, and what would matter most."
- "We reply personally within a week."

### Avoid

- **Hype words**: "revolutionary", "game-changing", "unlock unprecedented", "next-gen"
- **Overpromising autonomy**: don't say "fully autonomous" anything until it actually is
- **Generic startup language**: "empower", "supercharge", "transform your workflow"
- **Vague AI claims**: "AI-powered everything", "intelligent insights", "smart recommendations"
- **Editorial framing the user has rejected**: "Built as infrastructure, not generic SaaS", "Four primitives that compose…", numbered section kickers

### Stance on current state

Coming soon, active development, prototype target August 2026. Always present that honestly. Phrases that work:

- "Now in active development"
- "Prototype Aug 2026"
- "A platform being built in the open"
- "We are early"
- "What's real, what's next"

### Field Capture — the named first capture method

**Field Capture** is the locked product name for the phone-camera + bulk-upload capture method on the CropAutonomy platform. It is the first capture method on the build sequence (the visible loop in the Aug 2026 prototype) — but it is **not yet built** and **not the platform centerpiece**.

Hard rules when referencing Field Capture in copy:

- Use the name **Field Capture** (two words, title case).
- Frame in future / roadmap tense: "Field Capture is the first capture method we're building", "the v1 input method for the Aug 2026 prototype", "phone capture and bulk upload, planned". Never present tense as a functional claim ("scout with the camera in your pocket today", "get back disease pressure", "Field Capture lets your team…").
- Field Capture is **one of multiple planned capture inputs** alongside GAIA-D drone, GAIA-R rover, GAIA-S sensor, and future sources. They all feed the same downstream pipeline.
- Do **not** label it GAIA-U, GAIA-User, or GAIA-Handheld. The GAIA-{R,D,S,C,E,A} taxonomy is reserved for GAIAbots-manufactured hardware. If a GAIA-letter codename is ever needed internally, prefer GAIA-H or GAIA-V — but the public name remains Field Capture.
- Do **not** position CropAutonomy as a mobile-first product or a phone scouting app. The platform centerpiece is autonomous agricultural intelligence delivered by the GAIA device lineup; Field Capture is the input that can be built first because it does not depend on hardware.
- Do **not** contrast Field Capture as "available" against GAIA-R/D as "coming." Both are in development; Field Capture is just earlier in the build sequence.

On GAIAbots surfaces: reference Field Capture as one of the planned input channels into the shared CropAutonomy pipeline alongside GAIA-R and GAIA-D — but never as a GAIAbots device, and never on the device grid.

## GAIAbots — the robotics / hardware brand

The robotics arm of the CropAutonomy ecosystem. GAIA-R rover, GAIA-D drone, and a documented expansion family (GAIA-S sensor station, GAIA-C control hub, GAIA-E edge compute, GAIA-A autonomous actuator). Voice is **precise, technical, exploratory, credible, field-aware**.

### Sounds like

- "Field robotics for autonomous agriculture."
- "A ground rover that walks the rows. An aerial drone that watches the whole parcel. Both feed the same CropAutonomy workspace."
- "Concept · in development"
- "The roadmap leaves room for sensor stations, edge AI compute, control hubs, and autonomous actuator systems — each operating inside the same telemetry, mission, and tenancy model."
- "As GAIA-R and GAIA-D mature, this site grows into the technical reference farms, technicians, and integrators rely on — written by the people building the hardware."

### Avoid

- **Toy-robot branding**: cutesy mascots, friendly-robot anthropomorphism, "meet our newest helper"
- **Sci-fi exaggeration**: "the future of farming", "ushering in a new era", "tomorrow's autonomy today"
- **Vague hardware promises**: "advanced multi-sensor fusion", "next-gen autonomy", spec sheets that overpromise unreleased capabilities
- **Consumer-gadget styling**: feature-bullet lists pretending the device is purchasable

### Stance on current state

Hardware is in active development. Status labels:

- GAIA-R and GAIA-D: "Concept · in development"
- GAIA-S / GAIA-C / GAIA-E / GAIA-A: "Concept"

Never imply hardware is production-ready or commercially available before it is. When in doubt, say less.

## Cross-brand consistency

Both pages link to each other prominently. Cross-link copy should be neutral and informational, not aspirational:

- CropAutonomy → GAIAbots: "GAIAbots" (nav link), "GAIAbots.ai →" (footer)
- GAIAbots → CropAutonomy: "CropAutonomy" (nav link), "Visit CropAutonomy" (hero secondary CTA), "CropAutonomy.com →" (footer)

Never use marketing speak ("the perfect companion to", "the brain behind the bots") for the cross-link. The relationship is structural, not aspirational.

## Where voice is set in code

| Surface | Location |
|---|---|
| SEO title + description | `apps/{cropautonomy\|gaiabots}-web/app/layout.tsx` → `metadata` |
| Header CTA label | `app/layout.tsx` → `headerConfig.cta.label` |
| Footer tagline + copyright | `app/layout.tsx` → `footerConfig.tagline` / `.copyright` |
| Hero, section intros, card bodies | `apps/{...}-web/app/page.tsx` |
| Lead-form copy (submit, consent, message label, reassurance) | `LeadForm` props (`copy={...}`) at the call site |
| Lead-form placeholder text | `LeadForm` props (`placeholders={...}`) |

## Canonical brand briefs

The authoritative briefs live in the repo at:

- `docs/brand/cropautonomy-brand-brief.md`
- `docs/brand/gaiabots-brand-brief.md`
- `docs/brand/brand-and-design-system.md` (shared visual direction)

Update those when the brand direction itself evolves; update this file when the voice rules drift in practice and need re-codifying.
