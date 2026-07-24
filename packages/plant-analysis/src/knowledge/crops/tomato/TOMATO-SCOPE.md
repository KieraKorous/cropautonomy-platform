# Tomato — Initial Analysis Scope (PRD Phase 1)

**Crop:** Tomato (`Solanum lycopersicum`) · `cropId: "tomato"`
**Status:** Initial development scope. Several rules are **provisional** (sensible agronomic defaults pending source review) and are flagged as such so the UI can badge them.

This document is the paper deliverable for PRD Phase 1 ("Define the Initial Analysis Scope"). It fixes the vocabulary the rule engine (Phases 6–7) encodes. The machine-readable versions live alongside it in `profile.ts`, `stages.ts`, `rules.ts`, and `sources.ts`.

---

## 1. Supported growth stages

Canonical tomato set (the `GrowthStageKey` union in `types.ts`):

| key | label | order | typical age (days from transplant) |
|-----|-------|-------|-------------------------------------|
| `seedling` | Seedling | 1 | 0–21 |
| `vegetative` | Vegetative | 2 | 21–45 |
| `flowering` | Flowering | 3 | 40–65 |
| `fruiting` | Fruiting (green fruit set) | 4 | 60–90 |
| `ripening` | Ripening | 5 | 85–120 |
| `harvest` | Harvest | 6 | 110+ |

**Mapping to the Virtual Field's render enum** (`packages/virtual-field/src/crop.ts`, an 8-stage set `seed → sprout → juvenile → mature → flowering → fruiting → harvest → dead`) so the two never drift:

| tomato analysis stage | virtual-field render stage |
|-----------------------|----------------------------|
| seedling | sprout |
| vegetative | juvenile |
| flowering | flowering |
| fruiting | fruiting |
| ripening | fruiting (late) |
| harvest | harvest |

(`seed` and `dead` have no analysis stage; `mature` maps loosely to vegetative→flowering.)

---

## 2. Measurements

Reconciled against the `ObservationRecord` interface (PRD §13). "Required" = the observation form marks it required for a meaningful tomato analysis; everything else is optional.

**Required (all stages):**
- `leafColor` (free text / enum: deep-green, green, pale, yellow, purple)
- `wilting` (boolean)
- `soilMoisturePercent` (0–100)

**Optional:**
- `heightCm` (vegetative+), `temperatureC`, `humidityPercent`, `soilPh`, `soilTemperatureC`
- Symptom booleans: `leafSpots`, `yellowing`, `browning`, `curledLeaves`, `holesInLeaves`, `pestObserved`
- `flowerCount` (flowering+), `fruitCount` (fruiting+)
- `notes`

---

## 3. Initial rule set (12 rules)

Each row becomes an `AnalysisRuleRecord`. `penalty` is the health-point deduction subtracted from a 100 baseline. Thresholds are starting values; **cited** rules reference `sources.ts`, **provisional** rules are flagged pending review.

| # | id | measurement | operator | threshold | stage | severity | penalty | source |
|---|----|-------------|----------|-----------|-------|----------|---------|--------|
| R1 | `tomato-low-moisture` | soilMoisturePercent | lessThan | 45 | all | warning | 15 | cited (UC IPM irrigation) |
| R2 | `tomato-high-moisture` | soilMoisturePercent | greaterThan | 85 | all | warning | 10 | provisional |
| R3 | `tomato-low-temp` | temperatureC | lessThan | 10 | all | warning | 12 | cited (extension temp ranges) |
| R4 | `tomato-high-temp` | temperatureC | greaterThan | 32 | flowering, fruiting | warning | 15 | cited (pollen viability >32 °C) |
| R5 | `tomato-low-humidity` | humidityPercent | lessThan | 40 | all | info | 5 | provisional |
| R6 | `tomato-high-humidity` | humidityPercent | greaterThan | 85 | all | warning | 10 | provisional (disease pressure) |
| R7 | `tomato-yellowing` | yellowing | isTrue | — | all | warning | 15 | cited (N deficiency / chlorosis) |
| R8 | `tomato-browning` | browning | isTrue | — | all | warning | 15 | provisional |
| R9 | `tomato-wilting` | wilting | isTrue | — | all | critical | 20 | cited (water/vascular stress) |
| R10 | `tomato-leaf-spots` | leafSpots | isTrue | — | vegetative, flowering, fruiting | warning | 18 | cited (early/late blight ID) |
| R11 | `tomato-leaf-holes` | holesInLeaves | isTrue | — | all | warning | 12 | cited (chewing pest / hornworm) |
| R12 | `tomato-pest-present` | pestObserved | isTrue | — | all | warning | 15 | cited (IPM scouting) |

The PRD's §33 prototype (moisture 32 %, yellow leaves, temp 34 °C, wilting) trips R1, R7, R4-equivalent (if flowering/fruiting) or a general high-temp, and R9 — yielding a **Critical** status driven by the wilting finding, exactly as the prototype expects.

---

## 4. Responsible result language (PRD §10.9)

Findings use: *possible / potential cause / condition detected / outside expected range / needs inspection / additional information required / unable to determine from available data.* They must never assert a definitive diagnosis, cure, or death prediction.

---

## 5. Health scoring model (PRD §10.10)

- Start at **100**; subtract each triggered rule's `penalty`.
- Clamp to **[0, 100]**.
- Status: **≥ 80 Healthy · 60–79 Needs attention · < 60 Critical**; **insufficient-data** when the required measurements are absent.
- A **critical**-severity finding forces at least "Needs attention" and is surfaced prominently regardless of the numeric score (never averaged away).
