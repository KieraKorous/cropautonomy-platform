# Robotics and Edge Architecture

## Purpose

The project starts with landing pages and a web prototype, but it must remain pointed toward robotics. This document defines the early architecture posture for GAIA-R, GAIA-D, and future device systems.

## Device Families

### GAIA-R

Ground rover platform.

Responsibilities:

- field traversal
- crop image capture
- localized sensing
- scan route execution
- future edge inference
- telemetry reporting

### GAIA-D

Aerial drone platform.

Responsibilities:

- overhead imagery
- large field scans
- mapping support
- multispectral or NDVI workflows
- route or mission capture

## Future Device Families

- GAIA-S: stationary sensor node
- GAIA-C: command/control hub
- GAIA-E: edge AI compute unit
- GAIA-A: autonomous actuator system

These should remain flexible until hardware direction matures.

## Platform Concepts to Reserve Early

The platform should eventually model:

- devices
- device families
- device assignments
- device status
- telemetry events
- missions
- routes
- scan sessions
- sensor readings
- firmware versions
- connectivity state

## Edge Client Principles

Future edge clients should:

- capture data when offline
- sync when connectivity returns
- sign telemetry and upload requests
- avoid assuming constant network availability
- use durable local queues
- report health and diagnostic events
- publish events against logical channels and typed event schemas defined in `packages/realtime`, **not** against a transport-specific SDK (see [Realtime Strategy](./realtime-strategy.md)). A rover firmware that calls `supabase.channel(...)` directly is a firmware update away from a forced rewrite when the transport changes
- treat the realtime channel as the live view of state, and the durable telemetry POST as the source of truth — if the live channel is unreachable, the device still uploads, and the platform recovers the state from the durable record

## Field Capture as an Edge Client

The first edge client that exists today is **Field Capture** — an operator's phone running a capture session. It is the first concrete test of these principles:

- It publishes session lifecycle events (started, paused, resumed, completed) into `org.{orgId}.capture.{sessionId}.state`
- It opens a WebRTC peer for the live camera preview shown in the portal's Live page; signaling rides on `org.{orgId}.capture.{sessionId}.signal`
- Captured assets upload durably (resumable, offline-tolerant) and are the source of truth — the live preview is operator awareness, not the record

GAIA-R, GAIA-D, and future device families should adopt the same patterns. The device class is metadata; the contract is the same.

## Telemetry Principles

Telemetry has two layers, and they must not be conflated:

- **Durable telemetry** — append-first writes to Postgres (eventually a time-series-friendly table or external store). This is the record.
- **Live telemetry** — typed events published to realtime channels for operator dashboards. This is the live view.

The device emits both from the same logical event. The durable write must not depend on the live channel being reachable; the live channel must not be treated as a recoverable log.

Telemetry should be:

- timestamped
- append-first
- scoped to organization and device
- queryable by time range
- suitable for dashboards
- robust enough for intermittent connectivity
- published as typed events on logical channels (`org.{orgId}.device.{deviceId}.telemetry`) for the live view, via the abstraction in `packages/realtime`

## Prototype Recommendation

Before real hardware is ready, create simulated devices and telemetry.

Simulation can prove:

- device model shape
- telemetry ingestion
- dashboard behavior
- alerting flows
- background processing
- realtime updates

## Robotics Stack Candidates

Future robotics work may involve:

- ROS 2
- OpenCV
- NVIDIA Jetson
- Raspberry Pi
- depth cameras
- GPS
- LiDAR
- motor controllers
- local inference runtimes
- SLAM
- mission planning

These are candidates, not locked implementation choices.

