import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
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
  expiresAt: number;
};

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

const markerColor = (m: BfxMarker): string => {
  if (m.status === "win") return "#26a65b";
  if (m.status === "loss" || m.status === "tie") return "#e74c3c";
  return m.direction === "up" ? "#26a65b" : "#e74c3c";
};

const buildLcMarkers = (markers: BfxMarker[]): SeriesMarker<"time">[] => {
  return markers.map((m) => ({
    time: m.time as any,
    position: m.direction === "up" ? ("belowBar" as const) : ("aboveBar" as const),
    color: markerColor(m),
    shape: m.direction === "up" ? ("arrowUp" as const) : ("arrowDown" as const),
    text: m.status === "win" ? "W" : m.status === "loss" ? "L" : undefined,
    size: 2,
  }));
};

export const BfxLineChart = ({
  pair,
  markers = [],
  colors: { backgroundColor = "#0a0e27", textColor = "#94a3bc" } = {},
  onMarkerPosition,
  onPrice,
}: {
  pair: string;
  markers?: BfxMarker[];
  colors?: { backgroundColor?: string; textColor?: string };
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
  onPrice?: (price: number) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const bufferRef = useRef<{ time: number; value: number }[]>([]);
  const initializedRef = useRef(false);

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
      topColor: "rgba(74, 158, 255, 0.35)",
      bottomColor: "rgba(74, 158, 255, 0)",
      lineColor: "#4a9eff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderColor: "#4a9eff",
      crosshairMarkerBackgroundColor: "#0a0e27",
    });
    seriesRef.current = series;

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
  }, [backgroundColor, textColor]);

  useEffect(() => {
    const tick = async () => {
      const now = Math.floor(Date.now() / 1000);
      if (now === lastTimeRef.current) return;

      let price: number | null = null;
      try {
        const res = await fetch(`${API_BASE}/games/bfx/price?asset=${encodeURIComponent(pair)}`);
        const data = await res.json();
        const raw = Number(data?.price ?? data?.data?.price);
        if (isFinite(raw) && raw > 0) price = raw;
      } catch {}

      if (price === null) {
        price = lastPriceRef.current;
      }
      if (price === null) return;

      lastPriceRef.current = price;
      lastTimeRef.current = now;
      onPrice?.(price);

      const point = { time: now, value: price };
      bufferRef.current.push(point);
      if (bufferRef.current.length > 120) bufferRef.current.shift();

      if (seriesRef.current && chartRef.current) {
        if (!initializedRef.current) {
          seriesRef.current.setData(bufferRef.current);
          chartRef.current.timeScale().fitContent();
          initializedRef.current = true;
        } else {
          seriesRef.current.update(point);
          chartRef.current.timeScale().scrollToRealTime();
        }
      }
    };

    const id = setInterval(tick, 1000);
    tick();
    return () => clearInterval(id);
  }, [pair, onPrice]);

  useEffect(() => {
    if (seriesRef.current) {
      if (markers && markers.length > 0) {
        seriesRef.current.setMarkers(buildLcMarkers(markers));
      } else {
        seriesRef.current.setMarkers([]);
      }
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

    const animId = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(animId);
    };
  }, [markers, onMarkerPosition]);

  return <div ref={chartContainerRef} className="w-full h-[180px] md:h-[240px] relative" />;
};
