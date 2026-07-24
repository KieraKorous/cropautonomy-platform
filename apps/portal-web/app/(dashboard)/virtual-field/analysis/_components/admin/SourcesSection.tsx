"use client";

import { useState } from "react";
import { useSources } from "@gaia/plant-analysis/react";
import { createSource, deleteSource, updateSource } from "@gaia/plant-analysis/database";
import type { SourceRecord } from "@gaia/plant-analysis";
import { inputClass } from "./fields";

export function SourcesSection({ cropId }: { cropId: string }) {
  const sources = useSources(cropId);
  const [editing, setEditing] = useState<SourceRecord | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-neutral">Sources</h2>
        {!creating && !editing ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90"
          >
            New source
          </button>
        ) : null}
      </div>

      {creating ? <SourceForm cropId={cropId} onDone={() => setCreating(false)} /> : null}

      {sources === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : sources.length === 0 ? (
        <p className="text-sm text-base-content/60">No sources yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-base-content/8">
          {sources.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 py-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-neutral">{s.title}</span>
                  {s.organization ? <span className="text-xs text-base-content/50">{s.organization}</span> : null}
                  {s.url ? <span className="truncate text-xs text-base-content/45">{s.url}</span> : null}
                </div>
                <div className="flex flex-shrink-0 items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setEditing(editing?.id === s.id ? null : s)}
                    className="rounded-md border border-base-content/15 px-2.5 py-1 font-semibold text-neutral hover:bg-base-content/[0.05]"
                  >
                    {editing?.id === s.id ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void deleteSource(s.id)}
                    className="rounded-md border border-base-content/15 px-2.5 py-1 font-semibold text-neutral hover:bg-base-content/[0.05]"
                  >
                    Delete
                  </button>
                </div>
              </div>
              {editing?.id === s.id ? (
                <SourceForm cropId={cropId} source={s} onDone={() => setEditing(null)} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SourceForm({ cropId, source, onDone }: { cropId: string; source?: SourceRecord; onDone: () => void }) {
  const [title, setTitle] = useState(source?.title ?? "");
  const [organization, setOrganization] = useState(source?.organization ?? "");
  const [url, setUrl] = useState(source?.url ?? "");
  const [notes, setNotes] = useState(source?.notes ?? "");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      const patch = {
        title: title.trim(),
        organization: organization.trim() || undefined,
        url: url.trim() || undefined,
        notes: notes.trim() || undefined
      };
      if (source) await updateSource(source.id, patch);
      else await createSource(cropId, patch);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-lg border border-base-content/10 bg-base-200/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className={inputClass} />
        <input value={organization} onChange={(e) => setOrganization(e.target.value)} placeholder="Organization" className={inputClass} />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL" className={inputClass} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={!title.trim() || busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-50">
          {busy ? "Saving…" : source ? "Save" : "Create"}
        </button>
        <button type="button" onClick={onDone} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05]">
          Cancel
        </button>
      </div>
    </form>
  );
}
