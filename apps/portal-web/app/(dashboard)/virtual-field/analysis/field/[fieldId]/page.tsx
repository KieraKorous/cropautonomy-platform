"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useEnsureSeeded, useField, usePlantsByField } from "@gaia/plant-analysis/react";
import { createPlant } from "@gaia/plant-analysis/database";
import { TOMATO_CROP_ID, TOMATO_STAGES } from "@gaia/plant-analysis/knowledge/tomato";
import type { GrowthStageKey, PlantRecord } from "@gaia/plant-analysis";

export default function FieldDetailPage() {
  const { fieldId } = useParams<{ fieldId: string }>();
  useEnsureSeeded();
  const field = useField(fieldId);
  const plants = usePlantsByField(fieldId);

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3 border-b border-base-content/10 pb-6">
        <Link
          href="/virtual-field/analysis"
          className="text-xs text-base-content/50 transition-colors hover:text-base-content/80"
        >
          ← Plant analysis
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral">
              {field ? field.name : "…"}
            </h1>
            {field?.location ? (
              <p className="text-sm text-base-content/65">{field.location}</p>
            ) : null}
          </div>
          {plants && plants.length > 0 ? (
            <span className="text-sm text-base-content/55">
              {plants.length} {plants.length === 1 ? "plant" : "plants"}
            </span>
          ) : null}
        </div>
      </header>

      {field ? (
        <PlantGrid rows={field.rows ?? 0} columns={field.columns ?? 0} plants={plants ?? []} />
      ) : null}

      <AddPlantForm fieldId={fieldId} rows={field?.rows} columns={field?.columns} />
    </div>
  );
}

function PlantGrid({
  rows,
  columns,
  plants
}: {
  rows: number;
  columns: number;
  plants: PlantRecord[];
}) {
  // Map "row:col" (1-indexed) → plant for O(1) cell lookup.
  const byCell = useMemo(() => {
    const m = new Map<string, PlantRecord>();
    for (const p of plants) {
      if (p.row && p.column) m.set(`${p.row}:${p.column}`, p);
    }
    return m;
  }, [plants]);

  const unplaced = plants.filter((p) => !p.row || !p.column);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <h2 className="text-base font-semibold text-neutral">Field layout</h2>
      {rows > 0 && columns > 0 ? (
        <div className="overflow-x-auto">
          <div
            className="grid w-fit gap-1.5"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(2.75rem, 1fr))` }}
          >
            {Array.from({ length: rows * columns }, (_, i) => {
              const row = Math.floor(i / columns) + 1;
              const col = (i % columns) + 1;
              const plant = byCell.get(`${row}:${col}`);
              return plant ? (
                <Link
                  key={i}
                  href={`/virtual-field/analysis/plant/${plant.id}`}
                  title={`${plant.name} (row ${row}, col ${col})`}
                  className="flex aspect-square items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary transition-colors hover:bg-primary/25"
                >
                  {plant.name.slice(0, 3)}
                </Link>
              ) : (
                <div
                  key={i}
                  title={`row ${row}, col ${col} — empty`}
                  className="flex aspect-square items-center justify-center rounded-md border border-base-content/10 bg-base-200/50 text-base-content/20"
                >
                  ·
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="text-sm text-base-content/50">
          This field has no grid size. Plants are listed below.
        </p>
      )}

      {unplaced.length > 0 ? (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-base-content/60">Unplaced plants</span>
          <div className="flex flex-wrap gap-2">
            {unplaced.map((p) => (
              <Link
                key={p.id}
                href={`/virtual-field/analysis/plant/${p.id}`}
                className="rounded-md border border-base-content/15 px-3 py-1.5 text-xs font-medium text-neutral transition-colors hover:border-primary/40"
              >
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function AddPlantForm({
  fieldId,
  rows,
  columns
}: {
  fieldId: string;
  rows?: number;
  columns?: number;
}) {
  const [name, setName] = useState("");
  const [row, setRow] = useState("");
  const [column, setColumn] = useState("");
  const [stage, setStage] = useState<GrowthStageKey>("seedling");
  const [plantedAt, setPlantedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    const rowNum = row ? Number(row) : undefined;
    const colNum = column ? Number(column) : undefined;
    if (rowNum && rows && (rowNum < 1 || rowNum > rows)) {
      setError(`Row must be between 1 and ${rows}.`);
      return;
    }
    if (colNum && columns && (colNum < 1 || colNum > columns)) {
      setError(`Column must be between 1 and ${columns}.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await createPlant({
        fieldId,
        cropProfileId: TOMATO_CROP_ID,
        name: name.trim(),
        row: rowNum,
        column: colNum,
        growthStageId: stage,
        plantedAt: plantedAt ? new Date(plantedAt).toISOString() : undefined,
        status: "active"
      });
      setName("");
      setRow("");
      setColumn("");
      setPlantedAt("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-neutral">Add plant</h2>
        <span className="rounded-full bg-base-content/5 px-2 py-0.5 text-[11px] text-base-content/55">
          Tomato
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tomato 001"
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Growth stage</span>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as GrowthStageKey)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          >
            {TOMATO_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Planted (optional)</span>
          <input
            type="date"
            value={plantedAt}
            onChange={(e) => setPlantedAt(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">
            Row{rows ? ` (1–${rows})` : ""}
          </span>
          <input
            type="number"
            min={1}
            max={rows}
            value={row}
            onChange={(e) => setRow(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">
            Column{columns ? ` (1–${columns})` : ""}
          </span>
          <input
            type="number"
            min={1}
            max={columns}
            value={column}
            onChange={(e) => setColumn(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
      </div>
      {error ? <p className="text-xs text-error">{error}</p> : null}
      <div>
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Add plant"}
        </button>
      </div>
    </form>
  );
}
