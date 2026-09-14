import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  SeriesMarker,
  UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

// Marker shape the Binary FX page supplies. Each trade leaves a permanent
// marker on the chart at its entry price; the marker reflects the outcome
// once the trade settles.
export type FxMarker = {
  time: number; // unix seconds
  price: number;
  type: "buy" | "sell";
  status: "pending" | "won" | "lost";
  label?: string;
};

// Lightweight-charts marker item.
type LcMarker = SeriesMarker<number>;

const markerColors = {
  won: "#22c55e", // green
  lost: "#ef4444", // red
  pending: "#fbbf24", // amber
};

const buildLcMarkers = (markers: FxMarker[]): SeriesMarker<"time">[] => {
  return markers.map((m) => {
    const isBuy = m.type === "buy";
    // BUY sits below the candle, SELL above it.
    const position: "belowBar" | "aboveBar" = isBuy ? "belowBar" : "aboveBar";
    // lightweight-charts only supports circle/square/arrowUp/arrowDown.
    const shape: "arrowUp" | "arrowDown" = isBuy ? "arrowUp" : "arrowDown";
    const color = markerColors[m.status];
    const text = m.status === "won" ? "W" : m.status === "lost" ? "L" : undefined;
    return { time: m.time as any, position, color, shape, text };
  });
};

export const TradingChart = ({
  data,
  markers = [],
  colors: { backgroundColor = "transparent", textColor = "silver" } = {},
  onPendingMarkerPosition,
}: {
  data: any[];
  markers?: FxMarker[];
  colors?: any;
  // Optional callback fired each frame with pixel coords of pending markers,
  // so the parent can render a pulsing HTML overlay on top of the chart.
  onPendingMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [pendingMarkers, setPendingMarkers] = useState<FxMarker[]>([]);

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

  // Track pending markers so we can pulse an HTML overlay on top.
  useEffect(() => {
    setPendingMarkers((markers || []).filter((m) => m.status === "pending"));
  }, [markers]);

  // ── Frame loop: locate pending markers and report pixel coords ──
  useEffect(() => {
    if (pendingMarkers.length === 0 || !chartRef.current || !seriesRef.current) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const chart = chartRef.current;
      if (!chart) return;
      const coords: { id: string; x: number; y: number }[] = [];
      for (const m of pendingMarkers) {
        const x = chart.timeScale().timeToCoordinate(m.time as any);
        const y = seriesRef.current!.priceToCoordinate(m.price);
        if (x != null && y != null) {
          coords.push({ id: `${m.time}-${m.type}-${m.price}`, x, y });
        }
      }
      onPendingMarkerPosition?.(coords);
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [pendingMarkers, onPendingMarkerPosition]);

  if (!data || data.length === 0) {
    return (
      <div className="w-full h-[280px] flex items-center justify-center text-gray-500 text-sm bg-[#151924] rounded-xl">
        Loading chart data...
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full h-[280px] relative" />;
};
