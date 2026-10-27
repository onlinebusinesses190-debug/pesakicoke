import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

export function PriceChart({ engine, symbol, tf, zoom, showCrosshair = false, chartType = "candle" }: { engine: any, symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: "candle" | "line" }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Zoom and pan state
  const panRef = useRef({ x: 0, y: 0, scale: 1 });
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const lastLabelY = useRef<number | null>(null);

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
    
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const clientX = e instanceof MouseEvent ? e.clientX : e.touches[0].clientX;
      const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0].clientY;
      lastPointer.current = { x: clientX, y: clientY };
      
      const handlePointerMove = (moveEvent: MouseEvent | TouchEvent) => {
        moveEvent.preventDefault();
        const moveX = moveEvent instanceof MouseEvent ? moveEvent.clientX : moveEvent.touches[0].clientX;
        const moveY = moveEvent instanceof MouseEvent ? moveEvent.clientY : moveEvent.touches[0].clientY;
        if (lastPointer.current) {
          panRef.current.x += (moveX - lastPointer.current.x) / panRef.current.scale;
          panRef.current.y += (moveY - lastPointer.current.y) / panRef.current.scale;
          lastPointer.current = { x: moveX, y: moveY };
          // Redraw to apply pan
          cv && requestAnimationFrame(draw);
        }
      };
      
      const handlePointerUp = () => {
        lastPointer.current = null;
        document.removeEventListener('pointermove', handlePointerMove as any);
        document.removeEventListener('pointerup', handlePointerUp);
        document.removeEventListener('touchend', handlePointerUp);
      };
      
      document.addEventListener('pointermove', handlePointerMove as any);
      document.addEventListener('pointerup', handlePointerUp);
      document.addEventListener('touchend', handlePointerUp);
    };
    
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scaleFactor = e.deltaY > 0 ? 0.95 : 1.05;
      const oldScale = panRef.current.scale;
      panRef.current.scale *= scaleFactor;
      panRef.current.scale = Math.max(0.5, Math.min(3, panRef.current.scale));
      
      // Adjust pan to zoom around mouse position
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      panRef.current.x = mouseX - (mouseX - panRef.current.x) * (panRef.current.scale / oldScale);
      panRef.current.y = mouseY - (mouseY - panRef.current.y) * (panRef.current.scale / oldScale);
      
      cv && requestAnimationFrame(draw);
    };
    
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length === 2) {
        // Pinch zoom
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        pinch.current = {
          dist: Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY),
          spacing: panRef.current.spacing,
        };
      }
    };
    
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      if (pinch.current && e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const newDist = Math.hypot(touch2.clientX - touch1.clientX, touch2.clientY - touch1.clientY);
        const scaleFactor = newDist / pinch.current.dist;
        panRef.current.spacing *= scaleFactor;
        view.current.spacing = Math.min(30, Math.max(2, 5 * zoom));
        cv && requestAnimationFrame(draw);
        pinch.current.dist = newDist;
      }
    };
    
    const handleTouchEnd = () => {
      pinch.current = null;
    };
    
    el.addEventListener('pointerdown', handlePointerDown as any);
    el.addEventListener('wheel', handleWheel, { passive: false });
    el.addEventListener('touchstart', handleTouchStart, { passive: false });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      el.removeEventListener('pointerdown', handlePointerDown as any);
      el.removeEventListener('wheel', handleWheel);
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [zoom]);

  const draw = () => {
    const cv = canvasRef.current;
    if (!cv || size.w === 0 || size.h === 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    // Apply pan and zoom transformations
    const { x: panX, y: panY, scale: zoomScale } = panRef.current;
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(zoomScale, zoomScale);
    
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.floor(size.w * dpr);
    cv.height = Math.floor(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const cBg = "#ffffff", cGrid = "#e5e5e5", cText = "#000000", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
    const W = size.w, H = size.h, axisW = 64, axisH = 22;
    const plotW = W - axisW, plotH = H - axisH;

    // Clear and draw background with transformations
    ctx.fillStyle = cBg; ctx.fillRect(0, 0, plotW, plotH);
    ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);

    const q = engine?.quotes?.[symbol];
    const spec = engine?.spec(symbol);
    const all = engine?.candles?.[symbol]?.[tf] || [];

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

    // ─── Y-AXIS (Forced 11px Font) ───
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
    let lastLabelY = null;
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
        // FIX: Add 15px vertical offset if label Y is similar to previous one
        let labelY = plotH + 12;
        if (lastLabelY !== null) {
          const yDiff = Math.abs(labelY - lastLabelY);
          if (yDiff < 30) {
            labelY += 15;
          }
        }
        lastLabelY = labelY;
        ctx.fillText(lbl, xx, labelY);
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
    // FIX: Use string concatenation to avoid arrow character corruption
    ctx.fillText(`${symbol} ${'▼'} ${tf}`, 8, 15);
    ctx.fillStyle = "#666";
    ctx.font = "11px Arial, sans-serif";
    ctx.fillText(spec.desc || "", 8, 30);

    // ─── POSITION LINES (Dashed with white bg) ───
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
      
      // White bg for text
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
    
    ctx.restore();
  };

    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [size.w, size.h, engine, symbol, tf]);

  return (
    <div ref={wrapRef} className="absolute inset-0 touch-none overflow-hidden bg-white" style={{ touchAction: 'none' }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
