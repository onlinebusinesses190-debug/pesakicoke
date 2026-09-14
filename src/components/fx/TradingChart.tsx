import { createChart, ColorType, IChartApi, ISeriesApi, SeriesMarker } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

// ─── Pocket Option–style marker supplied by the Binary FX page ──────────────
export type FxMarker = {
  id: string;
  time: number; // unix seconds
  price: number;
  type: "buy" | "sell";
  stake: number;
  status: "pending" | "won" | "lost";
  remainingSeconds: number; // live countdown, updated by the parent
  expiresAt: number; // unix ms, used to compute the countdown
  label?: string;
};

const markerColor = (m: FxMarker) => {
  if (m.status === "won") return "#22c55e"; // green
  if (m.status === "lost") return "#ef4444"; // red
  return m.type === "buy" ? "#22c55e" : "#ef4444"; // pending keeps direction colour
};

const buildLcMarkers = (markers: FxMarker[]): SeriesMarker<"time">[] => {
  return markers.map((m) => {
    const isBuy = m.type === "buy";
    // BUY sits below the candle, SELL above it.
    const position: "belowBar" | "aboveBar" = isBuy ? "belowBar" : "aboveBar";
    const shape: "arrowUp" | "arrowDown" = isBuy ? "arrowUp" : "arrowDown";
    const color = markerColor(m);
    // Show a check on wins, an X on losses, nothing on pending.
    const text = m.status === "won" ? "W" : m.status === "lost" ? "L" : undefined;
    return { time: m.time as any, position, color, shape, text };
  });
};

export const TradingChart = ({
  data,
  markers = [],
  colors: { backgroundColor = "transparent", textColor = "silver" } = {},
  onMarkerPosition,
}: {
  data: any[];
  markers?: FxMarker[];
  colors?: any;
  // Fired each frame with pixel coords for every marker, so the parent can
  // render the stake label + live countdown HTML overlay on top of the chart.
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

  useEffect(() => {
    if (!data || data.length === 0) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
        chartRef.current.timeScale().fitContent();
      }
    };

    if (chartContainerRef.current) {
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
      });
      chartRef.current = chart;

      const newSeries = chart.addCandlestickSeries({
        upColor: "#26a69a",
        downColor: "#ef5350",
        borderVisible: false,
        wickUpColor: "#26a69a",
        wickDownColor: "#ef5350",
      });
      seriesRef.current = newSeries;
      newSeries.setData(data);
      chart.timeScale().fitContent();

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.remove();
      };
    }
  }, [backgroundColor, textColor, data]);

  // ── Update candle data ──
  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      seriesRef.current.setData(data);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [data]);

  // ── Permanent markers (one per trade, coloured by outcome) ──
  useEffect(() => {
    if (seriesRef.current && markers && markers.length > 0) {
      seriesRef.current.setMarkers(buildLcMarkers(markers));
    } else if (seriesRef.current) {
      seriesRef.current.setMarkers([]);
    }
  }, [markers]);

  // ── Frame loop: locate every marker so the parent can overlay the
  //    stake label + live countdown + horizontal price line in HTML. ──
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
