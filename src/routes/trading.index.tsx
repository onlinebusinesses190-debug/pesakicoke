import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { TrendingUp, Zap, Plane, BarChart3, RefreshCw, Play, DollarSign, AlertTriangle, X, ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge } from "@/components/ui-bits";
import { tradingProducts } from "@/lib/mock";

export const Route = createFileRoute("/trading/")({
  head: () => ({
    meta: [
      { title: "Trading — PESAKI" },
      { name: "description", content: "Forex, Binary FX, Up & Down, Avimarket, Invest Prediction and Market Spin — all PESAKI trading products in one place." },
    ],
  }),
  component: TradingPage,
});

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  binary: BarChart3, updown: TrendingUp, avi: Plane, invest: Zap, spin: RefreshCw,
};

function TradingPage() {
  const [showForexGate, setShowForexGate] = useState(false);

  return (
    <AppShell>
      <PageHeader title="Trading Floor" subtitle="Predict. Trade. Earn." right={<Badge tone="success">Live</Badge>} />

      <section className="px-5 pt-5">
        <div className="gradient-primary rounded-2xl p-5 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-80">Today's P&L</p>
          <p className="mt-1 font-display text-3xl font-bold">+ KES 3,420</p>
          <p className="mt-1 text-xs opacity-80">12 active trades · 8 winning</p>
        </div>
      </section>

      <section className="mt-6 space-y-3 px-5">
        {/* Forex — advanced, gated */}
        <Card className="!p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl gradient-gold text-gold-foreground">
              <DollarSign className="h-6 w-6" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-base font-bold">Forex Trading</h3>
                <Badge tone="gold">Advanced</Badge>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">Trade major currency pairs with leverage. Requires prior experience.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setShowForexGate(true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold">
                  <Play className="h-3 w-3" /> Demo
                </button>
                <button onClick={() => setShowForexGate(true)} className="inline-flex flex-1 items-center justify-center gap-1 rounded-full gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                  Real Mode
                </button>
              </div>
            </div>
          </div>
        </Card>

        {tradingProducts.map((p) => {
          const Icon = icons[p.key];
          const tone = p.color as "primary" | "gold" | "success";
          return (
            <Card key={p.key} className="!p-4">
              <div className="flex items-start gap-3">
                <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${
                  tone === "gold" ? "gradient-gold text-gold-foreground"
                  : tone === "success" ? "bg-success/15 text-success"
                  : "gradient-primary text-primary-foreground"
                }`}>
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="truncate text-base font-bold">{p.name}</h3>
                    <Badge tone={tone}>{p.stat}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{p.desc}</p>
                  <div className="mt-3 flex gap-2">
                    <button className="inline-flex flex-1 items-center justify-center gap-1 rounded-full border border-border bg-background px-3 py-2 text-xs font-semibold">
                      <Play className="h-3 w-3" /> Demo
                    </button>
                    <button className="inline-flex flex-1 items-center justify-center gap-1 rounded-full gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
                      Real Mode
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </section>

      <p className="mt-6 px-5 text-center text-[10px] text-muted-foreground">
        Trading involves risk. Trade responsibly.
      </p>

      {showForexGate && (
        <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowForexGate(false)} />
          <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">Experience required</h3>
              <button onClick={() => setShowForexGate(false)} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-gold/15 text-gold-foreground">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <p className="mt-4 text-center text-sm font-semibold">Sorry, before participating in forex trading you should have at least a 1 month experience in binary trading.</p>
            <p className="mt-2 text-center text-xs text-muted-foreground">Build up your skills on Binary FX first — it's the safest way to learn market direction.</p>

            <Link
              to="/trading"
              onClick={() => setShowForexGate(false)}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
            >
              <BarChart3 className="h-4 w-4" /> Go to Binary FX <ChevronRight className="h-4 w-4" />
            </Link>
            <button
              onClick={() => setShowForexGate(false)}
              className="mt-2 h-11 w-full rounded-xl border border-border text-sm font-semibold"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
