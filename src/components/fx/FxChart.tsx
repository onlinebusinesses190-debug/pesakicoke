import { useEffect, useRef, useState } from "react";
import { candlesAt, quoteAt, type Pair, type TF } from "@/lib/fx/market";
import type { Trade } from "@/lib/fx/fx.functions";

export function FxChart({ pair, tf, now, trades }: { pair: Pair; tf: TF; now: number; trades: Trade[] }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = wrap.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = cv.current;
    if (!c || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size.w * dpr; c.height = size.h * dpr;
    const ctx = c.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (n: string) => css.getPropertyValue(n).trim();
    const W = size.w, H = size.h, axisW = 72, axisH = 22;
    const plotW = W - axisW, plotH = H - axisH;
    const sp = 10;
    const count = Math.max(10, Math.floor((plotW - 20) / sp));
    const bars = candlesAt(pair, tf, now, count);
    const q = quoteAt(pair, now);
    const mine = trades.filter((t) => t.symbol === pair.symbol);

    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b.l); hi = Math.max(hi, b.h); }
    lo = Math.min(lo, q.bid); hi = Math.max(hi, q.ask);
    for (const t of mine) { lo = Math.min(lo, t.entry); hi = Math.max(hi, t.entry); }
    const pad = (hi - lo) * 0.1 || 10 ** -pair.digits * 10;
    lo -= pad; hi += pad;
    const y = (p: number) => plotH - ((p - lo) / (hi - lo)) * plotH;
    const x = (i: number) => plotW - 20 - (bars.length - i - 0.5) * sp;

    ctx.fillStyle = col("--chart-bg"); ctx.fillRect(0, 0, W, H);
    ctx.font = "11px 'JetBrains Mono', monospace"; ctx.textBaseline = "middle";

    ctx.strokeStyle = col("--chart-grid"); ctx.fillStyle = col("--chart-text"); ctx.lineWidth = 1;
    for (let k = 0; k <= 6; k++) {
      const p = lo + ((hi - lo) * k) / 6, yy = Math.round(y(p)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
      ctx.fillText(p.toFixed(pair.digits), plotW + 6, yy);
    }
    const step = Math.max(1, Math.round(90 / sp));
    ctx.textAlign = "center";
    bars.forEach((b, i) => {
      if ((bars.length - 1 - i) % step) return;
      const xx = Math.round(x(i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
      const d = new Date(b.t * 1000);
      ctx.fillText(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, xx, plotH + 11);
    });
    ctx.textAlign = "left";

    bars.forEach((b, i) => {
      const bull = b.c >= b.o;
      ctx.strokeStyle = ctx.fillStyle = col(bull ? "--chart-bull" : "--chart-bear");
      const xx = Math.round(x(i)) + 0.5;
      ctx.beginPath(); ctx.moveTo(xx, y(b.h)); ctx.lineTo(xx, y(b.l)); ctx.stroke();
      const top = y(Math.max(b.o, b.c)), bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
      ctx.fillRect(xx - 3.5, top, 7, bh);
    });

    const line = (p: number, color: string, label: string, dash: number[] = []) => {
      const yy = Math.round(y(p)) + 0.5;
      ctx.setLineDash(dash); ctx.strokeStyle = color;
      ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = color; ctx.fillRect(plotW, yy - 9, axisW, 18);
      ctx.fillStyle = "#fff"; ctx.fillText(p.toFixed(pair.digits), plotW + 6, yy);
      if (label) {
        const w = ctx.measureText(label).width + 10;
        ctx.fillStyle = color; ctx.fillRect(6, yy - 9, w, 18);
        ctx.fillStyle = "#fff"; ctx.fillText(label, 11, yy);
      }
    };
    for (const t of mine) line(t.entry, col(t.side === "buy" ? "--chart-bull" : "--chart-bear"), `${t.side.toUpperCase()} · ${t.mode}`, [5, 4]);
    line(q.bid, col("--chart-line"), "");
  }, [pair, tf, now, trades, size]);

  return (
    <div ref={wrap} className="relative h-full w-full">
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
