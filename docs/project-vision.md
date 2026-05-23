# Project Vision

CropAutonomy and GaiaBots form a unified autonomous agricultural intelligence ecosystem.

The ecosystem should evolve from public landing pages into a multi-tenant platform that can help farms, agricultural businesses, researchers, and field teams monitor crops, manage devices, analyze imagery, and eventually coordinate autonomous robotic systems.

## Core Positioning

CropAutonomy is the platform layer.

It is responsible for:

- farm and organization workspaces
- user and team management
- crop intelligence workflows
- AI-assisted image analysis
- environmental data
- field mapping
- telemetry ingestion
- fleet and device management
- operational dashboards
- notifications and alerts
- long-term agricultural intelligence

GaiaBots is the robotics and device layer.

It is responsible for:

- GAIA-R ground rover systems
- GAIA-D aerial drone systems
- device documentation
- hardware knowledge base content
- field deployment guidance
- future robotics families such as sensor stations, edge compute units, and control hubs

## What This Is Not

This project is not intended to become:

- a generic crop image upload app — Field Capture, when it ships, will be structured inspection tied to fields, zones, crops, and history, not a photo bucket
- a generic AI dashboard
- a commodity SaaS portal
- a marketing site disconnected from the product architecture
- a hardware brochure without real operational depth
- a vendor of "GAIA-U" / "GAIA-User" handheld devices — the user's phone is not part of the GAIA hardware lineup

The long-term direction is autonomous agricultural intelligence infrastructure. Field Capture is planned as the first vertical slice through that infrastructure — not the destination, and not yet built.

## Capture Inputs (planned)

As of 2026-05-23 nothing in this section has shipped. These are the capture sources the platform is being architected around:

- **Phone capture and bulk upload** (branded **Field Capture**) — imagery and short video from a grower, scout, or agronomist's existing phone
- **GAIA-D drone** imagery — aerial scans (in development)
- **GAIA-R rover** imagery and ground-level sensing (in development)
- **GAIA-S sensor station** environmental data (in development)
- future sensor packages and third-party device integrations

All of these inputs are designed to feed the same downstream pipeline: capture → asynchronous AI analysis → structured crop health report → notification, all linked to field, zone, and crop. The device or operator is metadata on the capture, not a separate product line.

**Field Capture is the first capture method on the build sequence**, because it does not depend on hardware readiness — operators already own phones. That makes it the first piece of the platform expected to land (as part of the Aug 2026 prototype). It is **not** the platform centerpiece — the centerpiece remains autonomous agricultural intelligence delivered by a coordinated GAIA device lineup — and as of 2026-05-23 it is **not yet built**. Until Field Capture ships, the only thing live on `cropautonomy.com` is the early-access lead form. Field Capture is also **not** a GAIA-letter device and does not get listed in the GAIA-{R,D,S,C,E,A} device taxonomy.

## Near-Term Goal

The immediate goal is to launch two credible landing pages:

- `cropautonomy.com`: coming soon, active development, lead capture, platform narrative. Headline framing is autonomous agricultural intelligence + the GAIA device lineup. Field Capture is referenced inside the roadmap/methods story as the first capture method being built — not as something operators can use today.
- `gaiabots.ai`: coming soon, upcoming hardware, GAIA-R and GAIA-D positioning, lead capture. Handheld / operator capture is referenced as one planned input channel into the platform, not a new device card.

These pages should establish trust, gather early interest, and create a public surface for the platform while deeper product development begins.

## Prototype Target

The project should target a working prototype by August 2026.

The August 2026 prototype is the **first end-to-end vertical slice** of the platform — Field Capture is the visible loop in that demo (phone → upload → AI analysis → report → notification), because it's the input method that can be built without waiting on hardware. The prototype should prove the architecture can support:

- multi-tenant organizations
- authenticated portal access
- crop capture workflows (phone capture + bulk upload as the v1 inputs)
- AI-generated crop health reports
- basic field, zone, and crop context linked to every capture
- notification workflows when analysis completes
- analytics instrumentation
- early device concepts or simulated telemetry — modeled so GAIA-R, GAIA-D, and other devices join the same pipeline later without re-architecting

## Product Principles

- Build for farms and field operations, not generic office workflows.
- Keep robotics integration in view even during web-only phases.
- Treat unreliable connectivity as a real constraint.
- Prefer modular services and clear boundaries.
- Design data models for organizations, farms, fields, devices, scans, analysis results, and telemetry from the beginning.
- Use polished but restrained industrial design.
- Make every landing page claim compatible with what the team can realistically prototype.

