import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export function PriceChart({ symbol, tf, zoom }: { symbol: string; tf: TF; zoom: number }) {
  const e = useEngine();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const view = useRef({ spacing: 8, offset: 0 });
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; off: number } | null>(null);
  const [, setRedraw] = useState(0);
  const [lots, setLots] = useState("0.10");
  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 8 * zoom));
    setRedraw((x) => x + 1);
  }, [zoom]);
  useEffect(() => { view.current.offset = 0; }, [symbol, tf]);

  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = size.w * dpr; cv.height = size.h * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (n: string) => css.getPropertyValue(n).trim();
    const W = size.w, H = size.h, axisW = 64, axisH = 18;
    const plotW = W - axisW, plotH = H - axisH;
    const all = e.candles[symbol][tf];
    const sp = view.current.spacing;
    const count = Math.max(5, Math.floor((plotW - 12) / sp));
    const end = all.length - view.current.offset;
    const bars = all.slice(Math.max(0, end - count), end);

    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }
    if (view.current.offset === 0) { lo = Math.min(lo, q.bid); hi = Math.max(hi, q.ask); }
    const pad = (hi - lo) * 0.08 || s.point * 10;
    lo -= pad; hi += pad;
    const y = (p: number) => plotH - ((p - lo) / (hi - lo)) * plotH;
    const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

    ctx.fillStyle = col("--chart-bg"); ctx.fillRect(0, 0, W, H);
    ctx.font = "11px Tahoma, sans-serif"; ctx.textBaseline = "middle";

    const steps = Math.max(3, Math.floor(plotH / 50));
    ctx.strokeStyle = col("--chart-grid"); ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    for (let i = 0; i <= steps; i++) {
      const p = lo + ((hi - lo) * i) / steps; const yy = Math.round(y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.fillStyle = col("--chart-text"); ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
    }
    const every = Math.max(1, Math.round(90 / sp));
    for (let i = bars.length - 1; i >= 0; i -= every) {
      const xx = Math.round(xOf(i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
      const d = new Date(bars[i].t * 1000);
      const p2 = (n: number) => String(n).padStart(2, "0");
      const lbl = TIMEFRAMES[tf] >= 3600 ? `${d.getDate()} ${d.toLocaleString("en", { month: "short" })} ${p2(d.getHours())}:00` : `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      ctx.fillStyle = col("--chart-text"); ctx.fillText(lbl, xx - 18, plotH + 9);
    }
    ctx.setLineDash([]);

    const bw = Math.max(1, Math.floor(sp * 0.7));
    bars.forEach((b, i) => {
      const x = Math.round(xOf(i));
      const bull = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = col(bull ? "--chart-bull" : "--chart-bear");
      ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)), bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      if (bw <= 2) return;
      if (bull) ctx.strokeRect(x - bw / 2 + 0.5, top + 0.5, bw - 1, bh);
      else ctx.fillRect(x - bw / 2, top, bw, bh);
      if (bull) { ctx.fillStyle = col("--chart-bg"); ctx.fillRect(x - bw / 2 + 1, top + 1, bw - 2, Math.max(0, bh - 1)); }
    });

    const hLine = (p: number, color: string, label: string, dash: number[] = [], filled = false) => {
      if (p < lo || p > hi) return;
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = color; ctx.setLineDash(dash);
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.setLineDash([]);
      if (filled) {
        ctx.fillStyle = color; ctx.fillRect(plotW, yy - 7, axisW, 14);
        ctx.fillStyle = col("--chart-bg"); ctx.fillText(p.toFixed(s.digits), plotW + 4, yy);
      }
      if (label) { ctx.fillStyle = color; ctx.fillText(label, 6, yy - 8); }
    };

    for (const p of e.positions.filter((x) => x.symbol === symbol)) {
      hLine(p.openPrice, col(p.side === "buy" ? "--chart-entry-buy" : "--chart-entry-sell"), `#${p.ticket} ${p.side} ${p.lots.toFixed(2)}  ${e.profitOf(p).toFixed(2)}`, [6, 3]);
      if (p.sl) hLine(p.sl, col("--chart-sl"), `#${p.ticket} sl`, [3, 3]);
      if (p.tp) hLine(p.tp, col("--chart-tp"), `#${p.ticket} tp`, [3, 3]);
    }
    for (const o of e.orders.filter((x) => x.symbol === symbol)) {
      hLine(o.price, col("--chart-text"), `#${o.ticket} ${o.type.replace("_", " ")} ${o.lots.toFixed(2)}`, [8, 4]);
    }
    hLine(q.ask, col("--chart-ask"), "", [], true);
    hLine(q.bid, col("--chart-bid"), "", [], true);

    const m = mouse.current;
    if (m && m.x < plotW && m.y < plotH && !drag.current) {
      ctx.strokeStyle = col("--chart-cross"); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(m.x + 0.5, 0); ctx.lineTo(m.x + 0.5, plotH); ctx.moveTo(0, m.y + 0.5); ctx.lineTo(plotW, m.y + 0.5); ctx.stroke();
      ctx.setLineDash([]);
      const price = lo + ((plotH - m.y) / plotH) * (hi - lo);
      ctx.fillStyle = col("--chart-text"); ctx.fillRect(plotW, m.y - 7, axisW, 14);
      ctx.fillStyle = col("--chart-bg"); ctx.fillText(price.toFixed(s.digits), plotW + 4, m.y);
      const idx = Math.round((m.x - xOf(0)) / sp);
      const b = bars[idx];
      if (b) {
        ctx.fillStyle = col("--chart-text");
        ctx.fillText(`O ${b.o.toFixed(s.digits)}  H ${b.h.toFixed(s.digits)}  L ${b.l.toFixed(s.digits)}  C ${b.c.toFixed(s.digits)}`, 6, plotH - 10);
      }
    }
    ctx.strokeStyle = col("--chart-grid"); ctx.strokeRect(0.5, 0.5, plotW, plotH);
  });

  const total = e.candles[symbol][tf].length;
  const trade = (side: "buy" | "sell") => e.placeOrder({ symbol, type: side, lots: parseFloat(lots) || 0 });

  return (
    <div ref={wrapRef} className="relative h-full w-full touch-none overflow-hidden"
      onWheel={(ev) => { view.current.spacing = Math.min(30, Math.max(2, view.current.spacing * (ev.deltaY < 0 ? 1.15 : 0.87))); setRedraw((x) => x + 1); }}
      onPointerDown={(ev) => { drag.current = { x: ev.clientX, off: view.current.offset }; (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { mouse.current = null; setRedraw((x) => x + 1); }}
      onPointerMove={(ev) => {
        const r = wrapRef.current!.getBoundingClientRect();
        mouse.current = { x: ev.clientX - r.left, y: ev.clientY - r.top };
        if (drag.current) {
          const d = Math.round((ev.clientX - drag.current.x) / view.current.spacing);
          view.current.offset = Math.max(0, Math.min(total - 10, drag.current.off + d));
        }
        setRedraw((x) => x + 1);
      }}>
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: size.w, height: size.h }} />
      <div className="pointer-events-none absolute left-2 top-1 text-[11px]" style={{ color: "var(--chart-text)" }}>
        {symbol}, {tf}: {s.desc}
      </div>
      <div className="absolute left-2 top-6 flex items-stretch shadow" onPointerDown={(ev) => ev.stopPropagation()}>
        <button onClick={() => trade("sell")} className="flex w-20 flex-col items-center bg-sell px-1 py-0.5 text-trade-foreground hover:opacity-90">
          <span className="text-[10px]">SELL</span>
          <span className="font-mono text-sm font-bold">{q.bid.toFixed(s.digits)}</span>
        </button>
        <input value={lots} onChange={(ev) => setLots(ev.target.value)} inputMode="decimal" aria-label="Volume"
          className="mt-input w-14 text-center" />
        <button onClick={() => trade("buy")} className="flex w-20 flex-col items-center bg-buy px-1 py-0.5 text-trade-foreground hover:opacity-90">
          <span className="text-[10px]">BUY</span>
          <span className="font-mono text-sm font-bold">{q.ask.toFixed(s.digits)}</span>
        </button>
      </div>
    </div>
  );
}
