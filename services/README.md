# Services

This folder is reserved for standalone backend services as the platform grows.

Planned runtime fit:

- `api/`: Fastify services for lightweight APIs where Next route handlers are not the right boundary.
- `vision/`: Python services for image scanning, model orchestration, and computer vision workflows.
- `telemetry/`: Go services for device ingestion, telemetry, and high-concurrency systems work.

Do not add Express services by default. Choose the runtime that best fits the workload.
