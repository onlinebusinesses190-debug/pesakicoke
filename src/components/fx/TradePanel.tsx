import { useState } from "react";
import { MAX_AMOUNT, MIN_AMOUNT, configuredLeverage, quoteAt, type Pair, type Side } from "@/lib/fx/market";
import { ksh } from "@/lib/fx/format";

const CHIPS = [100, 500, 1000, 5000, 10000];

export function amountError(amount: number, balance: number, mode: string) {
  return amount < MIN_AMOUNT ? `Minimum trade is ${ksh(MIN_AMOUNT)}`
    : amount > MAX_AMOUNT ? `Maximum trade is ${ksh(MAX_AMOUNT)}`
    : amount > balance ? `Not enough money in your ${mode} wallet` : "";
}

export function TradePanel({ pair, raw, setRaw, mode, balance }: {
  pair: Pair; raw: string; setRaw: (v: string) => void; mode: "demo" | "real"; balance: number;
}) {
  const amount = Number(raw) || 0;
  const err = amountError(amount, balance, mode);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <label className="block">
        <span className="font-semibold">Trade amount</span>
        <div className="mt-1 flex items-center rounded-md border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
          <span className="pl-3 font-semibold text-muted-foreground">KSh</span>
          <input value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal"
            className="num w-full bg-transparent px-2 py-2 text-lg font-bold outline-none" aria-label="Trade amount in KSh" />
        </div>
        <span className="mt-1 block text-xs text-muted-foreground">Min {ksh(MIN_AMOUNT)} · Max {ksh(MAX_AMOUNT)}</span>
      </label>
      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button key={c} onClick={() => setRaw(String(c))}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${amount === c ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted"}`}>
            {c.toLocaleString()}
          </button>
        ))}
      </div>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
    </div>
  );
}

export function ExecBar({ pair, now, mode, amount, balance, busy, onTrade }: {
  pair: Pair; now: number; mode: "demo" | "real"; amount: number; balance: number; busy: boolean;
  onTrade: (side: Side, amount: number) => void;
}) {
  const [confirm, setConfirm] = useState<Side | null>(null);
  const q = quoteAt(pair, now);
  const err = amountError(amount, balance, mode);
  const spread = Math.round((q.ask - q.bid) * 10 ** pair.digits);
  const leverage = configuredLeverage();
  const go = (side: Side) => { if (err) return; if (mode === "real") setConfirm(side); else onTrade(side, amount); };

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1">
        <button disabled={!!err || busy} onClick={() => go("sell")}
          className="rounded-lg bg-sell px-1 py-1.5 text-trade-foreground hover:opacity-90 disabled:opacity-40">
          <span className="block text-xs font-extrabold">SELL</span>
          <span className="num block text-sm font-bold">{q.bid.toFixed(pair.digits)}</span>
        </button>
        <div className="flex flex-col items-center justify-center text-xs text-muted-foreground">
          <span>Spread</span><span className="num font-bold text-foreground">{spread}</span>
          <span className="mt-1">1:{leverage}</span>
          <span className="text-[7px] uppercase">Lev</span>
        </div>
        <button disabled={!!err || busy} onClick={() => go("buy")}
          className="rounded-lg bg-buy px-1 py-1.5 text-trade-foreground hover:opacity-90 disabled:opacity-40">
          <span className="block text-xs font-extrabold">BUY</span>
          <span className="num block text-sm font-bold">{q.ask.toFixed(pair.digits)}</span>
        </button>
      </div>
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-sm rounded-xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-bold uppercase tracking-wide text-real">Real money trade</p>
            <h3 className={`mt-1 text-2xl font-extrabold ${confirm === "buy" ? "text-buy" : "text-sell"}`}>Confirm {confirm.toUpperCase()} {pair.label}</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between"><dt className="text-muted-foreground">Trade amount</dt><dd className="num font-bold">{ksh(amount)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Price now</dt><dd className="num font-bold">{(confirm === "buy" ? q.ask : q.bid).toFixed(pair.digits)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">The final entry price is set the moment you confirm.</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button onClick={() => setConfirm(null)} className="rounded-lg border border-border py-2.5 font-semibold hover:bg-muted">Cancel</button>
              <button onClick={() => { onTrade(confirm, amount); setConfirm(null); }}
                className={`rounded-lg py-2.5 font-bold text-trade-foreground ${confirm === "buy" ? "bg-buy" : "bg-sell"}`}>Confirm {confirm.toUpperCase()}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
