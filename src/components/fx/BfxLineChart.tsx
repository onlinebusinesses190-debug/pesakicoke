import { createChart, ColorType, IChartApi, ISeriesApi, SeriesMarker } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

/**
 * Binary FX line chart.
 *
 * Deliberately separate from TradingChart.tsx (candlesticks) so the existing
 * PESAKI FX product keeps its candlestick interface untouched. Binary FX uses
 * a clean continuous line: one price point per tick, no OHLC bars.
 */

export type BfxMarker = {
  id: string;
  time: number; // unix seconds
  price: number;
  direction: "up" | "down";
  stake: number;
  status: "open" | "win" | "loss" | "tie";
  remainingSeconds: number;
  expiresAt: number; // unix ms
};

const markerColor = (m: BfxMarker): string => {
  if (m.status === "win") return "#22c55e";
  if (m.status === "loss" || m.status === "tie") return "#ef4444";
  return m.direction === "up" ? "#22c55e" : "#ef4444";
};

const buildLcMarkers = (markers: BfxMarker[]): SeriesMarker<"time">[] => {
  return markers.map((m) => {
    const isUp = m.direction === "up";
    const position: "belowBar" | "aboveBar" = isUp ? "belowBar" : "aboveBar";
    const shape: "arrowUp" | "arrowDown" = isUp ? "arrowUp" : "arrowDown";
    const color = markerColor(m);
    const text = m.status === "win" ? "W" : m.status === "loss" ? "L" : undefined;
    return { time: m.time as any, position, color, shape, text };
  });
};

export const BfxLineChart = ({
  data,
  markers = [],
  colors: { backgroundColor = "transparent", textColor = "silver" } = {},
  onMarkerPosition,
}: {
  data: { time: number; value: number }[];
  markers?: BfxMarker[];
  colors?: any;
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 280,
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
      },
      crosshair: { mode: 0 },
    });
    chartRef.current = chart;

    const newSeries = chart.addLineSeries({
      color: "#dcb13c",
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#dcb13c",
      crosshairMarkerBackgroundColor: "#1e2027",
    });
    seriesRef.current = newSeries;

    if (data && data.length > 0) {
      newSeries.setData(data);
      chart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [backgroundColor, textColor]);

  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      seriesRef.current.setData(data);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [data]);

  useEffect(() => {
    if (seriesRef.current && markers && markers.length > 0) {
      seriesRef.current.setMarkers(buildLcMarkers(markers));
    } else if (seriesRef.current) {
      seriesRef.current.setMarkers([]);
    }
  }, [markers]);

  useEffect(() => {
    if (markers.length === 0 || !chartRef.current || !seriesRef.current) return;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;
      const coords: { id: string; x: number; y: number }[] = [];
      for (const m of markers) {
        const x = chart.timeScale().timeToCoordinate(m.time as any);
        const y = series.priceToCoordinate(m.price);
        if (x != null && y != null) {
          coords.push({ id: m.id, x, y });
        }
      }
      onMarkerPosition?.(coords);
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [markers, onMarkerPosition]);

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center text-gray-500 text-sm bg-[#151924] rounded-xl">
        Loading chart data...
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full h-[280px] relative" />;
};