import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export function PriceChart({ symbol, tf, zoom }: { symbol: string; tf: TF; zoom: number }) {
  const e = useEngine();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  
  // Reduced default spacing from 8 to 5 to make candles skinnier like MT5
  const view = useRef({ spacing: 5, offset: 0 });
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; off: number } | null>(null);
  const pinch = useRef<{ dist: number; spacing: number } | null>(null);
  const [, setRedraw] = useState(0);
  
  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 5 * zoom));
    setRedraw((x) => x + 1);
  }, [zoom]);

  useEffect(() => {
    view.current.offset = 0;
  }, [symbol, tf]);

  // ─── RESIZE FIX FOR MOBILE BLANK CHART ───
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    
    // Forces a redraw after 100ms in case mobile renders it at 0 height initially
    const timer = setTimeout(() => {
      if (el) setSize({ w: el.clientWidth, h: el.clientHeight });
    }, 100);

    return () => {
      ro.disconnect();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr;
    cv.height = size.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // MT5 Light Theme Hardcoded Fallbacks
    const cBg = "#ffffff";
    const cGrid = "#f0f3fa";
    const cText = "#333333";
    const cBull = "#089981"; // MT5 Green
    const cBear = "#F23645"; // MT5 Red
    const cAxisBg = "#f8f9fa";
    const cCross = "#999999";

    const W = size.w,
      H = size.h,
      axisW = 64,
      axisH = 20;
    const plotW = W - axisW,
      plotH = H - axisH;
    const all = e.candles[symbol][tf];
    const sp = view.current.spacing;
    const count = Math.max(5, Math.floor((plotW - 12) / sp));
    const end = all.length - view.current.offset;
    const bars = all.slice(Math.max(0, end - count), end);

    let lo = Infinity,
      hi = -Infinity;
    for (const b of bars) {
      lo = Math.min(lo, b.l);
      hi = Math.max(hi, b.h);
    }
    if (view.current.offset === 0) {
      lo = Math.min(lo, q.bid);
      hi = Math.max(hi, q.ask);
    }
    const pad = (hi - lo) * 0.08 || s.point * 10;
    lo -= pad;
    hi += pad;
    const y = (p: number) => plotH - ((p - lo) / (hi - lo)) * plotH;
    const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

    // Backgrounds
    ctx.fillStyle = cBg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = cAxisBg;
    ctx.fillRect(plotW, 0, axisW, H); // Price Axis Background
    
    ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    ctx.textBaseline = "middle";

    // Grid & Price Axis
    const steps = Math.max(3, Math.floor(plotH / 50));
    ctx.strokeStyle = cGrid;
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let i = 0; i <= steps; i++) {
      const p = lo + ((hi - lo) * i) / steps;
      const yy = Math.round(y(p)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(plotW, yy);
      ctx.stroke();
      ctx.fillStyle = cText;
      ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
    }

    // Time Axis
    const every = Math.max(1, Math.round(90 / sp));
    for (let i = bars.length - 1; i >= 0; i -= every) {
      const xx = Math.round(xOf(i)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(xx, 0);
      ctx.lineTo(xx, plotH);
      ctx.stroke();
      const d = new Date(bars[i].t * 1000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      const lbl =
        TIMEFRAMES[tf] >= 3600
          ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${p2(d.getHours())}:00`
          : `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      ctx.fillStyle = cText;
      ctx.fillText(lbl, xx - 18, plotH + 10);
    }

    // Candlesticks
    const bw = Math.max(1, Math.floor(sp * 0.6)); // Slightly wider body relative to spacing
    bars.forEach((b, i) => {
      const x = Math.round(xOf(i));
      const bull = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
      // Wicks
      ctx.beginPath();
      ctx.moveTo(x + 0.5, y(b.h));
      ctx.lineTo(x + 0.5, y(b.l));
      ctx.stroke();
      // Bodies
      const top = y(Math.max(b.o, b.c));
      const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      if (bw <= 2) return;
      ctx.fillRect(x - bw / 2, top, bw, bh);
    });

    const hLine = (p: number, color: string, label: string, dash: number[] = [], filled = false) => {
      if (p < lo || p > hi) return;
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      ctx.moveTo(0, yy);
      ctx.lineTo(plotW, yy);
      ctx.stroke();
      ctx.setLineDash([]);
      if (filled) {
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - 8, axisW, 16);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
      }
      if (label) {
        ctx.fillStyle = color;
        ctx.fillText(label, 6, yy - 8);
      }
    };

    // Orders & Positions Overlay
    for (const p of e.positions.filter((x) => x.symbol === symbol)) {
      hLine(
        p.openPrice,
        p.side === "buy" ? cBull : cBear,
        `#${p.ticket} ${p.side} ${p.lots.toFixed(2)}  ${e.profitOf(p).toFixed(2)}`,
        [6, 3]
      );
      if (p.sl) hLine(p.sl, "#F23645", `#${p.ticket} sl`, [3, 3]);
      if (p.tp) hLine(p.tp, "#089981", `#${p.ticket} tp`, [3, 3]);
    }
    for (const o of e.orders.filter((x) => x.symbol === symbol)) {
      hLine(o.price, cText, `#${o.ticket} ${o.type.replace("_", " ")} ${o.lots.toFixed(2)}`, [8, 4]);
    }
    
    // Bid / Ask Lines
    hLine(q.ask, "#F23645", "", [], true);
    hLine(q.bid, "#089981", "", [], true);

    // Crosshair
    const m = mouse.current;
    if (m && m.x < plotW && m.y < plotH && !drag.current) {
      ctx.strokeStyle = cCross;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(m.x + 0.5, 0);
      ctx.lineTo(m.x + 0.5, plotH);
      ctx.moveTo(0, m.y + 0.5);
      ctx.lineTo(plotW, m.y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      const price = lo + ((plotH - m.y) / plotH) * (hi - lo);
      ctx.fillStyle = "#555555";
      ctx.fillRect(plotW, m.y - 8, axisW, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(price.toFixed(s.digits), plotW + 4, m.y);
    }

    ctx.strokeStyle = cGrid;
    ctx.strokeRect(0.5, 0.5, plotW, plotH);
  });

  const total = e.candles[symbol][tf].length;

  // ─── TOUCH & PINCH EVENTS ───
  const handleTouchStart = (ev: React.TouchEvent) => {
    if (ev.touches.length === 2) {
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      pinch.current = { dist: Math.sqrt(dx * dx + dy * dy), spacing: view.current.spacing };
    }
  };

  const handleTouchMove = (ev: React.TouchEvent) => {
    if (ev.touches.length === 2 && pinch.current) {
      ev.preventDefault();
      const dx = ev.touches[0].clientX - ev.touches[1].clientX;
      const dy = ev.touches[0].clientY - ev.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const scale = dist / pinch.current.dist;
      view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * scale));
      setRedraw((x) => x + 1);
    }
  };

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full touch-none overflow-hidden"
      onWheel={(ev) => {
        view.current.spacing = Math.min(
          30,
          Math.max(2, view.current.spacing * (ev.deltaY < 0 ? 1.15 : 0.87))
        );
        setRedraw((x) => x + 1);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={() => { pinch.current = null; }}
      onPointerDown={(ev) => {
        if (ev.pointerType === "mouse" || ev.pointerType === "pen") {
          drag.current = { x: ev.clientX, off: view.current.offset };
          (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId);
        }
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => {
        mouse.current = null;
        setRedraw((x) => x + 1);
      }}
      onPointerMove={(ev) => {
        const r = wrapRef.current!.getBoundingClientRect();
        mouse.current = { x: ev.clientX - r.left, y: ev.clientY - r.top };
        if (drag.current) {
          const d = Math.round((ev.clientX - drag.current.x) / view.current.spacing);
          view.current.offset = Math.max(0, Math.min(total - 10, drag.current.off + d));
        }
        setRedraw((x) => x + 1);
      }}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ width: size.w, height: size.h }}
      />
      {/* Top left chart label */}
      <div
        className="pointer-events-none absolute left-2 top-1 text-[11px] font-bold"
        style={{ color: "#333333" }}
      >
        {symbol}, {tf}: {s.desc}
      </div>
    </div>
  );
}
