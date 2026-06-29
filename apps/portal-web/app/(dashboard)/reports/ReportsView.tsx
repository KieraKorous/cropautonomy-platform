"use client";

import { BrainIcon, CameraIcon, FarmIcon, StatCard } from "@gaia/ui";
import { useMemo, useState } from "react";

import type { CaptureSummary } from "../../../lib/api";
import {
  analyzedCount,
  capturesPerBucket,
  distinctSpecies,
  inWindow,
  rollupSpecies,
  windowFor,
  RANGES,
  type ChartBucket,
  type Range,
  type SpeciesRow
} from "./reportMetrics";

interface ReportsViewProps {
  captures: CaptureSummary[];
}

// The interactive analytics view: one range toggle re-windows everything below
// it from the in-memory capture batch the server fetched. No re-fetch on toggle.
export function ReportsView({ captures }: ReportsViewProps) {
  const [range, setRange] = useState<Range>("7d");

  const model = useMemo(() => {
    const current = inWindow(captures, windowFor(range));
    return {
      current,
      speciesIdentified: distinctSpecies(current),
      analyzed: analyzedCount(current),
      buckets: capturesPerBucket(current, range),
      speciesRows: rollupSpecies(current)
    };
  }, [range, captures]);

  const periodLabel = RANGES.find((r) => r.key === range)?.label ?? "";

  return (
    <div className="flex flex-col gap-7">
      {/* Range control + print export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RangeToggle range={range} onChange={setRange} />
        <a
          className="flex items-center gap-1.5 rounded-md border border-base-content/15 px-3 py-2 text-sm font-medium text-neutral hover:bg-base-content/[0.04]"
          href="/reports/weekly"
        >
          <svg
            fill="none"
            height="14"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
            viewBox="0 0 24 24"
            width="14"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          Export weekly
        </a>
      </div>

      {/* KPIs */}
      <div className="grid gap-3.5 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          icon={<CameraIcon size={16} />}
          label="Captures"
          meta={`Uploaded in the last ${periodLabel}`}
          value={model.current.length.toLocaleString("en-US")}
        />
        <StatCard
          icon={<FarmIcon size={16} />}
          label="Species identified"
          meta="Distinct plants the analysis named"
          value={model.speciesIdentified.toLocaleString("en-US")}
        />
        <StatCard
          icon={<BrainIcon size={16} />}
          label="Analyzed"
          meta={`Of ${model.current.length.toLocaleString("en-US")} captures`}
          value={model.analyzed.toLocaleString("en-US")}
        />
      </div>

      {/* Captures over time */}
      <Panel title="Captures over time" subtitle={`Captures uploaded in the last ${periodLabel}.`}>
        <CapturesChart buckets={model.buckets} />
      </Panel>

      {/* What's been identified */}
      <Panel
        title="What's been identified"
        subtitle="Plants the analysis recognized this period, by species."
      >
        <SpeciesTable rows={model.speciesRows} />
      </Panel>
    </div>
  );
}

// --- Range toggle ---------------------------------------------------------

function RangeToggle({ range, onChange }: { range: Range; onChange: (r: Range) => void }) {
  return (
    <div className="join rounded-md border border-base-content/15">
      {RANGES.map((r) => {
        const active = r.key === range;
        return (
          <button
            key={r.key}
            type="button"
            onClick={() => onChange(r.key)}
            className={`join-item px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-primary text-primary-content"
                : "text-base-content/65 hover:bg-base-content/[0.04]"
            }`}
            aria-pressed={active}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}

// --- Captures chart -------------------------------------------------------

function CapturesChart({ buckets }: { buckets: ChartBucket[] }) {
  const max = buckets.reduce((m, b) => Math.max(m, b.count), 0);
  const total = buckets.reduce((sum, b) => sum + b.count, 0);

  if (total === 0) {
    return <EmptyRow message="No captures recorded in this period." />;
  }

  // Show ~6 evenly spaced axis labels so dense day/hour buckets don't crowd.
  const labelEvery = Math.max(1, Math.ceil(buckets.length / 6));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-36 items-stretch gap-1">
        {buckets.map((b, i) => {
          const heightPct = max === 0 ? 0 : Math.round((b.count / max) * 100);
          return (
            <div className="group flex flex-1 flex-col justify-end" key={i}>
              <div
                className="w-full rounded-t-sm bg-primary/70 transition-colors group-hover:bg-primary"
                style={{ height: `${Math.max(heightPct, b.count > 0 ? 4 : 0)}%` }}
                title={`${b.label}: ${b.count}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1">
        {buckets.map((b, i) => (
          <span
            className="flex-1 truncate text-center text-[10px] text-base-content/45"
            key={i}
          >
            {i % labelEvery === 0 ? b.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// --- Species table --------------------------------------------------------

function SpeciesTable({ rows }: { rows: SpeciesRow[] }) {
  if (rows.length === 0) {
    return <EmptyRow message="Nothing identified in this period." />;
  }
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-base-content/15 text-left text-xs uppercase tracking-wider text-base-content/55">
          <Th>Plant</Th>
          <Th>Species</Th>
          <Th className="text-right">Captures</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.species ?? "__none__"} className="border-b border-base-content/8">
            <Td
              className={
                row.species === null ? "italic text-base-content/55" : "font-medium text-neutral"
              }
            >
              {row.species === null ? "Unidentified" : row.commonName ?? "—"}
            </Td>
            <Td className="italic text-base-content/70">{row.species ?? "—"}</Td>
            <Td className="text-right tabular-nums text-neutral">{row.count}</Td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// --- Presentational primitives (mirror the weekly report's styling) -------

function Panel({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-base-content/10 bg-base-100 p-5">
      <div className="mb-3.5">
        <h2 className="text-base font-semibold text-neutral">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-sm text-base-content/55">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-2 py-2 font-semibold ${className}`}>{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-2 ${className}`}>{children}</td>;
}

function EmptyRow({ message }: { message: string }) {
  return (
    <p className="rounded-lg border border-dashed border-base-content/15 bg-base-content/[0.02] px-4 py-4 text-sm text-base-content/55">
      {message}
    </p>
  );
}
