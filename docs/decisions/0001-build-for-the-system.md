# 0001 — Build for the system, not the MVP

- **Status:** Accepted
- **Decided:** 2026-05-25

## Context

The default engineering posture in early-stage projects is YAGNI: build the minimum, defer everything else. That posture is wrong for CropAutonomy.

The defensibility of this platform isn't any single shipped feature — it's the *system*. A labeled imagery corpus, a model registry, reproducibility, adjudication, evaluation, and consent governance compound over time. They have to be present from the first migration that touches the relevant domain or they don't exist later. Retrofitting governance and reproducibility onto live tenant data is painful and frequently impossible — the rows that were captured before the schema existed can't be reconstructed.

We are explicitly choosing the platform path described in [0003 — ML pipeline strategy](./0003-ml-phase2-strategy.md) and the broader vision of owning the ML pipeline + datastore rather than wrapping a vendor vision API.

## Decision

Default to building for the full system, not the immediate need, in these specific areas:

- **Data shape.** Schema migrations include reproducibility tables (`training_snapshots`, `training_runs`), evaluation tables (`eval_sets`, `model_evaluations`), governance tables (adjudications, consent flags) on the first migration that touches the domain — not "later when we need it."
- **ML and model infrastructure.** Build the real interface even if behind it is a pretrained model or vendor API. Don't ship stubs that have to be replaced.
- **Governance and consent.** Tenant-vs-platform data boundaries, opt-in flags, and anonymization pipelines get designed in before they're enforced.

## Consequences

- More upfront design work and more tables in the first migration than a vanilla MVP would have.
- Some tables stay nearly empty during the prototype phase — that's the cost, and it's smaller than the retrofit cost.
- We trade some velocity on early features for compounding velocity on the data/ML/governance surfaces that matter most.

## Alternatives considered

- **Pure YAGNI.** Rejected. The cost of retrofitting governance and reproducibility onto live tenant data is order-of-magnitude higher than the cost of designing them in from day one. The data we *didn't* capture is the data we'll wish we had.
- **Apply this discipline everywhere.** Rejected as too broad. UI features, copy, and glue code are still appropriately MVP-scoped. The discipline applies to **data shape, model/ML infrastructure, and governance/consent**.
