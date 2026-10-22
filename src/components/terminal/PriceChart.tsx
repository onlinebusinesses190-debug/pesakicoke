import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

export function PriceChart({ engine, symbol, tf, zoom, showCrosshair = false, chartType = "candle" }: { engine: any, symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: "candle" | "line" }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // View state for zoom and scroll
  const view = useRef({ spacing: 5, offset: 0 });
  
  // Interaction Refs
  const dragRef = useRef<{ startX: number; startOffset: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startSpacing: number } | null>(null);
  
  const loRef = useRef<number>(0);
  const hiRef = useRef<number>(0);
  const displayBid = useRef<number | null>(null);
  const displayAsk = useRef<number | null>(null);

  // Sync zoom with parent state
  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 5 * zoom));
  }, [zoom]);

  // Reset on symbol/tf change
  useEffect(() => {
    view.current.offset = 0;
    loRef.current = 0; hiRef.current = 0;
    displayBid.current = null; displayAsk.current = null;
  }, [symbol, tf]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width || window.innerWidth, h: rect.height || (window.innerHeight * 0.6) });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const t1 = setTimeout(measure, 100);
    return () => { ro.disconnect(); clearTimeout(t1); };
  }, []);

  // ─── INTERACTION HANDLERS ───
  const handlePointerDown = (e: React.PointerEvent) => {
    // Only start drag if it's a primary button (left click) or touch
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startOffset: view.current.offset };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    // Calculate how many candles to shift based on drag distance
    const candleShift = Math.round(-dx / view.current.spacing);
    
    const all = engine?.candles?.[symbol]?.[tf] || [];
    const maxOffset = Math.max(0, all.length - 10); // Keep at least 10 candles visible
    
    // Clamp the offset so we don't scroll into the void
    view.current.offset = Math.max(0, Math.min(maxOffset, dragRef.current.startOffset + candleShift));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom in/out with mouse wheel
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * zoomFactor));
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchRef.current = { startDist: dist, startSpacing: view.current.spacing };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const scale = dist / pinchRef.current.startDist;
      view.current.spacing = Math.min(30, Math.max(2, pinchRef.current.startSpacing * scale));
    }
  };

  const handleTouchEnd = () => {
    pinchRef.current = null;
  };

  // ─── DRAWING LOOP ───
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || size.w === 0 || size.h === 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      
      const q = engine?.quotes?.[symbol];
      const spec = engine?.spec(symbol);
      const all = engine?.candles?.[symbol]?.[tf] || [];

      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.floor(size.w * dpr);
      cv.height = Math.floor(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      const cBg = "#ffffff", cGrid = "#f0f3fa", cText = "#000000", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
      const W = size.w, H = size.h, axisW = 64, axisH = 22;
      const plotW = W - axisW, plotH = H - axisH;

      ctx.fillStyle = cBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);

      if (!q || !spec || all.length === 0) return;

      // Smooth live price
      if (displayBid.current === null) {
        displayBid.current = q.bid;
        displayAsk.current = q.ask;
      } else {
        displayBid.current += (q.bid - displayBid.current) * 0.15;
        displayAsk.current += (q.ask - displayAsk.current) * 0.15;
      }
      const smoothBid = displayBid.current;
      const smoothAsk = displayAsk.current;
      const smoothMid = (smoothBid + smoothAsk) / 2;

      const sp = view.current.spacing;
      const count = Math.max(5, Math.floor((plotW - 12) / sp));
      const end = all.length - view.current.offset;
      let bars = all.slice(Math.max(0, end - count), end);

      // Update live candle ONLY if we are at the live edge (offset === 0)
      if (view.current.offset === 0 && bars.length > 0) {
        const last = bars[bars.length - 1];
        bars = [...bars];
        bars[bars.length - 1] = { ...last, c: smoothMid, h: Math.max(last.h, smoothMid, smoothAsk), l: Math.min(last.l, smoothMid, smoothBid) };
      }

      let lo = Infinity, hi = -Infinity;
      for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }

      const symbolPositions = engine.positions?.filter((x: any) => x.symbol === symbol) || [];
      for (const p of symbolPositions) {
        if (p.sl) { lo = Math.min(lo, p.sl); hi = Math.max(hi, p.sl); }
        if (p.tp) { lo = Math.min(lo, p.tp); hi = Math.max(hi, p.tp); }
      }

      // Include Bid/Ask in scale ONLY if we are at the live edge
      if (view.current.offset === 0) { lo = Math.min(lo, smoothBid); hi = Math.max(hi, smoothAsk); }
      
      const pad = (hi - lo) * 0.15 || spec.point * 10;
      const rawLo = lo - pad, rawHi = hi + pad;

      if (loRef.current === 0 && hiRef.current === 0) {
        loRef.current = rawLo; hiRef.current = rawHi;
      }
      loRef.current += (rawLo - loRef.current) * 0.15;
      hiRef.current += (rawHi - hiRef.current) * 0.15;

      const smoothLo = loRef.current;
      const smoothHi = hiRef.current;
      const y = (p: number) => plotH - ((p - smoothLo) / (smoothHi - smoothLo)) * plotH;
      const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

      // ─── Y-AXIS ───
      ctx.font = "11px Arial, sans-serif"; 
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const targetPixels = 24; 
      const rawStep = (smoothHi - smoothLo) / (plotH / targetPixels);
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      let niceNorm = 1;
      if (norm > 5) niceNorm = 10; else if (norm > 2) niceNorm = 5; else if (norm > 1) niceNorm = 2;
      const step = niceNorm * mag;

      ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      const startLine = Math.ceil(smoothLo / step) * step;
      for (let p = startLine; p <= smoothHi; p += step) {
        const yy = Math.round(y(p)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.fillStyle = cText; 
        ctx.fillText(p.toFixed(spec.digits), plotW + 4, yy);
      }

      // ─── X-AXIS ───
      ctx.textAlign = "center";
      const every = Math.max(1, Math.round(90 / sp));
      let lastLabelX = -100;
      for (let i = bars.length - 1; i >= 0; i -= every) {
        const xx = Math.round(xOf(i)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
        if (lastLabelX - xx > 70) {
          const d = new Date(bars[i].t * 1000);
          const p2 = (n: number) => String(n).padStart(2, "0");
          const day = p2(d.getDate());
          const month = d.toLocaleString("en", { month: "short" });
          const lbl = `${day} ${month} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
          ctx.fillStyle = cText; 
          ctx.fillText(lbl, xx, plotH + 12);
          lastLabelX = xx;
        }
      }
      ctx.textAlign = "left";

      // ─── CANDLES ───
      ctx.setLineDash([]);
      const bw = Math.max(1, Math.floor(sp * 0.6));
      bars.forEach((b: any, i: number) => {
        const x = Math.round(xOf(i)); const bull = b.c >= b.o;
        ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
        ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
        const top = y(Math.max(b.o, b.c)); const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
        if (bw > 2) ctx.fillRect(x - bw / 2, top, bw, bh);
      });

      // ─── TOP-LEFT TEXT OVERLAY ───
      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText(spec.desc || "", 8, 30);

      // ─── POSITION LINES ───
      symbolPositions.forEach((p: any) => {
        if (p.openPrice < smoothLo || p.openPrice > smoothHi) return;
        const yy = Math.round(y(p.openPrice)) + 0.5;
        const pnl = engine.profitOf(p);
        
        ctx.strokeStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.setLineDash([]);

        const txt = `${p.side.toUpperCase()} ${p.lots.toFixed(2)}   ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
        const txtWidth = ctx.measureText(txt).width;
        
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(4, yy - 16, txtWidth + 8, 16);
        
        ctx.fillStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.fillText(txt, 8, yy - 8);
      });

      // ─── BID / ASK BOXES ───
      const drawBox = (p: number, color: string, timerText: string = "") => {
        if (p < smoothLo || p > smoothHi) return;
        const yy = Math.round(y(p)) + 0.5;
        
        ctx.strokeStyle = color; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - (timerText ? 10 : 8), axisW, timerText ? 20 : 16);
        
        ctx.fillStyle = "#ffffff"; 
        ctx.font = "11px Arial, sans-serif"; 
        ctx.fillText(p.toFixed(spec.digits), plotW + 4, yy - (timerText ? 4 : 0));
        
        if (timerText) {
          ctx.font = "10px Arial, sans-serif"; 
          ctx.fillText(timerText, plotW + 4, yy + 6);
        }
      };

      const tfSeconds = TIMEFRAMES[tf];
      const now = Date.now() / 1000;
      let timerStr = "";
      if (all.length > 0 && view.current.offset === 0) {
        const lastCandle = all[all.length - 1];
        const candleCloseTime = lastCandle.t + tfSeconds;
        const remaining = candleCloseTime - now;
        if (remaining > 0 && remaining <= tfSeconds) {
          timerStr = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`;
        }
      }

      // Only draw the live price lines if we are at the live edge (or close to it)
      if (view.current.offset === 0) {
        drawBox(smoothAsk, cBear);
        drawBox(smoothBid, cBull, timerStr);
      }
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size.w, size.h, engine, symbol, tf]);

  return (
    <div 
      ref={wrapRef} 
      className="absolute inset-0 touch-none overflow-hidden bg-white overscroll-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block cursor-crosshair" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
