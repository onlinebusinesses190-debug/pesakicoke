import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowUp, ArrowDown, BarChart3 } from "lucide-react";
import { TradingSubShell, type TradeMode } from "@/components/TradingSubShell";
import { Card, Badge } from "@/components/ui-bits";
import { fmt } from "@/lib/mock";
import { useBalance } from "@/lib/balance";

export const Route = createFileRoute("/trading/fx")({
  head: () => ({
    meta: [
      { title: "Binary FX — PESAKI Trading" },
      { name: "description", content: "Predict market direction on major FX pairs with Binary FX on PESAKI." },
    ],
  }),
  component: BinaryFxPage,
});

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "USD/KES"];
const stakes = [100, 500, 1000, 2500];

function BinaryFxPage() {
  const [mode, setMode] = useState<TradeMode>("demo");
  const [pair, setPair] = useState(pairs[0]);
  const [stake, setStake] = useState(stakes[0]);
  const [dur, setDur] = useState("60s");
  const state = useBalance();

  return (
    <TradingSubShell title="Binary FX" subtitle="Predict price direction" mode={mode} onModeChange={setMode}>
      <section className="px-5 pt-4">
        <Card className="!p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {mode === "real" ? "Available balance" : "Demo balance"}
            </span>
            <Badge tone={mode === "real" ? "primary" : "gold"}>{mode === "real" ? "Live" : "Practice"}</Badge>
          </div>
          <p className="mt-1 font-display text-2xl font-bold">
            {mode === "real" ? fmt(state.available) : "KES 50,000"}
          </p>
        </Card>
      </section>

      <section className="mt-5 px-5">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Pair</p>
              <p className="text-lg font-bold">{pair}</p>
            </div>
            <div className="flex items-center gap-1 text-success">
              <BarChart3 className="h-4 w-4" />
              <span className="text-xs font-semibold">+0.34%</span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {pairs.map((p) => (
              <button
                key={p}
                onClick={() => setPair(p)}
                className={`rounded-lg px-2 py-1.5 text-[11px] font-semibold ${
                  pair === p ? "gradient-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>

          <div className="mt-4 h-32 rounded-xl bg-muted/60 relative overflow-hidden">
            <svg viewBox="0 0 200 80" className="absolute inset-0 h-full w-full">
              <polyline
                points="0,60 20,50 40,55 60,40 80,45 100,30 120,35 140,20 160,25 180,15 200,20"
                fill="none"
                stroke="oklch(0.55 0.13 165)"
                strokeWidth="2"
              />
            </svg>
          </div>
        </Card>
      </section>

      <section className="mt-4 px-5">
        <Card>
          <p className="text-xs font-semibold text-muted-foreground">Stake</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {stakes.map((s) => (
              <button
                key={s}
                onClick={() => setStake(s)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                  stake === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                }`}
              >
                {fmt(s).replace("KES ", "")}
              </button>
            ))}
          </div>
          <p className="mt-4 text-xs font-semibold text-muted-foreground">Duration</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {["30s", "60s", "3m", "5m"].map((d) => (
              <button
                key={d}
                onClick={() => setDur(d)}
                className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                  dur === d ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-success text-success-foreground font-bold">
              <ArrowUp className="h-4 w-4" /> Higher
            </button>
            <button className="flex h-12 items-center justify-center gap-2 rounded-xl bg-destructive text-destructive-foreground font-bold">
              <ArrowDown className="h-4 w-4" /> Lower
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Payout up to 92% · {mode === "demo" ? "No real funds at risk" : "Trades use your wallet balance"}
          </p>
        </Card>
      </section>
    </TradingSubShell>
  );
}
