import type { ReactNode } from "react";

export type StatCardProps = {
  label: string;
  value: string;
  meta?: string;
  delta?: { value: string; tone?: "success" | "warning" | "muted" };
  icon?: ReactNode;
  /** "default" = quiet card. "accent" = copper border to draw attention. Use sparingly (1 per row max). */
  tone?: "default" | "accent";
};

const deltaToneClass = {
  success: "text-success",
  warning: "text-warning",
  muted: "text-base-content/55"
} as const;

export function StatCard({
  label,
  value,
  meta,
  delta,
  icon,
  tone = "default"
}: StatCardProps) {
  const borderClass =
    tone === "accent" ? "border-accent/35" : "border-base-content/10";
  return (
    <article className={`flex flex-1 flex-col rounded-xl border bg-base-100 px-5 py-4 ${borderClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium text-base-content/60">{label}</span>
        {icon && (
          <span className={tone === "accent" ? "text-accent" : "text-primary/70"}>{icon}</span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="whitespace-nowrap text-3xl font-semibold leading-none tracking-tight text-neutral">
          {value}
        </span>
        {delta && (
          <span className={`whitespace-nowrap text-xs ${deltaToneClass[delta.tone ?? "success"]}`}>
            {delta.value}
          </span>
        )}
      </div>
      {meta && (
        <span className={`mt-1.5 text-xs ${tone === "accent" ? "text-accent" : "text-base-content/55"}`}>
          {meta}
        </span>
      )}
    </article>
  );
}
