import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw, Gift } from "lucide-react";
import { TradingSubShell, type TradeMode } from "@/components/TradingSubShell";
import { Card, Badge } from "@/components/ui-bits";
import { fmt } from "@/lib/mock";
import { useBalance } from "@/lib/balance";

export const Route = createFileRoute("/trading/spin")({
  head: () => ({
    meta: [
      { title: "Market Spin — PESAKI Trading" },
      { name: "description", content: "Daily market spin for instant rewards on PESAKI." },
    ],
  }),
  component: SpinPage,
});

const rewards = ["x1.2", "x1.5", "x2", "x0.5", "x3", "x0.8", "x5", "x1"];

function SpinPage() {
  const [mode, setMode] = useState<TradeMode>("demo");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const state = useBalance();
  const balance = mode === "real" ? state.available : 50000;

  const spin = () => {
    setSpinning(true);
    setResult(null);
    setTimeout(() => {
      setResult(rewards[Math.floor(Math.random() * rewards.length)]);
      setSpinning(false);
    }, 1600);
  };

  return (
    <TradingSubShell title="Market Spin" subtitle="One free spin every 24h" mode={mode} onModeChange={setMode}>
      <section className="px-5 pt-4">
        <Card className="!p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{mode === "real" ? "Available" : "Demo balance"}</p>
            <p className="font-display text-2xl font-bold">{fmt(balance)}</p>
          </div>
          <Badge tone="gold">Resets 04:12:33</Badge>
        </Card>
      </section>

      <section className="mt-5 px-5">
        <Card>
          <div className="mx-auto grid h-56 w-56 place-items-center">
            <div
              className={`grid h-52 w-52 place-items-center rounded-full gradient-primary text-primary-foreground shadow-[var(--shadow-elevated)] transition-transform duration-[1600ms] ${
                spinning ? "rotate-[1440deg]" : ""
              }`}
              style={{ transitionTimingFunction: "cubic-bezier(0.15,0.85,0.3,1)" }}
            >
              {result ? (
                <div className="text-center">
                  <Gift className="mx-auto h-6 w-6" />
                  <p className="mt-1 font-display text-3xl font-bold">{result}</p>
                  <p className="text-[10px] uppercase tracking-widest opacity-80">You won</p>
                </div>
              ) : (
                <RefreshCw className={`h-12 w-12 ${spinning ? "animate-spin" : ""}`} />
              )}
            </div>
          </div>
          <button
            onClick={spin}
            disabled={spinning}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-bold text-gold-foreground disabled:opacity-60"
          >
            {spinning ? "Spinning…" : "Spin Now"}
          </button>
        </Card>
      </section>
    </TradingSubShell>
  );
}
