# Dependency Policy

CropAutonomy's source code is licensed under **Apache 2.0** (see [`LICENSE`](../LICENSE)). Every dependency we add must be compatible with that license — meaning we must legally be able to ship Apache-2.0-licensed software that uses it.

This is not a stylistic preference. The wrong dependency choice can legally **force the entire platform open**, or worse, prevent us from deploying it commercially in the future. Every contributor — human or AI agent — must verify the license of a new dependency before adding it.

## ML Dependency Policy (load-bearing)

**Core ML components — every model, framework, weight file, training tool, inference library on the inference or training path — MUST be released under one of:**

- **Apache 2.0**
- **MIT**
- **BSD** (2-clause or 3-clause)
- **HPND** (Pillow's license; permissive)
- **CC-BY-4.0** for pretrained weights specifically (acceptable if the framework around them is permissive)

**Prohibited for core ML:**

- **AGPL-3.0** (Affero GPL) — triggers source-sharing for hosted SaaS. Ultralytics YOLOv5 / YOLOv8 / YOLO11 fall here.
- **GPL-3.0** / **GPL-2.0** — copyleft on distribution; incompatible with our Apache 2.0 release.
- **"Source-available but commercially restricted"** licenses (SSPL, BSL with commercial-use restrictions, Commons Clause, Elastic License v2).
- **"Research only"** or **"non-commercial"** licenses on pretrained weights (e.g. some Meta / Stability releases).
- Anything where the **terms can change retroactively** (e.g. unstable license over time).

When in doubt: **do not add it**. Open an issue first. The cost of a wrong dependency choice is much higher than the cost of waiting a day to confirm.

## Specific prohibitions (do not reintroduce)

| Component | License | Why excluded |
|---|---|---|
| **Ultralytics YOLOv5 / YOLOv8 / YOLO11** | AGPL-3.0 | Would force CropAutonomy to be AGPL or require paying for an Ultralytics commercial license. We use **RT-DETR** (Apache 2.0, comparable accuracy) instead. |
| **`super-gradients`** (Deci.AI / YOLO-NAS) | Apache 2.0 but YOLO-NAS weights are restricted | The framework is fine; specific pretrained checkpoints carry their own terms. Read each model card before using. |
| **`face_recognition`** | MIT but depends on dlib (boost) — fine, but watch transitively | OK as long as we don't bring in GPL transitive deps. |
| **Meta SAM v1** | Apache 2.0 ✓ | OK |
| **Meta SAM-2** | Apache 2.0 ✓ for code; check specific checkpoints | Generally OK. |

## Specific allowances

| Component | License | Notes |
|---|---|---|
| **RT-DETR** (`PekingU/rtdetr_r*` on Hugging Face) | Apache 2.0 | Current detection stage. |
| **Hugging Face `transformers`** | Apache 2.0 | Model loading + image preprocessing. |
| **PyTorch** | BSD-style | ML runtime. |
| **Pillow** | HPND (permissive) | Image decoding. |
| **MMDetection** | Apache 2.0 | Acceptable detector framework if we ever leave HF transformers. |
| **YOLOX** | Apache 2.0 | Acceptable CNN-based detector. |
| **DETR** (`facebook/detr-resnet-*`) | Apache 2.0 | Older but solid; safe fallback. |
| **PlantNet API** | PlantNet Terms of Service (not open-source) | External SaaS call, not a redistributed dependency. Acceptable to call as scaffolding; output is never ground truth (humans confirm). |

## Process for adding an ML dependency

1. **Check the LICENSE file** in the dependency's repository — not just the README, not just the model card.
2. **Check pretrained weight licenses separately.** A framework can be Apache 2.0 while specific checkpoints are restricted (super-gradients / YOLO-NAS is the textbook example).
3. **Check transitive ML dependencies.** A permissive wrapper around a GPL implementation is still GPL for redistribution purposes.
4. **Document it in `NOTICE`** with the repository URL, the specific component name + version, and the role it plays.
5. **If in doubt, ask before merging.** This is the single area where YAGNI does not apply.

## License Scope (repeated from LICENSE)

| Artifact | License |
|---|---|
| Source code (this repository) | **Apache 2.0** |
| Training data (captures, annotations, derived training_corpus) | **Proprietary** — tenant-owned raw; platform-owned anonymized derivatives gated by `organizations.training_corpus_opt_in` |
| Trained model weights produced by this platform | **Proprietary** |
| Third-party model weights (PlantNet, RT-DETR checkpoints, etc.) | Each per their own license — see [NOTICE](../NOTICE) |
| Brand assets (logos, wordmark, marketing copy, GAIA device names) | **All rights reserved** |
| Documentation in `docs/` | TBD (likely CC-BY-4.0); meanwhile, all rights reserved by default |

The structural rationale lives in the project memory `project_licensing` and `project_own_ml_pipeline` — the code is open so people can run their own; the trained intelligence layer (data + weights) is the platform's value.
