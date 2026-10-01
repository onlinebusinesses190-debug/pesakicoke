/**
 * PESAKI Forex — candlestick chart.
 *
 * Separate from components/fx/TradingChart, which renders the binary
 * prediction game's trade markers and countdown overlays. Those markers mean
 * nothing here, so this is its own component built on the same lightweight
 * chart dependency.
 *
 * Everything drawn is real: candles come from the server engine, and the
 * entry/stop/target lines are the actual prices recorded on the open position.
 * The browser does not compute a price or a P/L.
 */

import { useEffect, useRef, useState } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type ISeriesApi,
  type PriceLineOptions,
  type UTCTimestamp,
} from "lightweight-charts";
import { Maximize2, Minimize2, X } from "lucide-react";

export interface ForexCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface PriceLines {
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
}

const INTERVALS = ["1m", "5m", "15m", "30m", "1H", "4H", "1D"] as const;
export type ForexInterval = (typeof INTERVALS)[number];

const GOLD = "#f5c842";
const GREEN = "#1a7f4b";
const RED = "#c0342b";

export function ForexChart({
  data,
  interval,
  onIntervalChange,
  lines,
  digits = 5,
  height = 320,
}: {
  data: ForexCandle[];
  interval: ForexInterval;
  onIntervalChange: (i: ForexInterval) => void;
  lines?: PriceLines;
  digits?: number;
  height?: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [full, setFull] = useState(false);
  const [hover, setHover] = useState<ForexCandle | null>(null);

  // Create once. Recreating on every data update drops zoom, pan and the
  // user's crosshair position, which is exactly what makes a chart feel broken.
  useEffect(() => {
    if (!hostRef.current) return;
    const host = hostRef.current;
    const chart = createChart(host, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#6b7280",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.05)" },
        horzLines: { color: "rgba(0,0,0,0.05)" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.12 } },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        // Native crosshair line plus a floating OHLC readout.
        vertLine: { labelVisible: true },
        horzLine: { labelVisible: true },
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      // lightweight-charts 3.8 has no `autoSize`, so the chart must be told its
      // dimensions. Without this the canvas keeps its initial 0x0 size and the
      // chart renders blank.
      width: host.clientWidth || 320,
      height: full ? host.clientHeight || 400 : height,
    });

    const series = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickUpColor: GREEN,
      wickDownColor: RED,
      priceLineVisible: true,
      lastValueVisible: true,
    });
    chartRef.current = chart;
    seriesRef.current = series;

    // Follow container resizes, which includes entering fullscreen.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      chart.applyOptions({
        width: Math.floor(box.width),
        height: Math.floor(box.height),
      });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [full, height]);

  useEffect(() => {
    if (!seriesRef.current) return;
    seriesRef.current.setData(
      data.map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
    if (full) {
      chartRef.current?.timeScale().fitContent();
    }
  }, [data, full]);

  // Entry / stop / target reference lines for the open positions.
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    const applied: unknown[] = [];
    const add = (price: number, color: string, title: string) => {
      // Annotated so `lineWidth` is not widened from a literal to number, which
      // PriceLineOptions rejects.
      const options: PriceLineOptions = {
        price,
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        lineVisible: true,
        axisLabelVisible: true,
        title,
      };
      applied.push(series.createPriceLine(options));
    };
    if (lines?.entry != null) add(lines.entry, GOLD, "Entry");
    if (lines?.stopLoss != null) add(lines.stopLoss, RED, "SL");
    if (lines?.takeProfit != null) add(lines.takeProfit, GREEN, "TP");

    return () => {
      for (const line of applied) {
        try {
          series.removePriceLine(line as never);
        } catch {
          // A line can already be gone if the series was torn down first.
        }
      }
    };
  }, [lines?.entry, lines?.stopLoss, lines?.takeProfit]);

  // Fullscreen: lock body scroll so the page behind does not move on mobile.
  useEffect(() => {
    if (!full) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFull(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [full]);

  const fmt = (n: number) => n.toFixed(digits);
  const shown = hover ?? data[data.length - 1];

  return (
    <div
      className={
        full
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "relative rounded-2xl border border-border bg-card"
      }
    >
      <div className={full ? "flex items-center gap-1 border-b border-border px-3 py-2" : "absolute right-2 top-2 z-10"}>
        {!full && (
          <div className="flex gap-1 rounded-full bg-background/90 p-0.5">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => onIntervalChange(i)}
                className={[
                  "rounded-full px-2 py-1 text-[10px] font-bold transition-colors",
                  i === interval ? "bg-brand-deep text-white" : "text-muted-foreground",
                ].join(" ")}
              >
                {i}
              </button>
            ))}
          </div>
        )}
        {full && (
          <div className="flex flex-1 items-center gap-1 overflow-x-auto">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => onIntervalChange(i)}
                className={[
                  "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
                  i === interval ? "bg-brand-deep text-white" : "text-muted-foreground",
                ].join(" ")}
              >
                {i}
              </button>
            ))}
          </div>
        )}
        <button
          onClick={() => setFull((f) => !f)}
          aria-label={full ? "Exit full screen" : "Full screen chart"}
          className={[
            "grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors",
            full ? "bg-muted text-foreground" : "bg-background/90 text-muted-foreground",
          ].join(" ")}
        >
          {full ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
        {full && (
          <button
            onClick={() => setFull(false)}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {shown && (
        <div
          className={[
            "pointer-events-none flex gap-3 font-mono text-[10px] text-muted-foreground",
            full ? "px-3 py-1.5" : "absolute left-2 top-2 z-10 flex-col gap-0.5",
          ].join(" ")}
        >
          {(
            [
              ["O", shown.open],
              ["H", shown.high],
              ["L", shown.low],
              ["C", shown.close],
            ] as const
          ).map(([k, v]) => (
            <span key={k} className={k === "C" ? "font-bold text-foreground" : undefined}>
              {k} {fmt(v)}
            </span>
          ))}
        </div>
      )}

      <div ref={hostRef} className={full ? "min-h-0 flex-1" : ""} style={full ? undefined : { height }} />

      {full && (
        <p className="px-3 pb-3 pt-1 text-center text-[10px] text-muted-foreground">
          Swipe to pan · pinch to zoom · double tap to zoom
        </p>
      )}
    </div>
  );
}