import type { EChartsOption } from "echarts";
import type { SeriesPoint } from "@gaia/plant-analysis/history";

// A single-series time line, styled to the editorial register (ADR 0004): one
// primary line, recessive dashed gridlines, muted ink-token axis text, a
// crosshair + tooltip hover layer. Single series → no legend (the card title
// names it). Brand is light-only, so there's no dark variant. (dataviz: thin
// marks, 2px line, recessive axes, text in ink not the series color.)

const PRIMARY = "#244f37";
const INK = "rgba(28,25,20,0.55)"; // ≈ base-content / 55
const GRID = "rgba(28,25,20,0.09)";
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

export interface RefLine {
  y: number;
  label: string;
}

export function lineOption({
  points,
  unit = "",
  yMin,
  yMax,
  refLines
}: {
  points: SeriesPoint[];
  unit?: string;
  yMin?: number;
  yMax?: number;
  refLines?: RefLine[];
}): EChartsOption {
  return {
    textStyle: { fontFamily: FONT, color: INK, fontSize: 11 },
    grid: { left: 6, right: 14, top: 14, bottom: 6, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: GRID, width: 1 } },
      backgroundColor: "#ffffff",
      borderColor: GRID,
      borderWidth: 1,
      padding: [6, 10],
      textStyle: { color: "#1c1914", fontSize: 12, fontFamily: FONT },
      valueFormatter: (v) => (typeof v === "number" ? `${v}${unit}` : String(v))
    },
    xAxis: {
      type: "time",
      axisLine: { lineStyle: { color: GRID } },
      axisTick: { show: false },
      axisLabel: { color: INK, hideOverlap: true },
      splitLine: { show: false }
    },
    yAxis: {
      type: "value",
      min: yMin,
      max: yMax,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: INK, formatter: `{value}${unit}` },
      splitLine: { lineStyle: { color: GRID, type: "dashed" } }
    },
    series: [
      {
        type: "line",
        showSymbol: true,
        symbol: "circle",
        symbolSize: 6,
        lineStyle: { width: 2, color: PRIMARY },
        itemStyle: { color: PRIMARY },
        data: points.map((p) => [p.t, p.v]),
        markLine: refLines
          ? {
              silent: true,
              symbol: "none",
              lineStyle: { color: INK, type: "dashed", width: 1, opacity: 0.5 },
              label: { color: INK, fontSize: 10, formatter: (d: { name?: string }) => d.name ?? "" },
              data: refLines.map((r) => ({ yAxis: r.y, name: r.label }))
            }
          : undefined
      }
    ]
  };
}
