import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  type Time,
  type SeriesMarker,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";

export type BfxMarker = {
  id: string;
  time: number;
  price: number;
  direction: "up" | "down";
  stake: number;
  status: "open" | "win" | "loss" | "tie";
  remainingSeconds: number;
};

const markerColor = (m: BfxMarker): string => {
  if (m.status === "win") return "#22c55e";
  if (m.status === "loss" || m.status === "tie") return "#ef4444";
  return m.direction === "up" ? "#22c55e" : "#ef4444";
};

const buildLcMarkers = (markers: BfxMarker[]): SeriesMarker<Time>[] => {
  return markers.map((m) => {
    const isUp = m.direction === "up";
    return {
      time: m.time as Time,
      position: isUp ? "belowBar" : "aboveBar",
      color: markerColor(m),
      shape: isUp ? "arrowUp" : "arrowDown",
      text: m.status === "win" ? "W" : m.status === "loss" ? "L" : undefined,
    };
  });
};

type PricePoint = { time: number; value: number };

export const BfxLineChart = ({
  data,
  markers = [],
  colors: { backgroundColor = "#0a0e27", textColor = "#94a3bc" } = {},
  onMarkerPosition,
}: {
  data: PricePoint[];
  markers?: BfxMarker[];
  colors?: { backgroundColor?: string; textColor?: string };
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const lastValueRef = useRef<number | null>(null);
  const dataLengthRef = useRef(0);
  const initializedRef = useRef(false);
  const [lastPriceCoord, setLastPriceCoord] = useState<{
    x: number;
    y: number;
    price: number;
  } | null>(null);

  // ── Init chart once ──
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight || 180,
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.05)" },
        horzLines: { color: "rgba(255, 255, 255, 0.05)" },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: true,
        borderVisible: false,
      },
      crosshair: {
        mode: 0,
        lineColor: "rgba(74, 158, 255, 0.4)",
        textColor: "#ffffff",
      },
      rightPriceScale: {
        borderVisible: false,
      },
    });
    chartRef.current = chart;

    const series = chart.addAreaSeries({
      lineColor: "#4a9eff",
      lineWidth: 2,
      topColor: "rgba(74, 158, 255, 0.35)",
      bottomColor: "rgba(74, 158, 255, 0)",
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#4a9eff",
      crosshairMarkerBackgroundColor: "#0a0e27",
    });
    seriesRef.current = series;

    if (data && data.length > 0) {
      series.setData(data);
      chart.timeScale().fitContent();
      lastTimeRef.current = data[data.length - 1].time;
      lastValueRef.current = data[data.length - 1].value;
      dataLengthRef.current = data.length;
    }

    initializedRef.current = true;

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
      initializedRef.current = false;
    };
  }, []);

  // ── Incremental data updates: use update() only, never setData() after init ──
  useEffect(() => {
    if (!seriesRef.current || !data || data.length === 0) return;
    if (!initializedRef.current) return;
    if (data.length <= dataLengthRef.current) return;

    const lastPoint = data[data.length - 1];
    const lastTime = lastTimeRef.current;
    const lastValue = lastValueRef.current;

    // Skip if same second AND same value
    if (lastTime !== null && lastPoint.time === lastTime && lastPoint.value === lastValue) {
      return;
    }

    if (lastTime !== null && lastPoint.time > lastTime) {
      seriesRef.current.update(lastPoint);
      chartRef.current?.timeScale().scrollToRealTime();
    }

    lastTimeRef.current = lastPoint.time;
    lastValueRef.current = lastPoint.value;
    dataLengthRef.current = data.length;
  }, [data]);

  // ── Markers ──
  useEffect(() => {
    if (!seriesRef.current) return;
    if (markers && markers.length > 0) {
      seriesRef.current.setMarkers(buildLcMarkers(markers));
    } else {
      seriesRef.current.setMarkers([]);
    }
  }, [markers]);

  // ── Frame loop: marker coords + last price dot position ──
  useEffect(() => {
    if (!data || data.length === 0) return;
    let cancelled = false;

    const tick = () => {
      if (cancelled) return;
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      // Marker pixel coords
      const coords: { id: string; x: number; y: number }[] = [];
      for (const m of markers) {
        const x = chart.timeScale().timeToCoordinate(m.time as Time);
        const y = series.priceToCoordinate(m.price);
        if (x != null && y != null) coords.push({ id: m.id, x, y });
      }
      onMarkerPosition?.(coords);

      // Last price dot + label coords
      const lastPoint = data[data.length - 1];
      const x = chart.timeScale().timeToCoordinate(lastPoint.time as Time);
      const y = series.priceToCoordinate(lastPoint.value);
      if (x != null && y != null) {
        setLastPriceCoord({ x, y, price: lastPoint.value });
      }

      requestAnimationFrame(tick);
    };

    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [markers, onMarkerPosition, data]);

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full h-[180px] flex items-center justify-center text-gray-500 text-sm rounded-xl"
        style={{ backgroundColor }}
      >
        Loading chart data…
      </div>
    );
  }

  return (
    <div ref={chartContainerRef} className="w-full h-[180px] relative">
      {lastPriceCoord && (
        <>
          <div
            className="absolute rounded-full"
            style={{
              left: lastPriceCoord.x,
              top: lastPriceCoord.y,
              width: "8px",
              height: "8px",
              background: "#4a9eff",
              boxShadow: "0 0 8px #4a9eff, 0 0 16px #4a9eff",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          />
          <div
            className="absolute px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap"
            style={{
              left: lastPriceCoord.x,
              top: lastPriceCoord.y - 20,
              background: "#4a9eff",
              color: "#ffffff",
              transform: "translate(-50%, -50%)",
              pointerEvents: "none",
            }}
          >
            {lastPriceCoord.price.toFixed(5)}
          </div>
        </>
      )}
    </div>
  );
};
