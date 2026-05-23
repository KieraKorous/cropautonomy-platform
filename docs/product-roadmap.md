# Product Roadmap

This roadmap gives future agents and engineers a practical sequence for building from landing pages to a working autonomous agriculture prototype.

The long-term direction is **autonomous agricultural intelligence delivered through a coordinated GAIA device lineup** (rovers, drones, sensor stations, edge compute, actuators). Because devices take time to mature, the first capture method to be built is **Field Capture** — phone capture and bulk upload from operators' existing phones. Field Capture is the *first input method* on the build sequence, not the platform's product identity, and as of 2026-05-23 it is not yet built. Phases 0–2 build the multi-tenant platform foundation and exercise it end-to-end via Field Capture, which is the visible loop in the Aug 2026 prototype. Phase 4+ brings GAIA devices online into the same pipeline.

## Phase 0: Foundation and Brand

Target window: immediate.

Goals:

- Establish the monorepo structure.
- Create the first CropAutonomy and GaiaBots landing pages. `cropautonomy.com` leads with autonomous agricultural intelligence and the platform vision; Field Capture is presented inside the methods/features story as the input method available today. `gaiabots.ai` leads with the GAIA-R/D concepts.
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
- Establish Supabase Postgres schema and storage buckets. Capture storage is multi-source from the start — phone uploads, drone imagery, and rover imagery all write into the same `captures` surface.
- Add base dashboard navigation, including the **Live** surface (operator workspace for in-flight Field Capture sessions and, later, GAIA device streams).
- Stand up `packages/realtime` — the transport-abstracted channel/event layer described in [Realtime Strategy](./architecture/realtime-strategy.md). v0 transport is Supabase Realtime for state events; WebRTC for Field Capture media. Application code subscribes through the abstraction so the transport stays swappable.
- Add farm, field, zone, and crop entities — every capture must be linkable to these.
- Add PostHog analytics instrumentation.
- Add Resend transactional email paths.
- Add pg-boss for background work — the queue all capture analysis will run on. Workers publish progress events into Realtime so operators see live job feedback.

Exit criteria:

- Users can sign in.
- Users can belong to one or more organizations.
- Organizations can manage farms and fields.
- The app has a credible portal foundation that any capture source can plug into.
- The Live page renders with the same realtime contract that Phase 4 devices will plug into — no transport rework needed when GAIA devices arrive.

## Phase 2: Crop Intelligence Prototype (Field Capture as the first input)

Target window: August 2026 prototype.

The August 2026 prototype demonstrates the end-to-end capture → analysis → report loop. **Field Capture (phone capture + bulk upload) is the input method that ships in this phase**, because it does not depend on hardware readiness. The platform's other capture inputs (drone, rover, sensor) are modeled in the schema but arrive in Phase 4+.

Goals:

- Build phone-camera capture and bulk image/video upload flows — the Field Capture experience.
- Store capture assets in Supabase Storage, linked to field, zone, and crop. Schema accommodates non-phone capture sources from day one.
- Queue AI analysis jobs with pg-boss. Workers publish `scan.progress` and `scan.detection` events through `packages/realtime` so operators watch detections arrive live.
- Save analysis results in Postgres alongside the originating capture.
- Generate structured crop health reports — visible stress, suspected disease, nutrient concerns, stand counts where applicable, confidence scores.
- Notify users (Resend + in-app) when analysis completes.
- Add mobile/PWA behavior tuned for field use — offline queueing, dust/glare-tolerant UI, one-handed capture.
- Wire the Live page end-to-end: active Field Capture sessions appear there with a live WebRTC preview, position on the map, and current detection count. This is the visible payoff of the realtime architecture in the prototype demo.

Exit criteria:

- A user can capture or upload crop imagery from a phone in the field (the Field Capture flow).
- The system can process imagery asynchronously under realistic mobile/connectivity constraints.
- The portal can display useful, structured analysis results.
- The data model is shaped so future GAIA-R/D/S captures join the same `captures` surface without re-architecting.

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

Devices join the pipeline Field Capture already established. A rover-generated image and a phone-captured image should land in the same `captures` table, run the same analysis queue, and produce the same report shape — the device is metadata on the capture, not a parallel universe.

Goals:

- Add device registry.
- Add simulated telemetry streams.
- Add device event ingestion API.
- Add field route and mission concepts.
- Explore GAIA-R hardware prototype interfaces.
- Extend the Field Capture pipeline to accept device-originated captures with the same downstream flow.

Exit criteria:

- The platform can represent physical or simulated devices.
- Telemetry events can be ingested, stored, and viewed.
- Device captures and operator captures share storage, analysis, and reporting surfaces.
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

