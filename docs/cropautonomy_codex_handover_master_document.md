# CropAutonomy / GaiaBots Master Handover

This document is the short-form handover for future AI coding agents, engineers, designers, and collaborators. For detailed guidance, start with [README.md](./README.md).

## Core Vision

CropAutonomy and GaiaBots are being built as a unified autonomous agricultural intelligence ecosystem.

CropAutonomy is the primary platform and portal for farms, agricultural businesses, agricultural groups, researchers, and field teams.

GaiaBots is the robotics and device brand for the ecosystem, beginning with the GAIA-R rover and GAIA-D drone families.

The long-term goal is not a generic SaaS dashboard. The goal is autonomous agricultural intelligence infrastructure that combines:

- AI crop analysis
- field and environmental intelligence
- multi-tenant farm operations
- device and fleet readiness
- robotics telemetry
- autonomous rover and drone workflows
- cloud and edge intelligence

## Immediate Goal

The first build goal is to launch landing pages for:

- `cropautonomy.com`
- `gaiabots.ai`

Both pages should be public, polished, mobile-friendly, and clear that the products are coming soon and under active development.

Both pages should support lead capture.

## Prototype Target

The project should target a working prototype by August 2026.

That prototype should demonstrate the foundation of the future platform:

- authenticated CropAutonomy portal
- multi-tenant organizations
- internal organization membership and roles
- farms and fields
- crop scan upload or capture
- queued AI analysis
- analysis results
- notifications
- analytics
- early device or telemetry concepts

## Brand Structure

### CropAutonomy

Domain: `cropautonomy.com`

Role:

- primary platform
- business and farm portal
- crop intelligence system
- future field operations dashboard
- long-term agriculture autonomy platform

### GaiaBots

Domain: `gaiabots.ai`

Role:

- robotics brand
- device family home
- upcoming hardware narrative
- future knowledge base for GAIA-R and GAIA-D

## Device Families

### GAIA-R

Ground rover platform for crop scanning, terrain traversal, sensor collection, localized inference, and future autonomous field routes.

### GAIA-D

Aerial drone platform for field scans, overhead crop intelligence, multispectral imaging, mapping, and large-area inspection.

### Future Concepts

- GAIA-S: stationary sensor node
- GAIA-C: command/control hub
- GAIA-E: edge AI compute unit
- GAIA-A: autonomous actuator system

These future concepts should stay flexible until hardware direction matures.

## Stack Direction

Use the following stack unless a later explicit architecture decision changes it:

- Next.js `16.2.6`
- pnpm for workspace and package management
- Tailwind CSS `4.3.0`
- DaisyUI `5.5.20`
- Clerk for authentication identity
- CropAutonomy-owned database tables for membership, organizations, roles, and permissions
- Supabase for Postgres, Storage, Realtime, and Edge Functions where appropriate
- pg-boss for background jobs
- Resend for email
- PostHog for analytics
- Fastify for lightweight Node backend/API services
- Python for image scanning, computer vision, and AI/model workflows
- Go for telemetry, device ingestion, concurrent workers, and performance-sensitive systems services
- GKE as the long-term platform hosting target
- Cloudflare as an acceptable low-cost landing-page hosting option

Do not use Supabase Auth.

Do not use Clerk embedded organization objects as the source of truth for platform membership.

Do not default to Express. Choose backend runtimes based on the best fit for each workload.

## Architecture Direction

Start with a monorepo, but keep applications separable.

Expected future shape:

```text
apps/
  cropautonomy-web/
  gaiabots-web/
  cropautonomy-portal/
packages/
  ui/
  config/
  db/
  auth/
  analytics/
  email/
  jobs/
  domain/
docs/
```

## Development Philosophy

Every major decision should be tested against these questions:

- Does this support field use?
- Does this support multi-tenant farm and business operations?
- Does this preserve future robotics integration?
- Does this support devices, telemetry, scans, and AI analysis?
- Does this avoid becoming generic SaaS?
- Does this move toward the August 2026 prototype?

## Required Detailed Docs

Future contributors should read:

- [Project Vision](./project-vision.md)
- [Product Roadmap](./product-roadmap.md)
- [Agent Engineering Guide](./agent-engineering-guide.md)
- [Architecture Overview](./architecture/architecture-overview.md)
- [Landing Pages PRD](./product/landing-pages-prd.md)
- [CropAutonomy Platform PRD](./product/cropautonomy-platform-prd.md)
- [GaiaBots Knowledge Base PRD](./product/gaiabots-knowledge-base-prd.md)
- [Brand and Design System](./brand/brand-and-design-system.md)
