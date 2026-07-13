import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { TradingSubShell, type TradeMode } from "@/components/TradingSubShell";
import { Card, Badge } from "@/components/ui-bits";
import { fmt } from "@/lib/mock";
import { useBalance } from "@/lib/balance";

export const Route = createFileRoute("/trading/up-down")({
  head: () => ({
    meta: [
      { title: "Up & Down — PESAKI Trading" },
      { name: "description", content: "Quick 30-second predictions on short-term market moves." },
    ],
  }),
  component: UpDownPage,
});

function UpDownPage() {
  const [mode, setMode] = useState<TradeMode>("demo");
  const [stake, setStake] = useState(100);
  const state = useBalance();
  const balance = mode === "real" ? state.available : 50000;

  return (
    <TradingSubShell title="Up & Down" subtitle="30s quick predictions" mode={mode} onModeChange={setMode}>
      <section className="px-5 pt-4">
        <Card className="!p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{mode === "real" ? "Available" : "Demo balance"}</p>
            <p className="font-display text-2xl font-bold">{fmt(balance)}</p>
          </div>
          <Badge tone="gold">92% payout</Badge>
        </Card>
      </section>

      <section className="mt-5 px-5">
        <Card>
          <div className="grid place-items-center py-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Round ends in</div>
            <div className="font-display text-5xl font-bold tabular-nums">00:27</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
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
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button className="flex h-14 flex-col items-center justify-center rounded-xl bg-success text-success-foreground font-bold">
              <TrendingUp className="h-5 w-5" />
              <span className="text-xs">UP</span>
            </button>
            <button className="flex h-14 flex-col items-center justify-center rounded-xl bg-destructive text-destructive-foreground font-bold">
              <TrendingDown className="h-5 w-5" />
              <span className="text-xs">DOWN</span>
            </button>
          </div>
        </Card>
      </section>
    </TradingSubShell>
  );
}
