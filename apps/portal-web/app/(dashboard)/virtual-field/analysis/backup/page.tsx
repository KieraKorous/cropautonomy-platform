"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useFields } from "@gaia/plant-analysis/react";
import { deleteAllData } from "@gaia/plant-analysis/database";
import {
  exportAll,
  exportField,
  importBackup,
  validateBackup,
  type BackupEnvelope,
  type ImportSummary
} from "@gaia/plant-analysis/backup";

function download(envelope: BackupEnvelope, name: string) {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function BackupPage() {
  const fields = useFields();
  const [includeImages, setIncludeImages] = useState(true);
  const [selectedField, setSelectedField] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<
    { kind: "ok"; summary: ImportSummary } | { kind: "error"; errors: string[] } | null
  >(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function onExportAll() {
    setBusy(true);
    try {
      download(await exportAll({ includeImages }), `plant-analysis-all-${stamp()}.json`);
    } finally {
      setBusy(false);
    }
  }

  async function onExportField() {
    if (!selectedField) return;
    setBusy(true);
    try {
      download(
        await exportField(selectedField, { includeImages }),
        `plant-analysis-field-${stamp()}.json`
      );
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setImportState(null);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        setImportState({ kind: "error", errors: ["That file isn't valid JSON."] });
        return;
      }
      const validation = validateBackup(parsed);
      if (!validation.ok || !validation.envelope) {
        setImportState({ kind: "error", errors: validation.errors });
        return;
      }
      const summary = await importBackup(validation.envelope);
      setImportState({ kind: "ok", summary });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function onDeleteAll() {
    setBusy(true);
    try {
      await deleteAllData();
      setConfirmDelete(false);
      setImportState(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3 border-b border-base-content/10 pb-6">
        <Link href="/virtual-field/analysis" className="text-xs text-base-content/50 transition-colors hover:text-base-content/80">
          ← Plant analysis
        </Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral">Backup & restore</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Your data lives in this browser on this device. Clearing browsing data removes it — export
            a backup to keep it safe or move it to another device.
          </p>
        </div>
      </header>

      <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
        <h2 className="text-base font-semibold text-neutral">Export</h2>
        <label className="flex items-center gap-2 text-sm text-neutral">
          <input type="checkbox" checked={includeImages} onChange={(e) => setIncludeImages(e.target.checked)} className="h-4 w-4 accent-primary" />
          Include photos (larger file)
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <button type="button" onClick={() => void onExportAll()} disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-50">
            Export everything
          </button>
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-base-content/70">Or export one field</span>
              <select value={selectedField} onChange={(e) => setSelectedField(e.target.value)} className="rounded-md border border-base-content/15 bg-base-100 px-3 py-2 text-sm outline-none focus:border-primary/50">
                <option value="">Choose a field…</option>
                {(fields ?? []).map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void onExportField()} disabled={busy || !selectedField} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05] disabled:opacity-50">
              Export field
            </button>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
        <h2 className="text-base font-semibold text-neutral">Restore</h2>
        <p className="text-sm text-base-content/65">
          Import a backup file. Existing records with the same id are updated, not duplicated.
        </p>
        <div>
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05] disabled:opacity-50">
            {busy ? "Working…" : "Choose backup file"}
          </button>
          <input ref={inputRef} type="file" accept="application/json,.json" hidden onChange={(e) => void onImportFile(e.target.files?.[0])} />
        </div>
        {importState?.kind === "ok" ? (
          <p className="text-sm text-success">
            Restored — {importState.summary.added} added, {importState.summary.updated} updated.
          </p>
        ) : null}
        {importState?.kind === "error" ? (
          <div className="flex flex-col gap-1 text-sm text-error">
            <span>Couldn&apos;t import that file:</span>
            <ul className="list-inside list-disc text-xs">
              {importState.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-3 rounded-xl border border-error/20 bg-base-100 p-6">
        <h2 className="text-base font-semibold text-neutral">Delete all local data</h2>
        <p className="max-w-2xl text-sm text-base-content/65">
          Permanently removes every field, plant, observation, result, and photo on this device. This
          can&apos;t be undone — export a backup first if you might want it back.
        </p>
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => void onDeleteAll()} disabled={busy} className="rounded-md bg-error px-4 py-2 text-sm font-semibold text-error-content hover:bg-error/90 disabled:opacity-50">
              Yes, delete everything
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05]">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="self-start rounded-md border border-error/40 px-4 py-2 text-sm font-semibold text-error hover:bg-error/10">
            Delete all data
          </button>
        )}
      </section>
    </div>
  );
}
