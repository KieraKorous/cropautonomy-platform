# Product Roadmap

This roadmap gives future agents and engineers a practical sequence for building from landing pages to a working autonomous agriculture prototype.

## Phase 0: Foundation and Brand

Target window: immediate.

Goals:

- Establish the monorepo structure.
- Create the first CropAutonomy and GaiaBots landing pages.
- Define brand guidance, visual language, and design tokens.
- Configure shared development conventions.
- Set up analytics for public-page behavior.
- Add lead capture flows.
- Prepare architecture docs for the platform prototype.

Exit criteria:

- `cropautonomy.com` landing page can be deployed.
- `gaiabots.ai` landing page can be deployed.
- Lead capture is wired to a reliable destination.
- Future agents can understand the architecture from docs without oral context.

## Phase 1: Platform Shell

Target window: before August 2026 prototype.

Goals:

- Build the authenticated CropAutonomy portal shell.
- Add organization and user management using Clerk identity and internal membership tables.
- Establish Supabase Postgres schema and storage buckets.
- Add base dashboard navigation.
- Add farm, field, and crop entities.
- Add PostHog analytics instrumentation.
- Add Resend transactional email paths.
- Add pg-boss for background work.

Exit criteria:

- Users can sign in.
- Users can belong to one or more organizations.
- Organizations can manage farms and fields.
- The app has a credible portal foundation.

## Phase 2: Crop Intelligence Prototype

Target window: August 2026 prototype.

Goals:

- Build image upload and camera capture flows.
- Store crop scan assets in Supabase Storage.
- Queue AI analysis jobs with pg-boss.
- Save analysis results in Postgres.
- Generate crop health reports.
- Notify users when analysis completes.
- Add early mobile/PWA behavior for field use.

Exit criteria:

- A user can capture or upload crop imagery.
- The system can process imagery asynchronously.
- The portal can display useful analysis results.
- The workflow works under realistic mobile constraints.

## Phase 3: GaiaBots Knowledge Base

Target window: after landing pages, before or alongside prototype.

Goals:

- Turn `gaiabots.ai` into the knowledge base for GAIA-R and GAIA-D.
- Publish device family pages.
- Add hardware roadmap pages.
- Add setup, safety, maintenance, telemetry, and field deployment documentation.
- Prepare docs for eventual device onboarding into CropAutonomy.

Exit criteria:

- GaiaBots clearly explains GAIA-R and GAIA-D.
- The site can grow into technical documentation without a redesign.
- CropAutonomy can link to GaiaBots device docs.

## Phase 4: Device and Telemetry Prototype

Target window: after August 2026 prototype.

Goals:

- Add device registry.
- Add simulated telemetry streams.
- Add device event ingestion API.
- Add field route and mission concepts.
- Explore GAIA-R hardware prototype interfaces.

Exit criteria:

- The platform can represent physical or simulated devices.
- Telemetry events can be ingested, stored, and viewed.
- Device concepts map cleanly to future robotics work.

## Phase 5: Autonomy Platform

Long-term direction.

Goals:

- Fleet coordination.
- Mission planning.
- Field mapping.
- Edge inference synchronization.
- Environmental forecasting.
- Autonomous route execution.
- Coordinated rover and drone workflows.

Exit criteria:

- CropAutonomy becomes a real operations platform for autonomous agricultural intelligence.
- GaiaBots becomes a real robotics product and knowledge system.

