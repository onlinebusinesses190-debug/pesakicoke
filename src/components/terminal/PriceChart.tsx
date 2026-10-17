import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export function PriceChart({ symbol, tf, zoom }: { symbol: string; tf: TF; zoom: number }) {
  const e = useEngine();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  
  const view = useRef({ spacing: 5, offset: 0 });
  const mouse = useRef<{ x: number; y: number } | null>(null);
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

    if (bars.length === 0) {
      ctx.fillStyle = "#666"; ctx.textAlign = "center"; ctx.fillText("Loading...", W / 2, H / 2);
      return;
    }

    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }
    
    // Include SL/TP in scale so they don't get cut off
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

    // Grid
    const steps = Math.max(3, Math.floor(plotH / 50));
    ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([]);
    for (let i = 0; i <= steps; i++) {
      const p = lo + ((hi - lo) * i) / steps;
      const yy = Math.round(y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.fillStyle = cText; ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
    }

    // Candles
    const bw = Math.max(1, Math.floor(sp * 0.6));
    bars.forEach((b, i) => {
      const x = Math.round(xOf(i)); const bull = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
      ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)); const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      if (bw > 2) ctx.fillRect(x - bw / 2, top, bw, bh);
    });

    // ─── MT5 OVERLAYS ───
    const drawDashedLine = (p: number, color: string, labelLeft: string, labelRight: string) => {
      if (p < lo || p > hi) return;
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = color; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.setLineDash([]);
      
      // Right Axis Label
      ctx.fillStyle = color;
      ctx.fillRect(plotW, yy - 8, axisW, 16);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
      
      // Left Chart Label
      if (labelLeft) {
        ctx.fillStyle = color;
        ctx.fillText(labelLeft, 6, yy - 10);
      }
    };

    for (const p of symbolPositions) {
      const pnl = e.profitOf(p);
      const pnlText = `${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
      
      // Entry line (Dotted)
      drawDashedLine(p.openPrice, p.side === "buy" ? cBull : cBear, `${p.side.toUpperCase()} ${p.lots.toFixed(2)}`, "");
      
      // Floating PNL Label (Image 2 & 3)
      if (p.openPrice > lo && p.openPrice < hi) {
        const yy = y(p.openPrice);
        ctx.fillStyle = pnl >= 0 ? "#1565c0" : "#c62828";
        ctx.font = "bold 10px -apple-system, sans-serif";
        ctx.fillText(pnlText, plotW - 80, yy - 12);
        ctx.font = "11px -apple-system, sans-serif";
      }

      // SL / TP
      if (p.sl) drawDashedLine(p.sl, cBear, "SL", p.sl.toFixed(s.digits));
      if (p.tp) drawDashedLine(p.tp, cBull, "TP", p.tp.toFixed(s.digits));
    }

    // Bid / Ask Last Price Lines
    drawDashedLine(q.ask, cBear, "", q.ask.toFixed(s.digits));
    drawDashedLine(q.bid, cBull, "", q.bid.toFixed(s.digits));

    ctx.strokeStyle = cGrid; ctx.strokeRect(0.5, 0.5, plotW, plotH);
  });

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden bg-white"
      onWheel={(ev) => { view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * (ev.deltaY < 0 ? 1.15 : 0.87))); setRedraw((x) => x + 1); }}
      onTouchStart={(ev) => { if (ev.touches.length === 2) { const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; pinch.current = { dist: Math.sqrt(dx * dx + dy * dy), spacing: view.current.spacing }; } }}
      onTouchMove={(ev) => { if (ev.touches.length === 2 && pinch.current) { ev.preventDefault(); const dx = ev.touches[0].clientX - ev.touches[1].clientX; const dy = ev.touches[0].clientY - ev.touches[1].clientY; const dist = Math.sqrt(dx * dx + dy * dy); view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * (dist / pinch.current.dist))); setRedraw((x) => x + 1); } }}
      onTouchEnd={() => { pinch.current = null; }}
      onPointerDown={(ev) => { if (ev.pointerType === "mouse") { mouse.current = null; } }}
      onPointerMove={(ev) => { const r = wrapRef.current!.getBoundingClientRect(); mouse.current = { x: ev.clientX - r.left, y: ev.clientY - r.top }; setRedraw((x) => x + 1); }}
      onPointerLeave={() => { mouse.current = null; setRedraw((x) => x + 1); }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full block" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
