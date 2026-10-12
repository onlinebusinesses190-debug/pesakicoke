import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  type SeriesMarker,
  type ChartOptions,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { midAt, type Pair, PAIRS } from "@/lib/fx/market";

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

const pairCache: Record<string, Pair | null> = {};
const getPairByLabel = (label: string): Pair | null => {
  if (label in pairCache) return pairCache[label];
  pairCache[label] = PAIRS.find((p) => p.label === label) ?? null;
  return pairCache[label];
};

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
  expiryTime,
  markers = [],
  colors: { backgroundColor = "#0a0e27", textColor = "#7a82a8" } = {},
  onMarkerPosition,
  onPrice,
}: {
  pair: string;
  expiryTime?: number | null;
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
  const pricePillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const priceLineRef = useRef<any>(null);

  const [chartHeight, setChartHeight] = useState(320);

  useEffect(() => {
    const updateHeight = () => {
      setChartHeight(window.innerWidth < 640 ? 320 : 420);
    };
    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current || chartRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: chartHeight,
      layout: {
        background: { type: ColorType.Solid, color: backgroundColor },
        textColor,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(74, 158, 255, 0.05)" },
        horzLines: { color: "rgba(74, 158, 255, 0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(74, 158, 255, 0.15)",
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: "rgba(74, 158, 255, 0.15)",
        timeVisible: true,
        secondsVisible: true,
        borderVisible: false,
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: "#4a9eff",
          width: 1,
          style: 2,
          labelVisible: false,
        },
        horzLine: {
          color: "#4a9eff",
          width: 1,
          style: 2,
          labelVisible: false,
        },
      },
    } as ChartOptions);
    chartRef.current = chart;

    const series = chart.addAreaSeries({
      topColor: "rgba(74, 158, 255, 0.35)",
      bottomColor: "rgba(74, 158, 255, 0.0)",
      lineColor: "#4a9eff",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 6,
      crosshairMarkerBorderColor: "#0a0e27",
      crosshairMarkerBackgroundColor: "#4a9eff",
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
      priceLineRef.current = null;
    };
  }, [backgroundColor, textColor, chartHeight]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const pairObj = getPairByLabel(pair);
    if (!pairObj) return;

    const digits = pairObj.digits;
    const tickInterval = 200; // 5 updates per second for jagged look

    const tick = () => {
      const nowMs = Date.now();
      const nowSec = Math.floor(nowMs / 1000);
      const fractionalNow = nowMs / 1000;

      let price: number | null = null;
      try {
        price = midAt(pairObj, fractionalNow);
      } catch {}

      if (price === null || !isFinite(price) || price <= 0) {
        price = lastPriceRef.current;
      }
      if (price === null) return;

      const rounded = (m: number) => {
        const f = Math.pow(10, digits);
        return Math.round(m * f) / f;
      };
      const displayPrice = rounded(price);

      lastPriceRef.current = displayPrice;
      onPrice?.(displayPrice);

      const point = { time: nowSec as any, value: displayPrice };

      const series = seriesRef.current;
      const chart = chartRef.current;
      if (!series || !chart) return;

      if (!initializedRef.current) {
        bufferRef.current = [];
        const startTime = nowSec - 120;
        for (let i = 0; i < 120; i++) {
          const t = startTime + i;
          const p = rounded(midAt(pairObj, t + Math.random()));
          bufferRef.current.push({ time: t as any, value: p });
        }
        series.setData(bufferRef.current as any);
        chart.timeScale().fitContent();
        initializedRef.current = true;
      } else {
        if (nowSec !== lastTimeRef.current) {
          lastTimeRef.current = nowSec;
          bufferRef.current.push(point);
          if (bufferRef.current.length > 240) bufferRef.current.shift();
          series.update(point as any);
        } else {
          series.update(point as any);
        }
        chart.timeScale().scrollToRealTime();
      }

      // Update price pill overlay
      if (pricePillRef.current) {
        pricePillRef.current.textContent = displayPrice.toFixed(digits);
      }

      // Update blue dot position
      if (dotRef.current) {
        const x = chart.timeScale().timeToCoordinate(nowSec as any);
        const y = series.priceToCoordinate(displayPrice);
        if (x != null && y != null) {
          dotRef.current.style.left = `${x}px`;
          dotRef.current.style.top = `${y}px`;
        }
      }
    };

    const id = setInterval(tick, tickInterval);
    tick();

    return () => {
      clearInterval(id);
      initializedRef.current = false;
      bufferRef.current = [];
    };
  }, [pair, chartHeight]);

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
      const chart = chartRef.current!;
      const series = seriesRef.current!;

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

  return (
    <div
      ref={chartContainerRef}
      className="w-full relative rounded-xl overflow-hidden"
      style={{ height: chartHeight, backgroundColor: "#0a0e27" }}
    >
      {pricePillRef && (
        <>
          <div
            ref={pricePillRef}
            className="absolute top-2 right-12 px-2 py-0.5 rounded text-xs font-mono font-bold z-10"
            style={{
              background: "#4a9eff",
              color: "#ffffff",
            }}
          />
          <div
            ref={dotRef}
            className="absolute w-2 h-2 rounded-full shadow-[0_0_8px_rgba(74,158,255,0.8)] pointer-events-none z-10"
            style={{
              background: "#4a9eff",
              transform: "translate(-50%, -50%)",
            }}
          />
          {expiryTime && (
            <div className="absolute top-2 right-1 z-10 text-right">
              <p className="text-[10px] text-[#7a82a8]">Expiration time</p>
              <p className="text-[11px] text-[#e8eaf6] font-medium">
                {new Date(expiryTime).toLocaleTimeString("en-KE", {
                  hour12: false,
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
