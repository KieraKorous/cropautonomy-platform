# Deployment Strategy

## Direction

Use GKE as the long-term hosting target for the full platform. Use Cloudflare as a practical low-cost option for public landing pages while the platform is under development.

## Landing Pages

The landing pages should be deployable independently from the authenticated portal.

Possible approach:

- host public pages on Cloudflare during early phases
- keep pages static or mostly static when possible
- use server actions or API endpoints only where lead capture requires them
- route lead capture to a durable backend path

## Platform

The authenticated CropAutonomy portal should be designed for eventual deployment to GKE.

GKE is appropriate for:

- queue workers
- API services
- long-running jobs
- telemetry ingestion
- future robotics integrations
- controlled platform infrastructure

## Environment Separation

Plan for:

- local
- preview
- staging
- production

Each environment should have explicit environment variables and service configuration.

## Required Services

Expected services:

- Next.js web apps
- Postgres through Supabase
- Supabase Storage
- pg-boss workers
- Resend
- PostHog
- Clerk
- future AI provider or model service
- future telemetry ingestion service

## Deployment Principles

- Landing pages should stay cheap and fast.
- Platform services should be built with observability and scaling in mind.
- Workers should be deployable separately from web apps.
- Secrets should never be committed.
- Deployment docs should be updated as soon as real infrastructure is chosen.

