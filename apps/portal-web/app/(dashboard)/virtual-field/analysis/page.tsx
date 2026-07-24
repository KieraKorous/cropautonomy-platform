"use client";

import Link from "next/link";
import { useState } from "react";
import { useFields } from "@gaia/plant-analysis/react";
import { createField } from "@gaia/plant-analysis/database";

// Rule-Based Plant Analysis — home surface. Lists the local (browser/IndexedDB)
// analysis fields and creates new ones. This is a separate data world from the
// org's PostGIS /fields; see docs/decisions/0005. Client-only: all data lives in
// Dexie and is read through live-query hooks.

export default function AnalysisHomePage() {
  const fields = useFields();

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-end justify-between gap-6 border-b border-base-content/10 pb-6">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral">Plant analysis</h1>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">
              Experimental
            </span>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Track plants in a virtual field, record observations, and get explainable, rule-based
            health results. Everything is stored on this device — no AI service, no upload.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {fields && fields.length > 0 ? (
            <span className="text-sm text-base-content/55">
              {fields.length} {fields.length === 1 ? "field" : "fields"}
            </span>
          ) : null}
          <Link
            href="/virtual-field/analysis/backup"
            className="rounded-md border border-base-content/15 px-3.5 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
          >
            Backup
          </Link>
          <Link
            href="/virtual-field/analysis/admin"
            className="rounded-md border border-base-content/15 px-3.5 py-2 text-sm font-semibold text-neutral transition-colors hover:bg-base-content/[0.05]"
          >
            Knowledge editor
          </Link>
        </div>
      </header>

      <NewFieldForm />

      {fields === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : fields.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <li key={f.id}>
              <Link
                href={`/virtual-field/analysis/field/${f.id}`}
                className="flex h-full flex-col gap-2 rounded-xl border border-base-content/10 bg-base-100 p-6 transition-colors hover:border-primary/40"
              >
                <span className="text-base font-semibold text-neutral">{f.name}</span>
                {f.location ? (
                  <span className="text-xs text-base-content/55">{f.location}</span>
                ) : null}
                <span className="mt-auto text-xs text-base-content/45">
                  {(f.rows ?? 0) * (f.columns ?? 0) > 0
                    ? `${f.rows} × ${f.columns} grid`
                    : "No grid size set"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewFieldForm() {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [rows, setRows] = useState("4");
  const [columns, setColumns] = useState("4");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    try {
      await createField({
        name: name.trim(),
        location: location.trim() || undefined,
        rows: Number(rows) || undefined,
        columns: Number(columns) || undefined
      });
      setName("");
      setLocation("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6"
    >
      <h2 className="text-base font-semibold text-neutral">New field</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Prototype Field"
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Location (optional)</span>
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Greenhouse 2"
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Rows</span>
          <input
            type="number"
            min={1}
            value={rows}
            onChange={(e) => setRows(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-base-content/70">Columns</span>
          <input
            type="number"
            min={1}
            value={columns}
            onChange={(e) => setColumns(e.target.value)}
            className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </label>
      </div>
      <div>
        <button
          type="submit"
          disabled={!name.trim() || busy}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create field"}
        </button>
      </div>
    </form>
  );
}

function EmptyState() {
  return (
    <section className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-base-content/20 bg-base-100 px-6 py-8">
      <h2 className="text-base font-semibold text-neutral">No fields yet.</h2>
      <p className="max-w-xl text-sm text-base-content/65">
        Create your first field above, then add plants to it and start recording observations.
      </p>
    </section>
  );
}
