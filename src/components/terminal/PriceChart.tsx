import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";
import { X } from "lucide-react";

export function PriceChart({ symbol, tf, zoom }: { symbol: string; tf: TF; zoom: number }) {
  const e = useEngine();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  
  const view = useRef({ spacing: 5, offset: 0 });
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
    
    // We use e.candles but to ensure they don't randomly change, your engine needs to be deterministic.
    // For the UI, we will just draw what the engine gives us.
    const all = e.candles?.[symbol]?.[tf] || [];
    if (!q) return;

    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.floor(size.w * dpr);
    cv.height = Math.floor(size.h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    const cBg = "#ffffff", cGrid = "#f0f3fa", cText = "#333333", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
    const W = size.w, H = size.h, axisW = 64, axisH = 20;
    const plotW = W - axisW, plotH = H - axisH;
    const sp = view.current.spacing;
    const count = Math.max(5, Math.floor((plotW - 12) / sp));
    const end = all.length - view.current.offset;
    const bars = all.slice(Math.max(0, end - count), end);

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
    const pad = (hi - lo) * 0.08 || s.point * 10;
    lo -= pad; hi += pad;
    const y = (p: number) => plotH - ((p - lo) / (hi - lo)) * plotH;
    const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

    ctx.font = "11px -apple-system, sans-serif"; ctx.textBaseline = "middle";

    // ─── TIGHT Y-AXIS GRID ───
    const targetPixels = 18;
    const rawStep = (hi - lo) / (plotH / targetPixels);
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let niceNorm = 1;
    if (norm > 5) niceNorm = 10; else if (norm > 2) niceNorm = 5; else if (norm > 1) niceNorm = 2;
    const step = niceNorm * mag;

    ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([]);
    const startLine = Math.ceil(lo / step) * step;
    for (let p = startLine; p <= hi; p += step) {
      const yy = Math.round(y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.fillStyle = cText; ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
    }

    const every = Math.max(1, Math.round(80 / sp));
    for (let i = bars.length - 1; i >= 0; i -= every) {
      const xx = Math.round(xOf(i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
      const d = new Date(bars[i].t * 1000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      const lbl = TIMEFRAMES[tf] >= 3600 ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${p2(d.getHours())}:00` : `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      ctx.fillStyle = cText; ctx.fillText(lbl, xx - 18, plotH + 10);
    }

    const bw = Math.max(1, Math.floor(sp * 0.6));
    bars.forEach((b, i) => {
      const x = Math.round(xOf(i)); const bull = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
      ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)); const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      if (bw > 2) ctx.fillRect(x - bw / 2, top, bw, bh);
    });

    // Top-left label
    ctx.fillStyle = "#1565c0";
    ctx.font = "bold 12px -apple-system, sans-serif";
    ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
    ctx.fillStyle = "#666";
    ctx.font = "10px -apple-system, sans-serif";
    ctx.fillText(s.desc || "", 8, 28);

    // Overlays
    const drawSolidLine = (p: number, color: string) => {
      if (p < lo || p > hi) return;
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = color; ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      
      ctx.fillStyle = color;
      ctx.fillRect(plotW, yy - 8, axisW, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
    };

    const drawDashedLine = (p: number, color: string, labelLeft: string) => {
      if (p < lo || p > hi) return;
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = color; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.strokeStyle = color; ctx.strokeRect(plotW, yy - 8, axisW, 16);
      ctx.fillStyle = "#333";
      ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);

      if (labelLeft) {
        ctx.fillStyle = color; 
        // Use a background rect to prevent text from blending with candles
        const textWidth = ctx.measureText(labelLeft).width;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(6, yy - 18, textWidth + 4, 14);
        ctx.fillStyle = color;
        ctx.fillText(labelLeft, 8, yy - 10);
      }
    };

    // Draw positions with cleaned up text
    for (const p of symbolPositions) {
      const pnl = e.profitOf(p);
      const pnlText = `${p.side.toUpperCase()} ${p.lots.toFixed(2)}  ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
      
      drawDashedLine(p.openPrice, p.side === "buy" ? cBull : cBear, pnlText);
      if (p.sl) drawDashedLine(p.sl, cBear, "SL");
      if (p.tp) drawDashedLine(p.tp, cBull, "TP");
    }

    drawSolidLine(q.ask, cBear);
    drawSolidLine(q.bid, cBull);

    ctx.strokeStyle = cGrid; ctx.strokeRect(0.5, 0.5, plotW, plotH);
  });

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
        setRedraw((x) => x + 1);
      }
    };
    el.addEventListener("touchmove", handler, { passive: false });
    return () => el.removeEventListener("touchmove", handler);
  }, []);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden bg-white"
      onWheel={(ev) => { view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * (ev.deltaY < 0 ? 1.15 : 0.87))); setRedraw((x) => x + 1); }}
      onTouchStart={(ev) => { if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; pinch.current = { dist: Math.sqrt(dx * dx + dy * dy), spacing: view.current.spacing }; } }}
      onTouchEnd={() => { pinch.current = null; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
