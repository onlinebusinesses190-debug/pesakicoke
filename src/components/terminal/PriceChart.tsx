import { useEffect, useRef, useState } from "react";
import type { TF } from "@/lib/trading/engine";
import { TIMEFRAMES } from "@/lib/trading/engine";

export function PriceChart({ engine, symbol, tf, zoom, showCrosshair = false, chartType = "candle" }: { engine: any, symbol: string; tf: TF; zoom: number; showCrosshair?: boolean; showIndicators?: boolean; chartType?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const view = useRef({ spacing: 8, offset: 0 });
  const pinch = useRef<{ dist: number; spacing: number } | null>(null);
  const drag = useRef<{ x: number; offset: number } | null>(null);
  const loRef = useRef(0);
  const hiRef = useRef(0);
  const displayBid = useRef<number | null>(null);
  const displayAsk = useRef<number | null>(null);

  useEffect(() => {
    view.current.spacing = Math.min(30, Math.max(2, 8 * zoom));
  }, [zoom]);

  useEffect(() => {
    view.current.offset = 0;
    loRef.current = 0;
    hiRef.current = 0;
    displayBid.current = null;
    displayAsk.current = null;
  }, [symbol, tf]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      setSize({ w: rect.width || window.innerWidth, h: rect.height || window.innerHeight * 0.6 });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const t = setTimeout(measure, 100);
    return () => { ro.disconnect(); clearTimeout(t); };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || size.w <= 0 || size.h <= 0) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let frameId = 0;
    let active = true;
    const draw = () => {
      if (!active) return;
      frameId = requestAnimationFrame(draw);

      const q = engine?.quotes?.[symbol];
      const spec = engine?.spec(symbol);
      const allRaw = engine?.candles?.[symbol]?.[tf] || [];
      const all = allRaw.filter((c: any) =>
        c && Number.isFinite(c.o) && Number.isFinite(c.h) && Number.isFinite(c.l) &&
        Number.isFinite(c.c) && Number.isFinite(c.t) && c.h >= c.l
      );

      const dpr = window.devicePixelRatio || 1;
      const pixelW = Math.floor(size.w * dpr);
      const pixelH = Math.floor(size.h * dpr);
      // Resizing a canvas clears its drawing state. Only resize when dimensions
      // change; assigning width/height on every animation frame causes flicker.
      if (cv.width !== pixelW || cv.height !== pixelH) {
        cv.width = pixelW;
        cv.height = pixelH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cBg = "#ffffff", cGrid = "#e5e5e5", cText = "#000000", cBull = "#089981", cBear = "#F23645", cAxisBg = "#f8f9fa";
      const W = size.w, H = size.h, axisW = 64, axisH = 22;
      const plotW = Math.max(1, W - axisW), plotH = Math.max(1, H - axisH);
      ctx.fillStyle = cBg; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = cAxisBg; ctx.fillRect(plotW, 0, axisW, H);
      if (!q || !spec || all.length === 0 || !Number.isFinite(q.bid) || !Number.isFinite(q.ask)) return;

      if (displayBid.current === null || displayAsk.current === null) {
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
      const end = Math.max(0, all.length - view.current.offset);
      let bars = all.slice(Math.max(0, end - count), end);
      if (bars.length === 0) return;

      if (view.current.offset === 0) {
        const last = bars[bars.length - 1];
        bars = [...bars];
        bars[bars.length - 1] = { ...last, c: smoothMid, h: Math.max(last.h, smoothMid, smoothAsk), l: Math.min(last.l, smoothMid, smoothBid) };
      }

      const heights = bars.map((b: any) => b.h - b.l).filter((h: number) => Number.isFinite(h) && h > 0);
      const avgHeight = heights.length ? heights.reduce((sum: number, h: number) => sum + h, 0) / heights.length : 0;
      const maxAllowedHeight = avgHeight > 0 ? avgHeight * 3 : Infinity;
      let lo = Infinity, hi = -Infinity;
      for (const b of bars) {
        if (b.h - b.l <= maxAllowedHeight) {
          lo = Math.min(lo, b.l);
          hi = Math.max(hi, b.h);
        }
      }
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        lo = Math.min(...bars.map((b: any) => b.l));
        hi = Math.max(...bars.map((b: any) => b.h));
      }

      const targetSymbol = symbol.replace("/", "").toUpperCase();
      const symbolPositions = (engine.positions || []).filter((x: any) =>
        (x.symbol || "").replace("/", "").toUpperCase() === targetSymbol
      );
      if (view.current.offset === 0) {
        lo = Math.min(lo, smoothBid);
        hi = Math.max(hi, smoothAsk);
      }

      // Include only actual entry prices in autoscaling. Stop-loss/take-profit
      // levels can be far from market and should not squash the candle chart.
      // Do not impose a bogus range cap: the old `max(currentRange * 5, ...)`
      // condition could never cap anything and caused entry lines to be clamped.
      for (const position of symbolPositions) {
        const entry = Number(position.openPrice);
        if (Number.isFinite(entry) && entry > 0) {
          lo = Math.min(lo, entry);
          hi = Math.max(hi, entry);
        }
      }

      const priceRange = hi - lo;
      const minRange = Math.max(spec.point * 200, Number.EPSILON);
      const pad = priceRange * 0.05 || minRange;
      const rawLo = lo - Math.max(pad, minRange);
      const rawHi = hi + Math.max(pad, minRange);
      if (!Number.isFinite(rawLo) || !Number.isFinite(rawHi) || rawHi <= rawLo) return;

      if (loRef.current === 0 || hiRef.current === 0) {
        loRef.current = rawLo;
        hiRef.current = rawHi;
      } else {
        loRef.current += (rawLo - loRef.current) * 0.15;
        hiRef.current += (rawHi - hiRef.current) * 0.15;
      }
      const smoothLo = loRef.current;
      const smoothHi = hiRef.current;
      const smoothRange = Math.max(smoothHi - smoothLo, minRange);
      const y = (price: number) => plotH - ((price - smoothLo) / smoothRange) * plotH;
      const xOf = (i: number) => plotW - 12 - (bars.length - i - 0.5) * sp;

      ctx.font = "11px Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const targetPixels = 24;
      const rawStep = smoothRange / Math.max(1, plotH / targetPixels);
      const safeStep = Math.max(rawStep, spec.point * 0.1);
      const mag = Math.pow(10, Math.floor(Math.log10(safeStep)));
      const norm = safeStep / mag;
      const niceNorm = norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1;
      const step = Math.max(niceNorm * mag, spec.point * 0.1);
      const safeStart = Math.ceil(smoothLo / step) * step;

      ctx.strokeStyle = cGrid; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      for (let price = safeStart, count = 0; price <= smoothHi && count < 100; price += step, count++) {
        const yy = Math.round(y(price)) + 0.5;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.fillStyle = cText;
        ctx.fillText(price.toFixed(spec.digits), plotW + 4, yy);
      }

      ctx.textAlign = "center";
      const every = Math.max(1, Math.round(90 / sp));
      let lastLabelX = -100;
      for (let i = bars.length - 1; i >= 0; i -= every) {
        const xx = Math.round(xOf(i)) + 0.5;
        ctx.beginPath(); ctx.moveTo(xx, 0); ctx.lineTo(xx, plotH); ctx.stroke();
        if (lastLabelX - xx > 70) {
          const d = new Date(bars[i].t * 1000);
          const p2 = (n: number) => String(n).padStart(2, "0");
          ctx.fillStyle = cText;
          ctx.fillText(`${p2(d.getDate())} ${d.toLocaleString("en", { month: "short" })} ${p2(d.getHours())}:${p2(d.getMinutes())}`, xx, plotH + 12);
          lastLabelX = xx;
        }
      }
      ctx.textAlign = "left";

      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      const bw = Math.max(4, Math.floor(sp * 0.7));
      bars.forEach((b: any, i: number) => {
        const x = Math.round(xOf(i));
        const bull = b.c >= b.o;
        ctx.strokeStyle = ctx.fillStyle = bull ? cBull : cBear;
        ctx.beginPath(); ctx.moveTo(x + 0.5, y(b.h)); ctx.lineTo(x + 0.5, y(b.l)); ctx.stroke();
        const top = y(Math.max(b.o, b.c));
        const bh = Math.max(1, Math.abs(y(b.o) - y(b.c)));
        if (chartType === "line") {
          if (i > 0) {
            ctx.beginPath(); ctx.moveTo(xOf(i - 1), y(bars[i - 1].c)); ctx.lineTo(xOf(i), y(b.c)); ctx.stroke();
          }
        } else if (bw > 2) {
          ctx.fillRect(x - bw / 2, top, bw, bh);
        }
      });

      ctx.fillStyle = "#1565c0";
      ctx.font = "bold 12px Arial, sans-serif";
      ctx.fillText(`${symbol} ▼ ${tf}`, 8, 15);
      ctx.fillStyle = "#666";
      ctx.font = "11px Arial, sans-serif";
      ctx.fillText(spec.desc || "", 8, 30);

      const drawnLabelYs: number[] = [];
      symbolPositions.forEach((position: any) => {
        const entry = Number(position.openPrice);
        if (!Number.isFinite(entry) || entry <= 0 || entry < smoothLo || entry > smoothHi) return;
        const yy = Math.round(y(entry)) + 0.5;
        const color = position.side === "buy" ? "#1565c0" : "#c62828";
        ctx.strokeStyle = color;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.setLineDash([]);

        let labelY = Math.max(9, Math.min(plotH - 9, yy - 8));
        while (drawnLabelYs.some((ly) => Math.abs(ly - labelY) < 18)) {
          labelY = labelY + 18 > plotH - 9 ? labelY - 18 : labelY + 18;
        }
        drawnLabelYs.push(labelY);
        const pnl = engine.profitOf(position);
        const label = `${position.side.toUpperCase()} ${position.lots.toFixed(2)}   ${pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} USD`;
        ctx.font = "bold 11px Arial, sans-serif";
        const labelWidth = ctx.measureText(label).width + 8;
        ctx.fillStyle = "#fff";
        ctx.fillRect(4, labelY - 8, labelWidth, 16);
        ctx.fillStyle = color;
        ctx.fillText(label, 8, labelY);

        // Show the exact execution price on the right scale, like the reference chart.
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - 8, axisW, 16);
        ctx.fillStyle = "#fff";
        ctx.fillText(entry.toFixed(spec.digits), plotW + 4, yy);
      });

      const drawBox = (price: number, color: string, timerText = "") => {
        if (!Number.isFinite(price) || price < smoothLo || price > smoothHi) return;
        const yy = Math.round(y(price)) + 0.5;
        ctx.strokeStyle = color;
        ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(plotW, yy); ctx.stroke();
        ctx.fillStyle = color;
        ctx.fillRect(plotW, yy - (timerText ? 10 : 8), axisW, timerText ? 20 : 16);
        ctx.fillStyle = "#fff";
        ctx.font = "11px Arial, sans-serif";
        ctx.fillText(price.toFixed(spec.digits), plotW + 4, yy - (timerText ? 4 : 0));
        if (timerText) {
          ctx.font = "10px Arial, sans-serif";
          ctx.fillText(timerText, plotW + 4, yy + 6);
        }
      };

      const tfSeconds = TIMEFRAMES[tf];
      const lastCandle = all[all.length - 1];
      const remaining = lastCandle ? lastCandle.t + tfSeconds - Date.now() / 1000 : 0;
      const timerStr = remaining > 0 && remaining <= tfSeconds
        ? `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(Math.floor(remaining % 60)).padStart(2, "0")}`
        : "";
      drawBox(smoothAsk, cBear);
      drawBox(smoothBid, cBull, timerStr);
      if (showCrosshair) {
        ctx.strokeStyle = "#64748b";
        ctx.setLineDash([2, 3]);
        ctx.strokeRect(0, 0, plotW, plotH);
        ctx.setLineDash([]);
      }
    };

    frameId = requestAnimationFrame(draw);
    return () => { active = false; cancelAnimationFrame(frameId); };
  }, [size.w, size.h, engine, symbol, tf, chartType, showCrosshair]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 touch-none overflow-hidden bg-white cursor-crosshair"
      onWheel={(ev) => {
        ev.preventDefault();
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
        const shift = Math.round(-dx / view.current.spacing);
        view.current.offset = Math.max(0, Math.min(maxOffset, drag.current.offset + shift));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerLeave={() => { drag.current = null; }}
      onTouchStart={(ev) => {
        if (ev.touches.length === 2) {
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          pinch.current = { dist: Math.hypot(dx, dy), spacing: view.current.spacing };
        } else if (ev.touches.length === 1) {
          drag.current = { x: ev.touches[0].clientX, offset: view.current.offset };
        }
      }}
      onTouchMove={(ev) => {
        if (ev.touches.length === 2 && pinch.current) {
          ev.preventDefault();
          const dx = ev.touches[0].clientX - ev.touches[1].clientX;
          const dy = ev.touches[0].clientY - ev.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          if (pinch.current.dist > 0) {
            view.current.spacing = Math.min(30, Math.max(2, pinch.current.spacing * dist / pinch.current.dist));
          }
        } else if (ev.touches.length === 1 && drag.current) {
          const dx = ev.touches[0].clientX - drag.current.x;
          const candles = engine?.candles?.[symbol]?.[tf] || [];
          const maxOffset = Math.max(0, candles.length - 10);
          const shift = Math.round(-dx / view.current.spacing);
          view.current.offset = Math.max(0, Math.min(maxOffset, drag.current.offset + shift));
        }
      }}
      onTouchEnd={() => { pinch.current = null; drag.current = null; }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" style={{ width: size.w, height: size.h }} />
    </div>
  );
}
