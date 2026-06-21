import { createFileRoute } from "@tanstack/react-router";
import { TrendingUp, Zap, Plane, BarChart3, RefreshCw, Play } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge } from "@/components/ui-bits";
import { tradingProducts } from "@/lib/mock";

export const Route = createFileRoute("/trading")({
  head: () => ({
    meta: [
      { title: "Trading — PESAKI" },
      { name: "description", content: "Binary FX, Up & Down, Avimarket, Invest Prediction and Market Spin — all PESAKI trading products in one place." },
    ],
  }),
  component: TradingPage,
});

const icons: Record<string, React.ComponentType<{ className?: string }>> = {
  binary: BarChart3, updown: TrendingUp, avi: Plane, invest: Zap, spin: RefreshCw,
};

function TradingPage() {
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
    </AppShell>
  );
}
