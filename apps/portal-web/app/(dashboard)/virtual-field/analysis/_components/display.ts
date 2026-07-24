import type { AnalysisStatus, Severity } from "@gaia/plant-analysis";

// Calm, editorial severity/status treatment (ADR 0004): a small dot + a text
// label, never a big colored pill. Color never carries meaning alone — the label
// always accompanies it (accessibility, PRD §20).

export const STATUS_DISPLAY: Record<AnalysisStatus, { label: string; dot: string }> = {
  healthy: { label: "Healthy", dot: "bg-success" },
  attention: { label: "Needs attention", dot: "bg-warning" },
  critical: { label: "Critical", dot: "bg-error" },
  "insufficient-data": { label: "Insufficient data", dot: "bg-base-content/30" }
};

export const SEVERITY_DISPLAY: Record<Severity, { label: string; dot: string }> = {
  info: { label: "Information", dot: "bg-base-content/40" },
  warning: { label: "Warning", dot: "bg-warning" },
  critical: { label: "Critical", dot: "bg-error" }
};

// Severity ordering for critical-first display (the findings repository already
// sorts, but UI slices sometimes re-sort).
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
