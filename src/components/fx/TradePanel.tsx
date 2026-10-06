import { useState } from "react";
import { LEVERAGE, MAX_AMOUNT, MIN_AMOUNT, quoteAt, type Pair, type Side } from "@/lib/fx/market";
import { ksh } from "@/lib/fx/format";

const CHIPS = [100, 500, 1000, 5000, 10000];

export function amountError(amount: number, balance: number, mode: string) {
  const margin = Math.round((amount / LEVERAGE) * 100) / 100;
  return amount < MIN_AMOUNT ? `Minimum trade is ${ksh(MIN_AMOUNT)}`
    : amount > MAX_AMOUNT ? `Maximum trade is ${ksh(MAX_AMOUNT)}`
    : margin > balance ? `Not enough money in your ${mode} wallet` : "";
}

/** Amount entry + leverage explanation. */
export function TradePanel({ pair, raw, setRaw, mode, balance }: {
  pair: Pair; raw: string; setRaw: (v: string) => void; mode: "demo" | "real"; balance: number;
}) {
  const [help, setHelp] = useState(false);
  const amount = Number(raw) || 0;
  const margin = Math.round((amount / LEVERAGE) * 100) / 100;
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
      <div className="rounded-md bg-muted p-2.5 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-semibold">Leverage: {LEVERAGE}×</span>
          <button onClick={() => setHelp((h) => !h)} className="text-xs font-semibold text-primary underline">{help ? "Hide" : "What is this?"}</button>
        </div>
        <p className="mt-1">You put down <b>{ksh(margin)}</b> to open a <b>{ksh(amount)}</b> trade.</p>
        {help && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            Profit and loss are counted on the full amount: if {pair.label} moves 1% your way you gain {ksh(amount * 0.01)},
            1% against you loses {ksh(amount * 0.01)}. If losses use up your margin, the trade closes automatically — you can never lose more than {ksh(margin)}.
          </p>
        )}
      </div>
      {err && <p className="text-sm font-semibold text-destructive">{err}</p>}
    </div>
  );
}

/** Permanent SELL / BUY bar using live bid/ask. */
export function ExecBar({ pair, now, mode, amount, balance, busy, onTrade }: {
  pair: Pair; now: number; mode: "demo" | "real"; amount: number; balance: number; busy: boolean;
  onTrade: (side: Side, amount: number) => void;
}) {
  const [confirm, setConfirm] = useState<Side | null>(null);
  const q = quoteAt(pair, now);
  const err = amountError(amount, balance, mode);
  const spread = Math.round((q.ask - q.bid) * 10 ** pair.digits);
  const go = (side: Side) => { if (err) return; if (mode === "real") setConfirm(side); else onTrade(side, amount); };

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
        <button disabled={!!err || busy} onClick={() => go("sell")}
          className="rounded-lg bg-sell px-2 py-2.5 text-trade-foreground hover:opacity-90 disabled:opacity-40">
          <span className="block text-sm font-extrabold">SELL</span>
          <span className="num block text-lg font-bold">{q.bid.toFixed(pair.digits)}</span>
        </button>
        <div className="flex flex-col items-center justify-center text-xs text-muted-foreground">
          <span>Spread</span><span className="num font-bold text-foreground">{spread}</span>
        </div>
        <button disabled={!!err || busy} onClick={() => go("buy")}
          className="rounded-lg bg-buy px-2 py-2.5 text-trade-foreground hover:opacity-90 disabled:opacity-40">
          <span className="block text-sm font-extrabold">BUY</span>
          <span className="num block text-lg font-bold">{q.ask.toFixed(pair.digits)}</span>
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
              <div className="flex justify-between"><dt className="text-muted-foreground">Margin taken</dt><dd className="num font-bold">{ksh(amount / 10)}</dd></div>
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
