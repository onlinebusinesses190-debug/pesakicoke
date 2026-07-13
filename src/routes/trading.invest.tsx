import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { TradingSubShell, type TradeMode } from "@/components/TradingSubShell";
import { Card, Badge } from "@/components/ui-bits";
import { fmt } from "@/lib/mock";
import { useBalance } from "@/lib/balance";

export const Route = createFileRoute("/trading/invest")({
  head: () => ({
    meta: [
      { title: "Invest Prediction — PESAKI Trading" },
      { name: "description", content: "Predict long-term asset performance and earn steady returns." },
    ],
  }),
  component: InvestPage,
});

const assets = [
  { symbol: "SCOM",  name: "Safaricom",     apy: "+18.4%", tone: "success" as const },
  { symbol: "EQTY",  name: "Equity Bank",   apy: "+12.1%", tone: "primary" as const },
  { symbol: "KCB",   name: "KCB Group",     apy: "+9.8%",  tone: "primary" as const },
  { symbol: "GOLD",  name: "Gold Basket",   apy: "+6.4%",  tone: "gold"    as const },
];

function InvestPage() {
  const [mode, setMode] = useState<TradeMode>("demo");
  const [selected, setSelected] = useState(assets[0].symbol);
  const state = useBalance();
  const balance = mode === "real" ? state.available : 50000;

  return (
    <TradingSubShell title="Invest Prediction" subtitle="Long-term asset picks" mode={mode} onModeChange={setMode}>
      <section className="px-5 pt-4">
        <Card className="!p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{mode === "real" ? "Available" : "Demo balance"}</p>
            <p className="font-display text-2xl font-bold">{fmt(balance)}</p>
          </div>
          <Badge tone="success">+18.4% avg</Badge>
        </Card>
      </section>

      <section className="mt-5 space-y-2.5 px-5">
        {assets.map((a) => (
          <button
            key={a.symbol}
            onClick={() => setSelected(a.symbol)}
            className={`w-full rounded-2xl border p-4 text-left transition-colors ${
              selected === a.symbol ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold">{a.name}</p>
                <p className="text-[11px] text-muted-foreground">{a.symbol} · 12M projection</p>
              </div>
              <div className="flex items-center gap-1 text-success">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm font-bold">{a.apy}</span>
              </div>
            </div>
          </button>
        ))}
      </section>

      <section className="mt-4 px-5">
        <button className="flex h-12 w-full items-center justify-center rounded-xl gradient-primary font-bold text-primary-foreground">
          Invest in {selected}
        </button>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          Predictions are estimates. Investments carry risk.
        </p>
      </section>
    </TradingSubShell>
  );
}
