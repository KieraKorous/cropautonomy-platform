"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

// Tree-shaken ECharts: only the line chart + the components we use, rendered as
// crisp SVG (matches the light editorial surface, no canvas blur). ECharts is
// vanilla JS, so this is the only React glue it needs — mount on a div, feed
// options, resize with the container, dispose on unmount. Client-only: init()
// touches the DOM, so this component never runs during SSR.
echarts.use([LineChart, GridComponent, TooltipComponent, MarkLineComponent, SVGRenderer]);

export function EChart({
  option,
  height = 220,
  ariaLabel
}: {
  option: EChartsOption;
  height?: number;
  ariaLabel: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!elRef.current) return;
    const chart = echarts.init(elRef.current, null, { renderer: "svg" });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // notMerge so replacing the dataset doesn't leave stale marks behind.
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={elRef} style={{ height }} role="img" aria-label={ariaLabel} />;
}
