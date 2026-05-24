# Product

## Register

product

## Users

Farm owners, crop managers, agronomists, field technicians, agricultural business operators, research teams, and organization administrators using the CropAutonomy portal as a daily operations console. Roles span owner, admin, manager, technician, and viewer. Users may belong to multiple organizations (farms, ag businesses, research groups) and switch between them. Operators are often outdoors, on phones, with gloves, in bright light, on intermittent connectivity. Office users are on desktops reviewing scans, managing fields, and triaging notifications.

## Product Purpose

`app.cropautonomy.com` is the authenticated operations console for the CropAutonomy platform. It is where organizations manage farms, fields, zones, crop scans (Field Capture in v1, GAIA device captures later), AI analysis output, notifications, memberships, and (eventually) device management. The portal must be multi-tenant from day one and treat real-time device and Field Capture activity as a first-class capability, not a bolted-on feature.

Success is operator trust: capture-to-insight latency, scan completion rate, and the operator's ability to glance at the screen and know the state of their fields without reading.

## Brand Personality

Industrial, agricultural, precise, calm. An operations console, not a marketing surface. The personality is closer to mission control telemetry, GIS dashboards, and field equipment HMIs than to a typical SaaS dashboard. Quiet by default, loud only when state demands attention. Confidence comes from accurate, current data and predictable interaction, not from visual flourish.

## Anti-references

- Generic SaaS dashboard aesthetics (Stripe-clone gradients, identical card grids, hero-metric templates)
- Playful consumer visuals or soft startup styling
- Neon gaming aesthetics
- Decorative gradients as identity
- Editorial / magazine-typographic aesthetics
- Modal-first interaction patterns (operators are mid-task; modals interrupt the loop)
- Side-stripe colored borders on alerts, cards, or list items
- Glassmorphism or blur as ornament
- Fake screenshots or placeholder data that imply unavailable functionality

## Design Principles

1. **Honest about what ships.** Empty states and "coming soon" markers over fabricated content. Capability surfaces appear only when the underlying service is real.
2. **Field-credible, not desk-credible.** Designed for operators outdoors and on mobile, not just for office users on 27-inch monitors. Touch targets, glare-tolerant contrast, one-handed reach considered.
3. **Tools, not theater.** Motion serves comprehension (state transitions, real-time updates) or it is absent. No dashboard candy.
4. **Multi-tenant by default.** Org context is always visible and switchable. No screen, query, or URL assumes a single farm or single org.
5. **Precision over polish.** Calm density. Real-time correctness over animated flourish. The operator should trust what they are reading.

## Accessibility & Inclusion

WCAG 2.2 AA. Honor `prefers-reduced-motion`. Never indicate state with color alone (use shape, label, or icon redundancy on severity, status, and connection indicators). Touch targets sized for gloved or one-handed phone use. Full keyboard navigation across every operator workflow, with visible focus states. Live regions used appropriately for real-time updates so screen readers are not overwhelmed by streaming changes.
