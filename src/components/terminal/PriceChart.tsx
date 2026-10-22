import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

export function PriceChart({ engine, symbol, tf, zoom, showCrosshair = false, chartType = "candle" }: { engine: any, symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: "candle" | "line" }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const view = useRef({ spacing: 5, offset: 0 });
  const pinch = useRef<{ dist: number; spacing: number } | null>(null);
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
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";

      const cBg = "#ffffff", cGrid = "#f0f3fa", cText = "#000000", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
      const W = size.w, H = size.h, axisW = 64, axisH = 20;
      const plotW = W - axisW, plotH = H - axisH;

      ctx.fillStyle = cBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);

      if (!q || !spec || all.length === 0) return;

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

      if (view.current.offset === 0) {
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

      // FORCE NORMAL FONT SIZE (Fixes the massive text bug)
      ctx.font = "11px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"; 

      // Y-AXIS
      const targetPixels = 22; 
      const rawStep = (smoothHi - smoothLo) / (plotH / targetPixels);
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      let niceNorm = 1;
      if (norm > 5) niceNorm = 10; else if (norm > 2) niceNorm = 5; else if (norm > 1) niceNorm = 2;
      const step = niceNorm * mag;

      ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([]);
      const startLine = Math.ceil(smoothLo / step) * step;
      for (let p = startLine; p <= smoothHi; p += step) {
        const yy = Math.round(y(p)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.fillStyle = cText; 
        ctx.fillText(p.toFixed(spec.digits), plotW + 4, yy);
      }

      // X-AXIS
      const every = Math.max(1, Math.round(80 / sp));
      let lastLabelX = -100;
      for (let i = bars.length - 1; i >= 0; i -= every) {
        const xx = Math.round(xOf(i)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
        if (lastLabelX - xx > 60) {
          const d = new Date(bars[i].t * 1000);
          const p2 = (n: number) => String(n).padStart(2, "0");
          const lbl = `${p2(d.getDate())} Oct ${p2(d.getHours())}:${p2(d.getMinutes())}`;
          ctx.fillStyle = cText; 
          ctx.fillText(lbl, xx - 30, plotH + 12);
          lastLabelX = xx;
        }
      }

      // CANDLES
      const bw = Math.max(1, Math.floor(sp * 0.6));
      bars.forEach((b: any, i: number) => {
        const x = Math.round(xOf(i)); const bull = b.c >= b.o;
        ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
        ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
        const top = y(Math.max(b.o, b.c)); const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
        if (bw > 2) ctx.fillRect(x - bw / 2, top, bw, bh);
      });

      // TEXT OVERLAY
      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "10px -apple-system, sans-serif";
      ctx.fillText(spec.desc || "", 8, 28);

      // CHART LINES & PRICE BOXES
      const drawSolidPriceBox = (p: number, color: string, timerText: string = "") => {
        if (p < smoothLo || p > smoothHi) return;
        const yy = Math.round(y(p)) + 0.5;
        
        // Solid Line
        ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.lineWidth = 1;
        
        // Price Box
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - 10, axisW, timerText ? 20 : 16);
        
        // Text
        ctx.fillStyle = "#ffffff"; 
        ctx.font = "11px -apple-system, sans-serif"; 
        ctx.fillText(p.toFixed(spec.digits), plotW + 4, yy - (timerText ? 4 : 0));
        
        if (timerText) {
          ctx.font = "10px -apple-system, sans-serif"; 
          ctx.fillText(timerText, plotW + 4, yy + 6);
        }
      };

      const drawPositionLine = (p: any) => {
        if (p.openPrice < smoothLo || p.openPrice > smoothHi) return;
        const yy = Math.round(y(p.openPrice)) + 0.5;
        const pnl = engine.profitOf(p);
        const pnlStr = pnl >= 0 ? `+${pnl.toFixed(2)}` : `${pnl.toFixed(2)}`;
        
        ctx.strokeStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.font = "11px -apple-system, sans-serif";
        
        // White background for text
        const txt = `${p.side.toUpperCase()} ${p.lots.toFixed(2)} ${pnlStr} USD`;
        const txtWidth = ctx.measureText(txt).width;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(4, yy - 14, txtWidth + 8, 14);
        
        ctx.fillStyle = p.side === "buy" ? "#1565c0" : "#c62828";
        ctx.fillText(txt, 8, yy - 6);
      };

      symbolPositions.forEach(drawPositionLine);

      // TIMER
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

      drawSolidPriceBox(smoothAsk, cBear);
      drawSolidPriceBox(smoothBid, cBull, timerStr);
    };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size.w, size.h, engine, symbol, tf]);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none overflow-hidden bg-white">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
