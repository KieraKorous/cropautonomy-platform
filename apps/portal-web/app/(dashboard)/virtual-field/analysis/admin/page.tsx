"use client";

import Link from "next/link";
import { useEnsureSeeded } from "@gaia/plant-analysis/react";
import { TOMATO_CROP_ID } from "@gaia/plant-analysis/knowledge/tomato";
import { CropSection } from "../_components/admin/CropSection";
import { RulesSection } from "../_components/admin/RulesSection";
import { SourcesSection } from "../_components/admin/SourcesSection";

// Admin knowledge editor (PRD Phase 12). Add/edit/toggle rules, sources, and the
// crop profile without touching code. Edits are versioned; disabled rules are not
// evaluated; each rule has an inline tester. All changes are local to this device.
export default function AnalysisAdminPage() {
  useEnsureSeeded();

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-3 border-b border-base-content/10 pb-6">
        <Link href="/virtual-field/analysis" className="text-xs text-base-content/50 transition-colors hover:text-base-content/80">
          ← Plant analysis
        </Link>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-neutral">Knowledge editor</h1>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent">Admin</span>
          </div>
          <p className="max-w-2xl text-sm leading-relaxed text-base-content/65">
            Edit the crop profile, analysis rules, and sources without changing code. Editing a rule
            bumps its version; past results keep the rule version they were computed with. Changes
            are stored on this device only.
          </p>
        </div>
      </header>

      <RulesSection cropId={TOMATO_CROP_ID} />
      <SourcesSection cropId={TOMATO_CROP_ID} />
      <CropSection cropId={TOMATO_CROP_ID} />
    </div>
  );
}
