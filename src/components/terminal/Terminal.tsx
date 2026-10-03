import { useState } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { Toolbox } from "./Toolbox";
import { OrderDialog, type DialogState } from "./OrderDialog";

export function Terminal() {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [chartLight, setChartLight] = useState(false);
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositErr, setDepositErr] = useState("");
  const open = (d: DialogState) => {
    setDlgKey((k) => k + 1);
    setDialog(d);
  };

  const deposit = () => {
    setDepositOpen(true);
    setDepositErr("");
    setDepositAmount("");
  };
  const reset = () => {
    if (window.confirm("Reset the demo account? All positions and history will be removed."))
      e.resetAccount();
  };

  return (
    // The terminal is an MT4-style dark interface. Force dark mode on the
    // subtree so the chrome/chart palette is right regardless of the global
    // theme (the root shell does not apply a dark class). The chart itself
    // is toggled separately via the chart-light class so it can be light too.
    <div
      className={`dark flex min-h-screen flex-col bg-background md:h-screen ${fullscreen ? "fixed inset-0 z-50" : ""} ${chartLight ? "chart-light" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-chrome px-1 py-0.5">
        <span className="px-2 font-bold text-primary">MetaTrader Web</span>
        <button className="px-2 hover:bg-accent" onClick={() => open({ mode: "new", symbol })}>
          New Order
        </button>
        <button className="px-2 hover:bg-accent" onClick={deposit}>
          Deposit
        </button>
        <button className="px-2 hover:bg-accent" onClick={() => e.closeAll("profit")}>
          Close Profitable
        </button>
        <button className="px-2 hover:bg-accent" onClick={() => e.closeAll("loss")}>
          Close Losing
        </button>
        <button className="px-2 hover:bg-accent" onClick={reset}>
          Reset Account
        </button>
        <button
          className="px-2 hover:bg-accent"
          onClick={() => setChartLight((l) => !l)}
          title={chartLight ? "Dark chart" : "Light chart"}
        >
          ☀/🌙
        </button>
        <button
          className="px-2 hover:bg-accent"
          onClick={() => setFullscreen((f) => !f)}
          title={fullscreen ? "Exit fullscreen" : "Fullscreen"}
        >
          ⤢
        </button>
        <span className="ml-auto px-2 text-muted-foreground">Demo · 1:{e.leverage} · USD</span>
      </div>
      <div className="flex flex-wrap items-center gap-1 border-b border-border bg-chrome px-1 py-1">
        <button className="mt-btn font-bold" onClick={() => open({ mode: "new", symbol })}>
          ⊕ New Order
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        {(Object.keys(TIMEFRAMES) as TF[]).map((t) => (
          <button
            key={t}
            onClick={() => setTf(t)}
            className={`mt-btn px-2 ${tf === t ? "bg-none bg-accent font-bold" : ""}`}
          >
            {t}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          className="mt-btn"
          aria-label="Zoom in"
          onClick={() => setZoom((z) => Math.min(3.5, z * 1.25))}
        >
          ＋
        </button>
        <button
          className="mt-btn"
          aria-label="Zoom out"
          onClick={() => setZoom((z) => Math.max(0.3, z / 1.25))}
        >
          －
        </button>
      </div>

      <div className="flex flex-col gap-0.5 p-0.5 md:min-h-0 md:flex-1 md:flex-row">
        <aside className="order-2 h-72 md:order-1 md:h-auto md:w-72">
          <MarketWatch
            selected={symbol}
            onSelect={setSymbol}
            onTrade={(s) => open({ mode: "new", symbol: s })}
          />
        </aside>
        <main className="order-1 h-[55vh] border border-border md:order-2 md:h-auto md:flex-1">
          <PriceChart symbol={symbol} tf={tf} zoom={zoom} />
        </main>
      </div>

      <div className="h-64 p-0.5 md:h-56">
        <Toolbox onModify={(t) => open({ mode: "modify", ticket: t })} />
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-border bg-chrome px-2 py-0.5">
        <span className={`truncate ${e.notice?.error ? "text-destructive" : ""}`}>
          {e.notice?.msg ?? "Ready"}
        </span>
        <span className="ml-auto">Equity {money(e.equity)}</span>
        <span className="text-up">● Connected</span>
      </div>

      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}

      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-2">
          <div className="w-full max-w-sm border border-border bg-background p-3 shadow-xl">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-bold text-primary">Deposit demo funds</span>
              <button onClick={() => setDepositOpen(false)} aria-label="Close" className="px-2">
                ✕
              </button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Add virtual money to your demo account. Minimum KSh 100, maximum KSh 10,000.
            </p>
            <input
              className="mt-input w-full"
              type="number"
              min={100}
              max={10000}
              step={1}
              inputMode="numeric"
              placeholder="Amount in KSh"
              value={depositAmount}
              onChange={(v) => setDepositAmount(v.target.value)}
            />
            {depositErr && <p className="mt-1 text-xs text-destructive">{depositErr}</p>}
            <div className="mt-3 flex gap-2">
              <button className="mt-btn flex-1" onClick={() => setDepositOpen(false)}>
                Cancel
              </button>
              <button
                className="flex-1 bg-primary py-1.5 text-primary-foreground"
                onClick={() => {
                  const n = Number(depositAmount);
                  if (!Number.isFinite(n)) return setDepositErr("Enter an amount");
                  if (n < 100) return setDepositErr("Minimum deposit is KSh 100");
                  if (n > 10000) return setDepositErr("Maximum deposit is KSh 10,000");
                  e.deposit(n);
                  setDepositOpen(false);
                }}
              >
                Deposit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
