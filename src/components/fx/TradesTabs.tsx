import { useState } from "react";
import { calcPnl, getPair, quoteAt } from "@/lib/fx/market";
import type { Trade } from "@/lib/fx/fx.functions";
import { ksh, when } from "@/lib/fx/format";

export function TradesTabs({ open, closed, now, closing, onClose, compact = false, view }: {
  open: Trade[]; closed: Trade[]; now: number; closing: string | null; onClose: (t: Trade) => void; compact?: boolean; view: "open" | "history";
}) {
  const tab = view;
  const total = open.reduce((a, t) => a + Math.max(calcPnl(t, quoteAt(getPair(t.symbol)!, now)).pnl, -t.margin), 0);

  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="flex items-center border-b border-border px-3 py-2">
        <h2 className="font-bold">{tab === "open" ? `Open positions (${open.length})` : "Trade history"}</h2>
        {tab === "open" && open.length > 0 && (
          <span className={`num ml-auto font-bold ${total >= 0 ? "text-up" : "text-down"}`}>Floating {ksh(total, true)}</span>
        )}
      </div>
      <div className={`flex-1 overflow-auto ${compact ? "max-h-40" : ""}`}>
        {tab === "open" ? (
          open.length === 0 ? <p className="p-4 text-muted-foreground">No open positions. Pick a pair and press BUY or SELL.</p> : (
            <ul className="divide-y divide-border">
              {open.map((t) => {
                const p = getPair(t.symbol)!;
                const q = quoteAt(p, now);
                const { pnl } = calcPnl(t, q);
                const shown = Math.max(pnl, -t.margin);
                const left = t.margin + shown;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                    <span className="font-extrabold">{p.label}</span>
                    <span className={`rounded px-2 py-0.5 text-xs font-bold text-trade-foreground ${t.side === "buy" ? "bg-buy" : "bg-sell"}`}>{t.side.toUpperCase()}</span>
                    <span className="num font-semibold">{ksh(t.amount)}</span>
                    {t.mode === "real" && <span className="rounded bg-real px-1.5 text-xs font-bold text-real-foreground">REAL</span>}
                    <span className="text-xs text-muted-foreground">entry <span className="num">{t.entry.toFixed(p.digits)}</span> → now <span className="num">{(t.side === "buy" ? q.bid : q.ask).toFixed(p.digits)}</span></span>
                    <span className={`text-xs font-semibold ${shown >= 0 ? "text-up" : "text-down"}`}>{shown >= 0 ? "In profit" : `Losing · ${ksh(left)} of ${ksh(t.margin)} margin left`}</span>
                    <span className={`num ml-auto text-lg font-extrabold ${shown >= 0 ? "text-up" : "text-down"}`}>{ksh(shown, true)}</span>
                    <button onClick={() => onClose(t)} disabled={closing === t.id}
                      className="rounded-md border-2 border-foreground px-4 py-1 font-bold hover:bg-foreground hover:text-background disabled:opacity-40">
                      {closing === t.id ? "Closing…" : "Close"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )
        ) : closed.length === 0 ? <p className="p-4 text-muted-foreground">No closed trades yet.</p> : (
          <ul className="divide-y divide-border">
            {closed.map((t) => {
              const p = getPair(t.symbol)!;
              return (
                <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2.5">
                  <span className="font-bold">{p.label}</span>
                  <span className={`text-xs font-bold ${t.side === "buy" ? "text-buy" : "text-sell"}`}>{t.side.toUpperCase()}</span>
                  <span className="num">{ksh(t.amount)}</span>
                  <span className="text-xs uppercase text-muted-foreground">{t.mode}{t.reason === "stopout" ? " · auto-closed" : ""}</span>
                  <span className="text-xs text-muted-foreground">{when(t.openedAt)} → {t.closedAt && when(t.closedAt)}</span>
                  <span className={`num ml-auto font-extrabold ${(t.pnl ?? 0) >= 0 ? "text-up" : "text-down"}`}>{ksh(t.pnl ?? 0, true)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
