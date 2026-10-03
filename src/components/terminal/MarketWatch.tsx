import { SYMBOLS } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export function MarketWatch({ selected, onSelect, onTrade }: {
  selected: string; onSelect: (s: string) => void; onTrade: (s: string) => void;
}) {
  const e = useEngine();
  const time = new Date().toLocaleTimeString("en-GB");
  return (
    <div className="flex h-full flex-col border border-border bg-card">
      <div className="border-b border-border bg-chrome px-2 py-1">Market Watch: {time}</div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr><th className="mt-th">Symbol</th><th className="mt-th text-right">Bid</th><th className="mt-th text-right">Ask</th><th className="mt-th text-right">!</th></tr>
          </thead>
          <tbody>
            {SYMBOLS.map((s) => {
              const q = e.quotes[s.name];
              const color = q.dir > 0 ? "text-up" : q.dir < 0 ? "text-down" : "";
              const sel = s.name === selected;
              const spread = Math.round((q.ask - q.bid) / s.point);
              return (
                <tr key={s.name} title={`${s.desc} — double-click to trade`}
                  onClick={() => onSelect(s.name)} onDoubleClick={() => onTrade(s.name)}
                  className={`cursor-default select-none ${sel ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
                  <td className="mt-td">{s.name}</td>
                  <td className={`mt-td text-right font-mono ${sel ? "" : color}`}>{q.bid.toFixed(s.digits)}</td>
                  <td className={`mt-td text-right font-mono ${sel ? "" : color}`}>{q.ask.toFixed(s.digits)}</td>
                  <td className="mt-td text-right font-mono">{spread}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border bg-chrome px-2 py-1 text-muted-foreground">
        Click to view chart · Double-click for New Order
      </div>
    </div>
  );
}
