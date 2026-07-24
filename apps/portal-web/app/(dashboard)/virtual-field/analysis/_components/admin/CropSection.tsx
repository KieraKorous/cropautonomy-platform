"use client";

import { useState } from "react";
import { useCropProfile, useGrowthStages } from "@gaia/plant-analysis/react";
import { updateCropProfile } from "@gaia/plant-analysis/database";
import { inputClass } from "./fields";

// Crop profile (name/description) + a read view of growth stages. Stages rarely
// change; full stage CRUD is available in the repo (createGrowthStage etc.) but
// kept out of the UI here to stay focused on the common admin task: rules.

export function CropSection({ cropId }: { cropId: string }) {
  const profile = useCropProfile(cropId);
  const stages = useGrowthStages(cropId);
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await updateCropProfile(cropId, { description: description.trim() || undefined });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-base-content/10 bg-base-100 p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold text-neutral">Crop profile</h2>
          {profile ? <span className="text-xs text-base-content/50">{profile.commonName} · v{profile.version}</span> : null}
        </div>
        {profile && !editing ? (
          <button
            type="button"
            onClick={() => {
              setDescription(profile.description ?? "");
              setEditing(true);
            }}
            className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05]"
          >
            Edit
          </button>
        ) : null}
      </div>

      {profile === undefined ? (
        <p className="text-sm text-base-content/50">Loading…</p>
      ) : editing ? (
        <form onSubmit={save} className="flex flex-col gap-3">
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputClass} />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:bg-primary/90 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-md border border-base-content/15 px-4 py-2 text-sm font-semibold text-neutral hover:bg-base-content/[0.05]">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-base-content/70">{profile?.description ?? "No description."}</p>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-base-content/70">Growth stages</span>
        <div className="flex flex-wrap gap-2">
          {(stages ?? []).map((s) => (
            <span key={s.id} className="rounded-md border border-base-content/10 px-2.5 py-1 text-xs text-neutral">
              {s.order}. {s.name}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
