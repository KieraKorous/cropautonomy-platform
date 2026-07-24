"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useImagesByPlant } from "@gaia/plant-analysis/react";
import { deleteImage, saveImage, setImageAnalysis } from "@gaia/plant-analysis/database";
import { analyzePlantColors, compressImage } from "@gaia/plant-analysis/image-processing";
import type { ImageRecord, PlantColorAnalysis } from "@gaia/plant-analysis";

// Phase 10 (image management) + Phase 11 (non-AI color analysis). Photos are
// compressed before they hit IndexedDB, shown in a gallery, and can be color-
// analyzed on demand. Everything is local to this device. Color analysis is
// supporting evidence only — never a diagnosis (PRD §10.17).

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

export function PlantImageGallery({ plantId }: { plantId: string }) {
  const images = useImagesByPlant(plantId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storagePct, setStoragePct] = useState<number | null>(null);

  async function refreshStorage() {
    if (!navigator.storage?.estimate) return;
    const { usage, quota } = await navigator.storage.estimate();
    if (usage != null && quota) setStoragePct(Math.round((usage / quota) * 100));
  }

  useEffect(() => {
    void refreshStorage();
  }, [images?.length]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const { blob, width, height } = await compressImage(file);
        await saveImage(
          {
            plantId,
            mimeType: blob.type,
            width,
            height,
            capturedAt: new Date(file.lastModified || Date.now()).toISOString()
          },
          blob
        );
      }
    } catch (e) {
      setError(
        isQuotaError(e)
          ? "This device's storage is full — delete some images to free space."
          : "Couldn't process that image. Try a different file."
      );
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral">Photos</h2>
        <div className="flex items-center gap-3">
          {storagePct != null ? (
            <span
              className={`text-xs ${storagePct >= 80 ? "text-warning" : "text-base-content/45"}`}
            >
              {storagePct}% of device storage used
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {busy ? "Adding…" : "Add photo"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void onFiles(e.target.files)}
          />
        </div>
      </div>

      {error ? <p className="text-xs text-error">{error}</p> : null}

      {images === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : images.length === 0 ? (
        <p className="text-sm text-base-content/60">
          No photos yet. Add a photo from your camera or device — it's compressed and stored on this
          device only.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <li key={img.id}>
              <ImageTile image={img} onDelete={() => void deleteImage(img.id)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ImageTile({ image, onDelete }: { image: ImageRecord; onDelete: () => void }) {
  const url = useMemo(() => URL.createObjectURL(image.blob), [image.blob]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const [analyzing, setAnalyzing] = useState(false);

  async function analyze() {
    setAnalyzing(true);
    try {
      const result = await analyzePlantColors(image.blob);
      await setImageAnalysis(image.id, result);
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-base-content/10 p-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Plant photo${image.capturedAt ? ` from ${new Date(image.capturedAt).toLocaleDateString()}` : ""}`}
        className="aspect-square w-full rounded-md object-cover"
      />
      <div className="flex items-center justify-between gap-2 text-xs text-base-content/50">
        <span>{image.capturedAt ? new Date(image.capturedAt).toLocaleDateString() : "—"}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void analyze()}
            disabled={analyzing}
            className="rounded-md border border-base-content/15 px-2 py-1 font-semibold text-neutral transition-colors hover:bg-base-content/[0.05] disabled:opacity-50"
          >
            {analyzing ? "Analyzing…" : image.analysis ? "Re-analyze" : "Analyze colors"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-md border border-base-content/15 px-2 py-1 font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
          >
            Delete
          </button>
        </div>
      </div>
      {image.analysis ? <ColorAnalysis analysis={image.analysis} /> : null}
    </div>
  );
}

const COLOR_BANDS: { key: keyof PlantColorAnalysis; label: string; swatch: string }[] = [
  { key: "greenPercent", label: "Green", swatch: "rgb(63,125,78)" },
  { key: "yellowPercent", label: "Yellow", swatch: "rgb(201,162,39)" },
  { key: "brownPercent", label: "Brown", swatch: "rgb(122,82,48)" },
  { key: "otherPercent", label: "Other", swatch: "rgb(203,197,186)" }
];

function ColorAnalysis({ analysis }: { analysis: PlantColorAnalysis }) {
  return (
    <div className="flex flex-col gap-2 border-t border-base-content/10 pt-2">
      <div className="flex h-2 w-full overflow-hidden rounded-full">
        {COLOR_BANDS.map((b) => (
          <div
            key={b.key}
            style={{ width: `${analysis[b.key]}%`, backgroundColor: b.swatch }}
            title={`${b.label} ${analysis[b.key]}%`}
          />
        ))}
      </div>
      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        {COLOR_BANDS.map((b) => (
          <div key={b.key} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: b.swatch }} aria-hidden />
            <dt className="text-base-content/55">{b.label}</dt>
            <dd className="font-medium text-neutral">{analysis[b.key]}%</dd>
          </div>
        ))}
      </dl>
      <p className="text-[11px] text-base-content/45">
        Canopy coverage ≈ {analysis.vegetationCoveragePercent}%. Rough color measurement only — not a
        diagnosis. Lighting and background affect the result.
      </p>
    </div>
  );
}
