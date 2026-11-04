import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

type ChartEngine = {
  quotes?: Record<string, { bid: number; ask: number }>;
  candles?: Record<string, Partial<Record<TF, Array<{ t: number; o: number; h: number; l: number; c: number }>>>>;
  positions?: Array<{ symbol: string; side: "buy" | "sell"; lots: number; openPrice: number; sl?: number; tp?: number }>;
  spec: (symbol: string) => { digits: number; point: number; desc?: string } | undefined;
  profitOf: (position: any) => number;
};

/** Canvas price chart. Open-position entry prices participate in autoscaling so
 * live positions remain plotted at their actual execution price, not pinned to an edge. */
export function PriceChart({
  engine,
  symbol,
  tf,
  zoom,
  showCrosshair = false,
  chartType = "candle",
}: {
  engine: ChartEngine;
  symbol: string;
  tf: TF;
  zoom: number;
  showCrosshair?: boolean;
  showIndicators?: boolean;
  chartType?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef({ spacing: 8, offset: 0 });
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const pinch = useRef<{ distance: number; spacing: number } | null>(null);

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 8 * zoom));
  }, [zoom]);

  useEffect(() => {
    view.current.offset = 0;
  }, [symbol, tf]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !size.w || !size.h) return;

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const quote = engine.quotes?.[symbol];
      const spec = engine.spec(symbol);
      const all = engine.candles?.[symbol]?.[tf] ?? [];
      const positions = (engine.positions ?? []).filter((p) => p.symbol.replace("/", "").toUpperCase() === symbol.replace("/", "").toUpperCase());
      const dpr = window.devicePixelRatio || 1;
      const pixelWidth = Math.round(size.w * dpr);
      const pixelHeight = Math.round(size.h * dpr);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const W = size.w, H = size.h, axisW = 64, axisH = 22;
      const plotW = Math.max(1, W - axisW), plotH = Math.max(1, H - axisH);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#f8f9fa";
      ctx.fillRect(plotW, 0, axisW, H);
      if (!quote || !spec || all.length === 0) return;

      const spacing = view.current.spacing;
      const count = Math.max(5, Math.floor((plotW - 12) / spacing));
      const end = Math.max(0, all.length - view.current.offset);
      const bars = all.slice(Math.max(0, end - count), end);
      if (bars.length === 0) return;

      let lo = Math.min(...bars.map((bar) => bar.l), quote.bid, quote.ask);
      let hi = Math.max(...bars.map((bar) => bar.h), quote.bid, quote.ask);
      // A real position can be priced by the server's market feed while the
      // local candle history is still catching up. Include its execution price
      // in the scale rather than clamping its marker to the top/bottom edge.
      for (const position of positions) {
        if (Number.isFinite(position.openPrice)) {
          lo = Math.min(lo, position.openPrice);
          hi = Math.max(hi, position.openPrice);
        }
      }
      const minRange = Math.max(spec.point * 20, Number.EPSILON);
      const padding = Math.max((hi - lo) * 0.08, minRange);
      lo -= padding;
      hi += padding;
      const range = Math.max(hi - lo, minRange);
      const y = (price: number) => plotH - ((price - lo) / range) * plotH;
      const x = (index: number) => plotW - 12 - (bars.length - index - 0.5) * spacing;

      ctx.font = "11px Arial, sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#e5e5e5";
      ctx.fillStyle = "#444";
      const gridStep = range / 6;
      for (let i = 0; i <= 6; i++) {
        const price = lo + gridStep * i;
        const yy = Math.round(y(price)) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(plotW, yy);
        ctx.stroke();
        ctx.fillText(price.toFixed(spec.digits), plotW + 4, yy);
      }

      const candleWidth = Math.max(2, Math.min(10, spacing * 0.7));
      bars.forEach((bar, index) => {
        const xx = Math.round(x(index));
        const bullish = bar.c >= bar.o;
        ctx.strokeStyle = ctx.fillStyle = bullish ? "#089981" : "#f23645";
        ctx.beginPath();
        ctx.moveTo(xx + 0.5, y(bar.h));
        ctx.lineTo(xx + 0.5, y(bar.l));
        ctx.stroke();
        if (chartType === "line") {
          if (index > 0) {
            ctx.beginPath();
            ctx.moveTo(x(index - 1), y(bars[index - 1].c));
            ctx.lineTo(x(index), y(bar.c));
            ctx.stroke();
          }
        } else {
          const top = y(Math.max(bar.o, bar.c));
          const height = Math.max(1, Math.abs(y(bar.o) - y(bar.c)));
          ctx.fillRect(xx - candleWidth / 2, top, candleWidth, height);
        }
      });

      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.fillText(`${symbol} · ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText(spec.desc ?? "", 8, 30);

      positions.forEach((position) => {
        const entryY = y(position.openPrice);
        const color = position.side === "buy" ? "#1565c0" : "#c62828";
        ctx.strokeStyle = color;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, entryY);
        ctx.lineTo(plotW, entryY);
        ctx.stroke();
        ctx.setLineDash([]);

        const label = `${position.side.toUpperCase()} ${position.lots.toFixed(2)}  ${engine.profitOf(position).toFixed(2)} USD`;
        ctx.font = "bold 11px Arial, sans-serif";
        const labelWidth = ctx.measureText(label).width + 10;
        const labelY = Math.max(9, Math.min(plotH - 9, entryY));
        ctx.fillStyle = "#fff";
        ctx.fillRect(4, labelY - 9, labelWidth, 18);
        ctx.fillStyle = color;
        ctx.fillText(label, 9, labelY);
      });

      const drawQuote = (price: number, color: string) => {
        const yy = Math.round(y(price)) + 0.5;
        ctx.strokeStyle = color;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(plotW, yy);
        ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - 8, axisW, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(price.toFixed(spec.digits), plotW + 4, yy);
      };
      drawQuote(quote.ask, "#c62828");
      drawQuote(quote.bid, "#1565c0");

      const timeStep = Math.max(1, Math.round(90 / spacing));
      ctx.textAlign = "center";
      ctx.fillStyle = "#555";
      for (let i = bars.length - 1; i >= 0; i -= timeStep) {
        const xx = x(i);
        ctx.beginPath();
        ctx.strokeStyle = "#e5e5e5";
        ctx.moveTo(Math.round(xx) + 0.5, 0);
        ctx.lineTo(Math.round(xx) + 0.5, plotH);
        ctx.stroke();
        const date = new Date(bars[i].t * 1000);
        ctx.fillText(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`, xx, plotH + 12);
      }
      if (showCrosshair) {
        ctx.strokeStyle = "#64748b";
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(0, 0, plotW, plotH);
        ctx.setLineDash([]);
      }
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [size.w, size.h, engine, symbol, tf, showCrosshair, chartType]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden bg-white cursor-crosshair"
      onWheel={(event) => {
        event.preventDefault();
        view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * (event.deltaY < 0 ? 1.15 : 0.85)));
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" || event.pointerType === "pen") {
          drag.current = { x: event.clientX, offset: view.current.offset };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const candles = engine.candles?.[symbol]?.[tf] ?? [];
        const shift = Math.round(-(event.clientX - drag.current.x) / view.current.spacing);
        view.current.offset = Math.max(0, Math.min(Math.max(0, candles.length - 10), drag.current.offset + shift));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onTouchStart={(event) => {
        if (event.touches.length === 2) {
          const dx = event.touches[0].clientX - event.touches[1].clientX;
          const dy = event.touches[0].clientY - event.touches[1].clientY;
          pinch.current = { distance: Math.hypot(dx, dy), spacing: view.current.spacing };
        } else if (event.touches.length === 1) {
          drag.current = { x: event.touches[0].clientX, offset: view.current.offset };
        }
      }}
      onTouchMove={(event) => {
        if (event.touches.length === 2 && pinch.current) {
          event.preventDefault();
          const dx = event.touches[0].clientX - event.touches[1].clientX;
          const dy = event.touches[0].clientY - event.touches[1].clientY;
          view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * Math.hypot(dx, dy) / pinch.current.distance));
        } else if (event.touches.length === 1 && drag.current) {
          const candles = engine.candles?.[symbol]?.[tf] ?? [];
          const shift = Math.round(-(event.touches[0].clientX - drag.current.x) / view.current.spacing);
          view.current.offset = Math.max(0, Math.min(Math.max(0, candles.length - 10), drag.current.offset + shift));
        }
      }}
      onTouchEnd={() => { drag.current = null; pinch.current = null; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
