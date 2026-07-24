# Decision Records

Project-level decisions that shape how we build CropAutonomy / GaiaBots. These are point-in-time records of *why* we chose a path, with enough context to revisit later. They sit alongside `docs/architecture/` (which describes *what* the system is) — an ADR captures the reasoning that's otherwise easy to lose.

Use these when:

- A choice was non-obvious or had a real alternative.
- Future contributors will reasonably ask "why isn't this done the standard way?"
- The decision constrains how unrelated features should be built.

Don't use these for:

- Implementation notes that belong next to the code.
- Decisions already fully expressed in `CLAUDE.md` or an architecture doc.
- Ephemeral task plans.

## Index

- [0001 — Build for the system, not the MVP](./0001-build-for-the-system.md)
- [0002 — GKE co-tenancy in agconn-prod for v0](./0002-gke-cotenancy-v0.md)
- [0003 — ML pipeline strategy for the August 2026 prototype](./0003-ml-phase2-strategy.md)
- [0004 — Portal design extends the landing register](./0004-portal-design-register.md)
- [0005 — Local, rule-based plant analysis alongside the server AI pipeline](./0005-local-rule-based-plant-analysis.md)

## ADR Format

Each file follows:

```
# NNNN — Title

- **Status:** Accepted | Superseded by [NNNN] | Deprecated
- **Decided:** YYYY-MM-DD

## Context
What forced the decision.

## Decision
What we picked, in the imperative.

## Consequences
What this costs us, what it buys us, what it constrains downstream.

## Alternatives considered
What we rejected and why.
```
