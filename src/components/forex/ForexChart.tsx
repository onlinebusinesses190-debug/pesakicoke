/**
 * PESAKI Forex — candlestick chart with fullscreen viewing.
 *
 * Separate from components/fx/TradingChart, which renders the binary
 * prediction game's trade markers and countdown overlays. Those markers mean
 * nothing here, so this is its own component built on the same lightweight
 * chart dependency.
 *
 * Everything drawn is real: candles come from the server engine, and the
 * entry/stop/target lines are the actual prices recorded on the open position.
 * The browser does not compute a price or a P/L.
 *
 * Fullscreen is a viewing feature only. It enters through the browser
 * Fullscreen API on this component's own root element, so no route change, no
 * remount and no reload happens: the symbol, timeframe, polling and open
 * position all survive untouched. Where the Fullscreen API is unavailable the
 * same layout is reached with a CSS overlay instead of failing silently.
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
import { ArrowLeft, Maximize2, Minimize2 } from "lucide-react";

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
  symbol,
  symbols,
  onSymbolChange,
  priceLabel,
  positionLabel,
  pnlLabel,
  pnlPositive,
}: {
  data: ForexCandle[];
  interval: ForexInterval;
  onIntervalChange: (i: ForexInterval) => void;
  lines?: PriceLines;
  digits?: number;
  height?: number;
  /** Displayed in the fullscreen bar so the pair is never ambiguous. */
  symbol?: string;
  /** When provided, the pair is switchable from inside fullscreen. */
  symbols?: string[];
  onSymbolChange?: (s: string) => void;
  /** Indicative price text, e.g. "Bid 1.12969 · Ask 1.12973". */
  priceLabel?: string;
  /** Open position summary, e.g. "BUY 0.68 lots @ 1.12971". */
  positionLabel?: string;
  pnlLabel?: string;
  pnlPositive?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [full, setFull] = useState(false);
  /** True when the Fullscreen API is unavailable and CSS is carrying the layout. */
  const [cssFallback, setCssFallback] = useState(false);
  const [hover, setHover] = useState<ForexCandle | null>(null);

  // The chart is created exactly once. Recreating it on a fullscreen toggle or
  // a data update throws away zoom, pan and the crosshair, which is what makes
  // a chart feel broken. Resizing is handled by applyOptions instead.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

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
      height,
    });

    const series = chart.addCandlestickSeries({
      upColor: GREEN,
      downColor: RED,
      borderUpColor: GREEN,
      borderDownColor: RED,
      wickColor: GREEN,
      priceLineVisible: true,
      lastValueVisible: true,
    });

    // Hover readout for the crosshair.
    // lightweight-charts 3.8 exposes `seriesPrices`; `seriesData` is the v5 name.
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.point) {
        setHover(null);
        return;
      }
      const bar = param.seriesPrices.get(series) as
        { open: number; high: number; low: number; close: number } | undefined;
      if (!bar) {
        setHover(null);
        return;
      }
      setHover({
        time: (param.time as number) * 1000,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      });
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Follow container resizes. Entering fullscreen changes the box dramatically,
    // so the canvas must be told rather than left at its old size.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      chart.applyOptions({ width: Math.floor(box.width), height: Math.floor(box.height) });
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [height]);

  useEffect(() => {
    seriesRef.current?.setData(
      data.map((c) => ({
        time: Math.floor(c.time / 1000) as UTCTimestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      })),
    );
  }, [data]);

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

  // ── Fullscreen ─────────────────────────────────────────────────────────────

  /**
   * Whether this browser can do real fullscreen. iOS Safari notably cannot, so
   * the CSS path is a genuine requirement rather than defensive noise.
   */
  const nativeSupported = () =>
    typeof document !== "undefined" &&
    document.fullscreenEnabled !== false &&
    typeof document.documentElement?.requestFullscreen === "function";

  const fitToScreen = useCallback(() => {
    const host = hostRef.current;
    if (!host || !chartRef.current) return;
    // Two frames: one for the overlay/native transition, one for the new box.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (w > 0 && h > 0) chartRef.current?.applyOptions({ width: w, height: h });
      });
    });
  }, []);

  const enterFullscreen = useCallback(async () => {
    const root = rootRef.current;
    if (!root) return;

    if (!nativeSupported() || typeof root.requestFullscreen !== "function") {
      // No native fullscreen here. Expand over the app instead. Not an error.
      setCssFallback(true);
      setFull(true);
      return;
    }

    try {
      // Requested directly from the user gesture so mobile Safari will not
      // reject it as untrusted.
      await root.requestFullscreen();
    } catch {
      // Denied by the browser or unsupported despite the capability check.
      // Fall back to CSS rather than showing the user a failure.
      setCssFallback(true);
      setFull(true);
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      // Nothing useful to do; the state sync below still restores the layout.
    }
    setFull(false);
    setCssFallback(false);
  }, []);

  /**
   * Stay in step with the browser, not just our own button. ESC, the browser's
   * own fullscreen control and the user leaving fullscreen another way all fire
   * `fullscreenchange`; without this the UI would keep believing it is expanded.
   */
  useEffect(() => {
    const sync = () => {
      const root = rootRef.current;
      if (!root) return;
      if (document.fullscreenElement === root) {
        setFull(true);
        setCssFallback(false);
        fitToScreen();
      } else if (full && !document.fullscreenElement) {
        // Left fullscreen by any means. Only clear state if we had actually gone
        // native, so a CSS fallback session is left alone.
        setFull(false);
        setCssFallback(false);
      }
    };
    document.addEventListener("fullscreenchange", sync);
    // Safari still fires webkitfullscreenchange in some versions.
    document.addEventListener("webkitfullscreenchange", sync as EventListener);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync as EventListener);
    };
  }, [full, fitToScreen]);

  // Native fullscreen scrolls the page with it on some browsers; the CSS
  // fallback definitely needs this. Restored exactly as it was found.
  useEffect(() => {
    if (!full || !cssFallback) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [full, cssFallback]);

  // A second, CSS-only safety net: if something outside our control collapsed
  // the native session, the overlay must not stay stuck open.
  useEffect(() => {
    if (full && !cssFallback && typeof document !== "undefined" && !document.fullscreenElement) {
      setFull(false);
    }
  }, [full, cssFallback]);

  const fmt = (n: number) => n.toFixed(digits);
  const shown = hover ?? data[data.length - 1];

  return (
    <div
      ref={rootRef}
      data-forex-chart-root=""
      className={
        full
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "relative rounded-2xl border border-border bg-card"
      }
      style={
        full
          ? // Native fullscreen keeps the element's own box; the CSS fallback
            // needs the viewport explicitly, including on mobile browsers whose
            // 100vh includes an address bar.
            cssFallback
            ? { width: "100vw", height: "100dvh", maxWidth: "100vw" }
            : { width: "100%", height: "100%", background: "var(--background)" }
          : undefined
      }
    >
      {full ? (
        /* ── Fullscreen bar: compact, so it does not eat the chart ───────────── */
        <div className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-1.5 backdrop-blur">
          <button
            onClick={() => void exitFullscreen()}
            aria-label="Exit fullscreen"
            title="Exit fullscreen"
            className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-bold text-foreground transition-colors hover:bg-muted"
          >
            <ArrowLeft className="h-3 w-3" />
            <span className="hidden sm:inline">Exit fullscreen</span>
          </button>

          {symbol && (
            <span className="shrink-0 font-display text-[13px] font-bold text-brand-deep">
              {symbol}
            </span>
          )}

          {symbols && symbols.length > 1 && onSymbolChange && (
            <select
              aria-label="Currency pair"
              value={symbol}
              onChange={(e) => onSymbolChange(e.target.value)}
              className="h-7 shrink-0 rounded-lg border border-border bg-background px-1.5 text-[11px] font-semibold text-foreground outline-none focus:border-brand-ink"
            >
              {symbols.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}

          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => onIntervalChange(i)}
                aria-pressed={i === interval}
                className={[
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold transition-colors",
                  i === interval ? "bg-brand-deep text-white" : "text-muted-foreground",
                ].join(" ")}
              >
                {i}
              </button>
            ))}
          </div>

          {priceLabel && (
            <span className="hidden shrink-0 font-mono text-[10px] text-muted-foreground md:inline">
              {priceLabel}
            </span>
          )}
          {positionLabel && (
            <span className="hidden shrink-0 font-mono text-[10px] text-foreground lg:inline">
              {positionLabel}
            </span>
          )}
          {pnlLabel && (
            <span
              className={[
                "shrink-0 font-mono text-[11px] font-bold",
                pnlPositive ? "text-brand-ink" : "text-destructive",
              ].join(" ")}
            >
              {pnlLabel}
            </span>
          )}
        </div>
      ) : (
        /* ── Normal view: intervals and the fullscreen trigger, top-right ────── */
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1">
          <div className="flex gap-1 rounded-full bg-background/90 p-0.5">
            {INTERVALS.map((i) => (
              <button
                key={i}
                onClick={() => onIntervalChange(i)}
                aria-pressed={i === interval}
                className={[
                  "rounded-full px-2 py-1 text-[10px] font-bold transition-colors",
                  i === interval ? "bg-brand-deep text-white" : "text-muted-foreground",
                ].join(" ")}
              >
                {i}
              </button>
            ))}
          </div>
          <button
            onClick={() => void enterFullscreen()}
            aria-label="View fullscreen"
            title="View fullscreen"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-background/90 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

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

      <div
        ref={hostRef}
        className={full ? "min-h-0 w-full flex-1" : "w-full"}
        style={full ? undefined : { height }}
      />

      {full && (
        <p className="shrink-0 px-3 pb-2 pt-1 text-center text-[10px] text-muted-foreground">
          Drag to pan · scroll or pinch to zoom
        </p>
      )}
    </div>
  );
}
