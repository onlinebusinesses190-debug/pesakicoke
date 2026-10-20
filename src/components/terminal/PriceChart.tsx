import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export function PriceChart({ symbol, tf, zoom, showCrosshair = false, showIndicators = false, chartType = "candle" }: { symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: "candle" | "line" }) {
  const e = useEngine();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const view = useRef({ spacing: 5, offset: 0 });
  const pinch = useRef<{ dist: number; spacing: number } | null>(null);
  const crosshair = useRef<{ x: number; y: number } | null>(null);
  const loRef = useRef<number>(0);
  const hiRef = useRef<number>(0);
  const symbolRef = useRef(symbol);
  const tfRef = useRef(tf);
  const [, setRedraw] = useState(0);
  const needsRedrawRef = useRef(true);

  symbolRef.current = symbol;
  tfRef.current = tf;

  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 5 * zoom));
    needsRedrawRef.current = true;
  }, [zoom]);

  useEffect(() => {
    view.current.offset = 0;
    needsRedrawRef.current = true;
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
    if (!cv) return;

    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let frameId: number;

    const draw = () => {
      frameId = requestAnimationFrame(draw);

      if (!cv || size.w === 0 || size.h === 0) return;

      const all = e.candles?.[symbolRef.current]?.[tfRef.current] || [];
      if (!q) return;

      const dpr = window.devicePixelRatio || 1;
      cv.width = Math.floor(size.w * dpr);
      cv.height = Math.floor(size.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cBg = "#ffffff", cGrid = "#f0f3fa", cText = "#333333", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
      const W = size.w, H = size.h, axisW = 64, axisH = 20;
      const plotW = W - axisW, plotH = H - axisH;
      const sp = view.current.spacing;
      const count = Math.max(5, Math.floor((plotW - 12) / sp));
      const end = all.length - view.current.offset;
      let bars = all.slice(Math.max(0, end - count), end);

      // ─── 1. LIVE CANDLE UPDATE ───
      // Update the right-most candle's O,H,L,C from the live quote on every frame
      if (bars.length > 0 && view.current.offset === 0 && q) {
        const last = bars[bars.length - 1];
        const mid = (q.bid + q.ask) / 2;
        bars = [...bars];
        bars[bars.length - 1] = {
          ...last,
          c: mid,
          h: Math.max(last.h, mid, q.ask),
          l: Math.min(last.l, mid, q.bid),
        };
      }

      ctx.fillStyle = cBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);

      if (bars.length === 0) return;

      let lo = Infinity, hi = -Infinity;
      for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }

      const symbolPositions = e.positions.filter((x) => x.symbol === symbol);
      for (const p of symbolPositions) {
        if (p.sl) { lo = Math.min(lo, p.sl); hi = Math.max(hi, p.sl); }
        if (p.tp) { lo = Math.min(lo, p.tp); hi = Math.max(hi, p.tp); }
      }

      if (view.current.offset === 0) { lo = Math.min(lo, q.bid); hi = Math.max(hi, q.ask); }
      const pad = (hi - lo) * 0.18 || s.point * 10;
      const rawLo = lo - pad, rawHi = hi + pad;

      // ─── 2. SMOOTH Y-AXIS AUTO-SCALING ───
      // Linear interpolation toward target bounds
      if (loRef.current === 0 && hiRef.current === 0) {
        loRef.current = rawLo;
        hiRef.current = rawHi;
      }
      const smoothFactor = 0.15;
      loRef.current += (rawLo - loRef.current) * smoothFactor;
      hiRef.current += (rawHi - hiRef.current) * smoothFactor;

      const smoothLo = loRef.current;
      const smoothHi = hiRef.current;
      const y = (p: number) => plotH - ((p - smoothLo) / (smoothHi - smoothLo)) * plotH;
      const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

      ctx.font = "11px -apple-system, sans-serif"; ctx.textBaseline = "middle";

      // ─── Y-AXIS GRID + LABELS ───
      const targetPixels = 35;
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
        ctx.fillStyle = "#000000"; ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
      }

      // X-axis time labels with date
      const every = Math.max(1, Math.round(80 / sp));
      for (let i = bars.length - 1; i >= 0; i -= every) {
        const xx = Math.round(xOf(i)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
        const d = new Date(bars[i].t * 1000);
        const p2 = (n: number) => String(n).padStart(2, "0");
        const day = p2(d.getDate());
        const month = d.toLocaleString("en", { month: "short" });
        const lbl = `${day} ${month} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
        ctx.fillStyle = cText; ctx.fillText(lbl, xx - 24, plotH + 12);
      }

      const bw = Math.max(1, Math.floor(sp * 0.6));
      if (chartType === "line") {
        ctx.strokeStyle = "#1565c0";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < bars.length; i++) {
          const xx = xOf(i);
          const yy = y(bars[i].c);
          if (i === 0) ctx.moveTo(xx, yy);
          else ctx.lineTo(xx, yy);
        }
        ctx.stroke();
      } else {
        bars.forEach((b, i) => {
          const x = Math.round(xOf(i)); const bull = b.c >= b.o;
          ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
          ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
          const top = y(Math.max(b.o, b.c)); const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
          if (bw > 2) ctx.fillRect(x - bw / 2, top, bw, bh);
        });
      }

      // Top-left label
      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px -apple-system, sans-serif";
      ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "10px -apple-system, sans-serif";
      ctx.fillText(s.desc || "", 8, 28);

      // Overlays
      const drawSolidLine = (p: number, color: string) => {
        if (p < smoothLo || p > smoothHi) return;
        const yy = Math.round(y(p)) + 0.5;
        ctx.strokeStyle = color; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.fillStyle = "#000000"; ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
      };

      const drawDashedLine = (p: number, color: string, labelLeft: string) => {
        if (p < smoothLo || p > smoothHi) return;
        const yy = Math.round(y(p)) + 0.5;
        ctx.strokeStyle = color; ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.setLineDash([]);

        ctx.strokeStyle = color; ctx.strokeRect(plotW, yy - 8, axisW, 16);
        ctx.fillStyle = "#333";
        ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);

        if (labelLeft) {
          ctx.fillStyle = color;
          const textWidth = ctx.measureText(labelLeft).width;
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(4, yy - 16, textWidth + 6, 16);
          ctx.fillStyle = color;
          ctx.fillText(labelLeft, 7, yy - 6);
        }
      };

      // Draw positions
      for (const p of symbolPositions) {
        const pnl = e.profitOf(p);
        const pnlText = `${p.side.toUpperCase()} ${p.lots.toFixed(2)} Lots  ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
        drawDashedLine(p.openPrice, p.side === "buy" ? cBull : cBear, pnlText);
        if (p.sl) drawDashedLine(p.sl, cBear, "SL");
        if (p.tp) drawDashedLine(p.tp, cBull, "TP");
      }

      drawSolidLine(q.ask, cBear);
      drawSolidLine(q.bid, cBull);

      // ─── CANDLE COUNTDOWN TIMER ───
      // Displayed in the right-side Y-axis, inside/near the bid price box
      const tfSeconds = TIMEFRAMES[tfRef.current];
      const now = Date.now() / 1000;
      if (all.length > 0) {
        const lastCandle = all[all.length - 1];
        const candleCloseTime = lastCandle.t + tfSeconds;
        const remaining = candleCloseTime - now;
        if (remaining > 0 && remaining <= tfSeconds) {
          const mins = Math.floor(remaining / 60);
          const secs = Math.floor(remaining % 60);
          const p2 = (n: number) => String(n).padStart(2, "0");
          const timerText = `${p2(mins)}:${p2(secs)}`;
          const bidY = Math.round(y(q.bid)) + 0.5;
          ctx.fillStyle = "#000000";
          ctx.font = "bold 11px -apple-system, sans-serif";
          ctx.textAlign = "right";
          ctx.fillText(timerText, plotW + 4, bidY - 12);
        }
      }

      ctx.strokeStyle = cGrid; ctx.strokeRect(0.5, 0.5, plotW, plotH);

      // Crosshair
      if (showCrosshair && crosshair.current) {
        const { x, y: cy } = crosshair.current;
        ctx.strokeStyle = "#1565c0";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, plotH); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(plotW, cy); ctx.stroke();
        ctx.setLineDash([]);
        const priceAtY = smoothLo + (plotH - cy) / plotH * (smoothHi - smoothLo);
        ctx.fillStyle = "#1565c0";
        ctx.font = "11px -apple-system, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(priceAtY.toFixed(s.digits), x + 4, cy - 4);
        const timeAtX = bars[Math.round((plotW - x) / sp)]?.t;
        if (timeAtX) {
          const d = new Date(timeAtX * 1000);
          ctx.textAlign = "right";
          ctx.fillText(`${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`, x - 4, cy + 12);
        }
      }

      needsRedrawRef.current = false;
    };

    const loop = () => {
      // Continuous 60fps draw for live candle + crosshair smoothness
      draw();
      frameId = requestAnimationFrame(loop);
    };

    loop();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [size.w, size.h]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const handler = (ev: TouchEvent) => {
      if (ev.touches.length === 2 && pinch.current) {
        ev.preventDefault();
        const dx = ev.touches[0].clientX - ev.touches[1].clientX;
        const dy = ev.touches[0].clientY - ev.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * (dist / pinch.current.dist)));
        needsRedrawRef.current = true;
      }
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

   return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden bg-white"
      onWheel={(ev) => { view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * (ev.deltaY < 0 ? 1.15 : 0.87))); needsRedrawRef.current = true; }}
      onMouseMove={(ev) => {
        if (!showCrosshair) return;
        const rect = ev.currentTarget.getBoundingClientRect();
        crosshair.current = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
      }}
      onMouseLeave={() => { crosshair.current = null; needsRedrawRef.current = true; }}
      onTouchStart={(ev) => { if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; pinch.current = { dist: Math.sqrt(dx * dx + dy * dy), spacing: view.current.spacing }; } }}
      onTouchEnd={() => { pinch.current = null; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}