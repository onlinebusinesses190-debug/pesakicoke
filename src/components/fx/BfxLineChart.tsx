import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  type ChartOptions,
  type LineStyle,
} from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import { midAt, type Pair, PAIRS } from "@/lib/fx/market";
import "./BfxLineChart.css";

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

export const BfxLineChart = ({
  pair,
  expiryTime,
  markers = [],
  colors: { backgroundColor = "#0a0e27", textColor = "#7a82a8" } = {},
  onPrice,
  onMarkerPosition,
  onChartReady,
}: {
  pair: string;
  expiryTime?: number | null;
  markers?: BfxMarker[];
  colors?: { backgroundColor?: string; textColor?: string };
  onPrice?: (price: number) => void;
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
  onChartReady?: (chart: IChartApi | null, series: ISeriesApi<"Area"> | null) => void;
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const lastPriceRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const bufferRef = useRef<{ time: number; value: number }[]>([]);
  const initializedRef = useRef(false);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const pricePillRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<BfxMarker[]>(markers);
  const onPriceRef = useRef(onPrice);
  const onMarkerPositionRef = useRef(onMarkerPosition);
  const onChartReadyRef = useRef(onChartReady);

  const [chartHeight, setChartHeight] = useState(320);

  useEffect(() => {
    onChartReadyRef.current = onChartReady;
    onPriceRef.current = onPrice;
    onMarkerPositionRef.current = onMarkerPosition;
    markersRef.current = markers;
  });

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

    priceLineRef.current = series.createPriceLine({
      price: 1.13,
      color: "#4a9eff",
      lineWidth: 1,
      lineStyle: 0 as LineStyle,
      lineVisible: true,
      axisLabelVisible: false,
      title: "",
    });

    onChartReadyRef.current?.(chart, series);

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      onChartReadyRef.current?.(null, null);
      window.removeEventListener("resize", handleResize);
      const s = seriesRef.current;
      if (s && priceLineRef.current) s.removePriceLine(priceLineRef.current);
      priceLineRef.current = null;
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      initializedRef.current = false;
    };
  }, [backgroundColor, textColor, chartHeight]);

  useEffect(() => {
    if (!seriesRef.current || !chartRef.current) return;

    const pairObj = getPairByLabel(pair);
    if (!pairObj) return;

    const digits = pairObj.digits;
    const tickInterval = 200;

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

      if (nowSec !== lastTimeRef.current) {
        onPriceRef.current?.(displayPrice);
      }

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

      const mc = markersRef.current;
      if (mc.length > 0) {
        const ts = chart.timeScale();
        const coords: { id: string; x: number; y: number }[] = [];
        for (const m of mc) {
          const xRaw = ts.timeToCoordinate(m.time as any);
          const yRaw = series.priceToCoordinate(m.price);
          if (xRaw != null && yRaw != null) {
            coords.push({ id: m.id, x: xRaw as number, y: yRaw as number });
          }
        }
        onMarkerPositionRef.current?.(coords);
      }

      priceLineRef.current?.applyOptions({ price: displayPrice });

      if (pricePillRef.current) {
        pricePillRef.current.textContent = displayPrice.toFixed(digits);
      }

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

  return (
    <div
      ref={chartContainerRef}
      className="w-full relative rounded-xl overflow-hidden"
      style={{ height: chartHeight, backgroundColor: "#0a0e27" }}
    >
      <div
        ref={pricePillRef}
        className="absolute top-2 right-2 px-2 py-0.5 rounded text-xs font-mono font-bold z-10"
        style={{
          background: "#4a9eff",
          color: "#ffffff",
          boxShadow: "0 0 8px rgba(74, 158, 255, 0.4)",
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
        <div className="absolute top-3 right-16 z-10 text-right">
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
    </div>
  );
};
