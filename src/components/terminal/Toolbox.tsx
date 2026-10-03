import { useState } from "react";
import { typeLabel } from "@/lib/trading/engine";
import { dt, money, useEngine } from "@/lib/trading/use-engine";

type Tab = "trade" | "history" | "journal";

export function Toolbox({ onModify }: { onModify: (ticket: number) => void }) {
  const e = useEngine();
  const [tab, setTab] = useState<Tab>("trade");
  const pnlCls = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "");
  const histTotal = e.history
    .filter((d) => d.reason !== "deposit")
    .reduce((a, d) => a + d.profit, 0);

  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="flex-1 overflow-auto">
        {tab === "trade" && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  "Symbol",
                  "Ticket",
                  "Time",
                  "Type",
                  "Volume",
                  "Price",
                  "S / L",
                  "T / P",
                  "Price",
                  "Profit",
                  "",
                ].map((h, i) => (
                  <th key={i} className="mt-th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.positions.map((p) => {
                const pr = e.profitOf(p);
                return (
                  <tr
                    key={p.ticket}
                    className="hover:bg-accent"
                    onDoubleClick={() => onModify(p.ticket)}
                    title="Double-click to modify or close"
                  >
                    <td className="mt-td">{p.symbol}</td>
                    <td className="mt-td">{p.ticket}</td>
                    <td className="mt-td">{dt(p.openTime)}</td>
                    <td className="mt-td">{p.side}</td>
                    <td className="mt-td">{p.lots.toFixed(2)}</td>
                    <td className="mt-td font-mono">{e.fmt(p.symbol, p.openPrice)}</td>
                    <td className="mt-td font-mono">{p.sl ? e.fmt(p.symbol, p.sl) : "0"}</td>
                    <td className="mt-td font-mono">{p.tp ? e.fmt(p.symbol, p.tp) : "0"}</td>
                    <td className="mt-td font-mono">{e.fmt(p.symbol, e.closePriceOf(p))}</td>
                    <td className={`mt-td text-right font-mono ${pnlCls(pr)}`}>{money(pr)}</td>
                    <td className="mt-td">
                      <button
                        className="mr-1 px-1 hover:text-primary"
                        onClick={() => onModify(p.ticket)}
                        aria-label="Modify"
                      >
                        ✎
                      </button>
                      <button
                        className="px-1 hover:text-destructive"
                        onClick={() => e.closePosition(p.ticket)}
                        aria-label="Close position"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
              <tr className="bg-muted font-bold">
                <td className="mt-td" colSpan={9}>
                  Balance: {money(e.balance)} USD&nbsp;&nbsp; Equity: {money(e.equity)}&nbsp;&nbsp;
                  Margin: {money(e.margin)}&nbsp;&nbsp; Free margin: {money(e.freeMargin)}
                  &nbsp;&nbsp; Margin level: {e.margin ? `${e.marginLevel.toFixed(2)}%` : "—"}
                </td>
                <td className={`mt-td text-right font-mono ${pnlCls(e.floating)}`}>
                  {money(e.floating)}
                </td>
                <td className="mt-td">
                  {e.positions.length > 0 && (
                    <button className="mt-btn" onClick={() => e.closeAll()}>
                      Close all
                    </button>
                  )}
                </td>
              </tr>
              {e.orders.map((o) => (
                <tr key={o.ticket} className="hover:bg-accent">
                  <td className="mt-td">{o.symbol}</td>
                  <td className="mt-td">{o.ticket}</td>
                  <td className="mt-td">{dt(o.time)}</td>
                  <td className="mt-td">{typeLabel(o.type)}</td>
                  <td className="mt-td">{o.lots.toFixed(2)}</td>
                  <td className="mt-td font-mono">{e.fmt(o.symbol, o.price)}</td>
                  <td className="mt-td font-mono">{o.sl ? e.fmt(o.symbol, o.sl) : "0"}</td>
                  <td className="mt-td font-mono">{o.tp ? e.fmt(o.symbol, o.tp) : "0"}</td>
                  <td className="mt-td font-mono">
                    {e.fmt(
                      o.symbol,
                      o.type.startsWith("buy") ? e.quotes[o.symbol].ask : e.quotes[o.symbol].bid,
                    )}
                  </td>
                  <td className="mt-td text-muted-foreground">placed</td>
                  <td className="mt-td">
                    <button
                      className="px-1 hover:text-destructive"
                      onClick={() => e.cancelOrder(o.ticket)}
                      aria-label="Cancel order"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === "history" && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {[
                  "Time",
                  "Ticket",
                  "Symbol",
                  "Type",
                  "Volume",
                  "Open",
                  "Close",
                  "Close time",
                  "Reason",
                  "Profit",
                ].map((h) => (
                  <th key={h} className="mt-th">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {e.history.map((d, i) => (
                <tr key={i} className="hover:bg-accent">
                  <td className="mt-td">{dt(d.openTime)}</td>
                  <td className="mt-td">{d.ticket}</td>
                  {d.reason === "deposit" ? (
                    <>
                      <td className="mt-td" colSpan={7}>
                        balance deposit
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="mt-td">{d.symbol}</td>
                      <td className="mt-td">{d.side}</td>
                      <td className="mt-td">{d.lots.toFixed(2)}</td>
                      <td className="mt-td font-mono">{e.fmt(d.symbol, d.openPrice)}</td>
                      <td className="mt-td font-mono">{e.fmt(d.symbol, d.closePrice)}</td>
                      <td className="mt-td">{dt(d.closeTime)}</td>
                      <td className="mt-td">{d.reason}</td>
                    </>
                  )}
                  <td className={`mt-td text-right font-mono ${pnlCls(d.profit)}`}>
                    {money(d.profit)}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted font-bold">
                <td className="mt-td" colSpan={9}>
                  Trades: {e.history.filter((d) => d.reason !== "deposit").length}&nbsp;&nbsp;
                  Balance: {money(e.balance)} USD
                </td>
                <td className={`mt-td text-right font-mono ${pnlCls(histTotal)}`}>
                  {money(histTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
        {tab === "journal" && (
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="mt-th w-48">Time</th>
                <th className="mt-th">Message</th>
              </tr>
            </thead>
            <tbody>
              {e.journal.map((j, i) => (
                <tr key={i} className={j.error ? "text-destructive" : ""}>
                  <td className="mt-td">{dt(j.time)}</td>
                  <td className="mt-td">{j.msg}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="flex border-t border-border bg-chrome">
        {(["trade", "history", "journal"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`border-r border-border px-4 py-1 capitalize ${tab === t ? "bg-card font-bold" : "hover:bg-accent"}`}
          >
            {t === "trade" ? `Trade (${e.positions.length + e.orders.length})` : t}
          </button>
        ))}
      </div>
    </div>
  );
}
