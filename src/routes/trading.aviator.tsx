import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plane, Zap } from "lucide-react";
import { TradingSubShell, type TradeMode } from "@/components/TradingSubShell";
import { Card, Badge } from "@/components/ui-bits";
import { fmt } from "@/lib/mock";
import { useBalance } from "@/lib/balance";

export const Route = createFileRoute("/trading/aviator")({
  head: () => ({
    meta: [
      { title: "Avimarket — PESAKI Trading" },
      { name: "description", content: "Live multiplier game — cash out before the market crashes." },
    ],
  }),
  component: AviatorPage,
});

function AviatorPage() {
  const [mode, setMode] = useState<TradeMode>("demo");
  const [stake, setStake] = useState(100);
  const state = useBalance();
  const balance = mode === "real" ? state.available : 50000;

  return (
    <TradingSubShell title="Avimarket" subtitle="Cash out before the crash" mode={mode} onModeChange={setMode}>
      <section className="px-5 pt-4">
        <Card className="!p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{mode === "real" ? "Available" : "Demo balance"}</p>
            <p className="font-display text-2xl font-bold">{fmt(balance)}</p>
          </div>
          <Badge tone="success">Live</Badge>
        </Card>
      </section>

      <section className="mt-5 px-5">
        <Card>
          <div className="relative grid h-56 place-items-center overflow-hidden rounded-2xl bg-gradient-to-b from-primary/10 to-transparent">
            <Plane className="absolute left-6 top-6 h-6 w-6 text-primary" />
            <div className="text-center">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Multiplier</p>
              <p className="font-display text-5xl font-bold text-primary">x1.45</p>
              <p className="mt-1 text-[11px] text-muted-foreground">Rising…</p>
            </div>
          </div>

          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground">Stake</p>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {[100, 250, 500, 1000].map((s) => (
                <button
                  key={s}
                  onClick={() => setStake(s)}
                  className={`rounded-xl border px-2 py-2 text-xs font-semibold ${
                    stake === s ? "border-primary bg-primary/10 text-primary" : "border-border"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <button className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-gold font-bold text-gold-foreground">
            <Zap className="h-4 w-4" /> Cash Out
          </button>
        </Card>
      </section>
    </TradingSubShell>
  );
}
