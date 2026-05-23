# Landing Pages PRD

## Purpose

Create credible first public surfaces for CropAutonomy and GaiaBots while the larger platform is under active development.

The landing pages should collect early interest, communicate the product direction, and establish the brand system that future portal and knowledge-base work can build on.

## Domains

- `cropautonomy.com`
- `gaiabots.ai`

## Shared Requirements

Both landing pages must:

- communicate that the product is coming soon and under active development
- collect leads
- support early access or interest forms
- instrument key events in PostHog
- work well on mobile
- load quickly
- look polished without implying a finished production platform
- share a design system while preserving brand distinction

## CropAutonomy Landing Page

Primary message:

CropAutonomy is an autonomous agricultural intelligence platform for farms, agricultural businesses, and field teams. The long-term centerpiece is the GAIA device lineup (rovers, drones, sensors, edge compute). **Field Capture** — phone capture and bulk upload — is the first capture method on the build sequence and the visible loop being built for the Aug 2026 prototype. Field Capture is not yet available; the landing collects early-access interest only.

Audience:

- farms
- growers
- agricultural businesses
- agricultural groups
- research institutions
- precision agriculture teams
- early partners

Content priorities:

- coming soon / active development (whole platform, including Field Capture)
- autonomous agricultural intelligence as the headline identity
- the GAIA device lineup as the long-term centerpiece
- the planned capture pipeline that takes in multiple sources (phone, drone, rover, sensor), all feeding the same downstream analysis
- **Field Capture** as the first capture method being built — name it, but do **not** describe it in present tense ("scout fields with your phone today") and do **not** treat it as a centerpiece or H1. It earns a mention inside the features/methods and roadmap sections.
- AI crop analysis and environmental insight (planned)
- August 2026 prototype target — the first end-to-end demo, with Field Capture as the visible loop
- early access lead capture

Hard NOs for CropAutonomy copy:

- do not write "Field Capture lets your team scout fields today" or any present-tense functional claim
- do not write "the camera in your pocket is the product" or any mobile-first framing
- do not contrast Field Capture as "available" against GAIA-R/D as "coming" — both are in development; Field Capture is just earlier in the sequence
- do not introduce a "GAIA-U" or "GAIA-User" device naming for phone capture

Calls to action:

- request early access
- follow development
- contact for partnership

## GaiaBots Landing Page

Primary message:

GaiaBots is developing GAIA-R and GAIA-D, upcoming autonomous robotics systems for agricultural intelligence.

Audience:

- agricultural operators interested in robotics
- technical collaborators
- research partners
- hardware and robotics communities
- early adopters

Content priorities:

- upcoming hardware
- GAIA-R rover concept
- GAIA-D drone concept
- connection to CropAutonomy
- future knowledge base direction
- active development status
- August 2026 prototype target where appropriate

Calls to action:

- follow hardware development
- request updates
- contact for collaboration

## Lead Capture

Lead capture should write to durable storage and send email notifications through Resend.

Lead capture should initially support:

- name
- email
- organization
- role or interest category
- optional message
- consent to receive updates
- source domain

Potential interest categories:

- farm or grower
- agricultural business
- research institution
- robotics collaborator
- investor or partner
- technical contributor
- other

## Analytics Events

Track at minimum:

- page viewed
- primary CTA clicked
- secondary CTA clicked
- lead form started
- lead form submitted
- lead form failed
- outbound link clicked

## Non-Goals

The first landing pages should not include:

- full authentication
- public pricing
- a complete docs system
- fake product screenshots that imply completed functionality
- claims of deployed autonomous hardware

## Acceptance Criteria

- Both pages are visually coherent and production-presentable.
- Both pages clearly say coming soon or active development.
- Both pages support lead capture.
- Both pages are responsive.
- Both pages can be deployed independently if needed.
- The design foundation can evolve into portal and knowledge-base interfaces.
