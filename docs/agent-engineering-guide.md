# Agent Engineering Guide

This guide tells AI coding agents how to work in this project.

## Default Assumptions

- The repository should begin as a monorepo.
- The monorepo should be structured so applications can be separated later if needed.
- CropAutonomy and GaiaBots are distinct brands with shared platform DNA.
- CropAutonomy is the primary portal and platform.
- GaiaBots is the robotics hardware and knowledge-base brand.
- The first deliverable is two landing pages, but architecture decisions should support the August 2026 prototype.

## Required Stack Direction

Use these versions unless a later explicit decision updates them:

- Next.js `16.2.6`
- React version compatible with the chosen Next.js version
- pnpm for workspace and package management
- Tailwind CSS `4.3.0`
- DaisyUI `5.5.20`
- Clerk for authentication identity
- Internal application tables for organization and portal membership
- Supabase for Postgres, Storage, Realtime, and Edge Functions where appropriate
- pg-boss for queueing and background jobs
- Resend for email notifications
- PostHog for analytics and interaction instrumentation
- Fastify for lightweight Node API services where a standalone backend is appropriate
- Python for computer vision, image analysis, model orchestration, and AI workflows where the ecosystem fit is strongest
- Go for high-throughput, concurrent, telemetry, ingestion, device, or systems services where it is the best fit
- GKE as the long-term hosting target
- Cloudflare as an acceptable low-cost landing-page hosting option

## Implementation Posture

When building features:

- Prefer explicit domain models over generic CRUD.
- Model organizations, farms, fields, devices, scans, telemetry, analysis jobs, and memberships early.
- Keep public marketing pages separate from authenticated platform concerns.
- Avoid hard-coding assumptions that only one organization or farm exists.
- Do not use Supabase Auth unless a future project decision changes the auth strategy.
- Do not rely on Clerk embedded organization objects as the source of platform membership.
- Do not use Express by default. Choose backend technology based on workload fit, maintainability, runtime needs, and ecosystem strength.
- Make analytics intentional and privacy-conscious.
- Keep landing-page copy consistent with "coming soon" and "active development."

## Documentation Updates

Agents should update docs when they make decisions about:

- repo structure
- environment variables
- API boundaries
- database schema
- authentication and authorization
- deployment targets
- design tokens
- brand messaging
- device taxonomy
- background job behavior

## Design Posture

The UI should feel:

- industrial
- agricultural
- precise
- calm
- durable
- field-capable
- robotics-aware

Avoid:

- generic SaaS dashboards
- playful consumer app visuals
- excessive gradients
- decorative bloat
- claims that overstate current hardware readiness

## First-Build Priorities

1. Create the monorepo foundation.
2. Build `cropautonomy.com` landing page.
3. Build `gaiabots.ai` landing page.
4. Add lead capture to both Supabase-backed storage and Resend email notifications.
5. Add analytics.
6. Establish shared DaisyUI theming, brand rules, and design tokens.
7. Prepare the portal architecture for multi-tenant development.
