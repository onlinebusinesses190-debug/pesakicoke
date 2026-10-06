import { PAIRS, dayChange, quoteAt } from "@/lib/fx/market";

export function MarketList({ selected, onSelect, now }: { selected: string; onSelect: (s: string) => void; now: number }) {
  return (
    <div className="flex h-full flex-col rounded-lg border border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <h2 className="font-bold">Market Watch</h2>
        <p className="text-xs text-muted-foreground">Tap a currency pair to trade it</p>
      </div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 px-3 pt-2 text-xs font-semibold text-muted-foreground">
        <span>Pair</span><span className="text-right">Sell</span><span className="text-right">Buy</span>
      </div>
      <ul className="flex-1 overflow-auto p-1.5">
        {PAIRS.map((p) => {
          const q = quoteAt(p, now);
          const prev = quoteAt(p, now - 1);
          const ch = dayChange(p, now);
          const tick = q.bid > prev.bid ? "text-up" : q.bid < prev.bid ? "text-down" : "text-foreground";
          const sel = p.symbol === selected;
          return (
            <li key={p.symbol}>
              <button onClick={() => onSelect(p.symbol)}
                className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-3 rounded-md px-2 py-2 text-left transition-colors ${sel ? "bg-accent ring-2 ring-primary" : "hover:bg-muted"}`}>
                <span>
                  <span className="block font-bold">{p.label}</span>
                  <span className={`block text-xs ${ch >= 0 ? "text-up" : "text-down"}`}>{ch >= 0 ? "▲" : "▼"} {Math.abs(ch).toFixed(2)}% today</span>
                </span>
                <span className={`num text-right font-semibold ${tick}`}>{q.bid.toFixed(p.digits)}</span>
                <span className={`num text-right font-semibold ${tick}`}>{q.ask.toFixed(p.digits)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
