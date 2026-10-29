import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

export function PriceChart({ engine, symbol, tf, zoom, showCrosshair = false, chartType = "candle" }: { engine: any, symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: "candle" | "line" }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const view = useRef({ spacing: 5, offset: 0 });
  const pinch = useRef<{ dist: number; spacing: number } | null>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null); // Restored for panning
  
  const loRef = useRef<number>(0);
  const hiRef = useRef<number>(0);
  const displayBid = useRef<number | null>(null);
  const displayAsk = useRef<number | null>(null);

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 5 * zoom));
  }, [zoom]);

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
      
      const cBg = "#ffffff", cGrid = "#e5e5e5", cText = "#000000", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
      const W = size.w, H = size.h, axisW = 64, axisH = 22;
      const plotW = W - axisW, plotH = H - axisH;

      ctx.fillStyle = cBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);

      if (!q || !spec || all.length === 0) return;

      if (displayBid.current === null || displayAsk.current === null) {
        displayBid.current = q.bid;
        displayAsk.current = q.ask;
      } else {
        displayBid.current += (q.bid - displayBid.current) * 0.15;
        displayAsk.current += (q.ask - displayAsk.current) * 0.15;
      }
      const smoothBid = displayBid.current!;
      const smoothAsk = displayAsk.current!;
      const smoothMid = (smoothBid + smoothAsk) / 2;

      const sp = view.current.spacing;
      const count = Math.max(5, Math.floor((plotW - 12) / sp));
      const end = all.length - view.current.offset;
      let bars = all.slice(Math.max(0, end - count), end);

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

      if (view.current.offset === 0) { lo = Math.min(lo, smoothBid); hi = Math.max(hi, smoothAsk); }
      
      const priceRange = hi - lo;
      const minRange = spec.point * 100;
      const pad = priceRange * 0.15 || minRange;
      const rawLo = lo - Math.max(pad, minRange), rawHi = hi + Math.max(pad, minRange);

      if (loRef.current === 0 && hiRef.current === 0) {
        loRef.current = rawLo; hiRef.current = rawHi;
      }
      loRef.current += (rawLo - loRef.current) * 0.15;
      hiRef.current += (rawHi - hiRef.current) * 0.15;

      const smoothLo = loRef.current;
      const smoothHi = hiRef.current;
      const smoothRange = Math.max(smoothHi - smoothLo, spec.point * 100);
      const y = (p: number) => plotH - ((p - smoothLo) / smoothRange) * plotH;
      const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

      // ─── Y-AXIS ───
      ctx.font = "11px Arial, sans-serif"; 
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const targetPixels = 24;
      const rawStep = smoothRange / (plotH / targetPixels);
      const safeStep = Math.max(rawStep, spec.point * 0.1);
      const mag = Math.pow(10, Math.floor(Math.log10(safeStep)));
      const norm = safeStep / mag;
      let niceNorm = 1;
      if (norm > 5) niceNorm = 10; else if (norm > 2) niceNorm = 5; else if (norm > 1) niceNorm = 2;
      const step = Math.max(niceNorm * mag, spec.point * 0.1);
      const safeStart = Math.ceil(smoothLo / step) * step;

      ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      for (let p = safeStart; p <= smoothHi; p += step) {
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

      // ─── CHART TOP-LEFT TEXT OVERLAY ───
      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText(spec.desc || "", 8, 30);

      // ─── POSITION LINES (Fixed Overlap) ───
      const drawnLabelYs: number[] = []; // Track drawn labels to prevent overlap
      
      symbolPositions.forEach((p: any) => {
        if (p.openPrice < smoothLo || p.openPrice > smoothHi) return;
        const yy = Math.round(y(p.openPrice)) + 0.5;
        const pnl = engine.profitOf(p);
        
        // Draw dashed line at the exact price
        ctx.strokeStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.setLineDash([]);

        // Determine label Y, offsetting if it overlaps
        let labelY = yy - 8;
        while (drawnLabelYs.some((ly) => Math.abs(ly - labelY) < 16)) {
          labelY += 16; // Push down by 16px
        }
        drawnLabelYs.push(labelY);

        const txt = `${p.side.toUpperCase()} ${p.lots.toFixed(2)}   ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
        const txtWidth = ctx.measureText(txt).width;
        
        // Draw white background for text
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(4, labelY - 8, txtWidth + 8, 16);
        
        // Draw text
        ctx.fillStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.fillText(txt, 8, labelY);
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
      if (all.length > 0) {
        const lastCandle = all[all.length - 1];
        const candleCloseTime = lastCandle.t + tfSeconds;
        const remaining = candleCloseTime - now;
        if (remaining > 0 && remaining <= tfSeconds) {
          timerStr = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`;
        }
      }

      drawBox(smoothAsk, cBear);
      drawBox(smoothBid, cBull, timerStr);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size.w, size.h, engine, symbol, tf]);

  return (
    <div 
      ref={wrapRef} 
      className="absolute inset-0 touch-none overflow-hidden bg-white cursor-crosshair"
      onWheel={(ev) => {
        ev.preventDefault();
        // Zoom in/out with mouse wheel
        const zoomFactor = ev.deltaY < 0 ? 1.15 : 0.85;
        view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * zoomFactor));
      }}
      onPointerDown={(ev) => {
        if (ev.pointerType === "mouse" || ev.pointerType === "pen") {
          drag.current = { x: ev.clientX, offset: view.current.offset };
          (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
        }
      }}
      onPointerMove={(ev) => {
        if (!drag.current) return;
        const dx = ev.clientX - drag.current.x;
        const candles = engine?.candles?.[symbol]?.[tf] || [];
        const maxOffset = Math.max(0, candles.length - 10);
        // Calculate candle shift based on drag distance
        const candleShift = Math.round(-dx / view.current.spacing);
        view.current.offset = Math.max(0, Math.min(maxOffset, drag.current.offset + candleShift));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onTouchStart={(ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinch.current = { dist: Math.sqrt(dx * dx + dy * dy), spacing: view.current.spacing };
        } else if (ev.touches.length === 1) {
          drag.current = { x: ev.touches[0].clientX, offset: view.current.offset };
        }
      }}
      onTouchMove={(ev) => {
        if (ev.touches.length === 2 && pinch.current) {
          ev.preventDefault();
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const scale = dist / pinch.current.dist;
          view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * scale));
        } else if (ev.touches.length === 1 && drag.current) {
          const dx = ev.touches[0].clientX - drag.current.x;
          const candles = engine?.candles?.[symbol]?.[tf] || [];
          const maxOffset = Math.max(0, candles.length - 10);
          const candleShift = Math.round(-dx / view.current.spacing);
          view.current.offset = Math.max(0, Math.min(maxOffset, drag.current.offset + candleShift));
        }
      }}
      onTouchEnd={() => { pinch.current = null; drag.current = null; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
