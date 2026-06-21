import { createFileRoute } from "@tanstack/react-router";
import { Target, LineChart, PiggyBank, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Progress, Badge } from "@/components/ui-bits";
import { savingsGoals, fmt } from "@/lib/mock";

export const Route = createFileRoute("/banking")({
  head: () => ({
    meta: [
      { title: "Banking Hub — PESAKI" },
      { name: "description", content: "Savings plans, investment plans, and financial goals to grow your money securely." },
    ],
  }),
  component: BankingPage,
});

function BankingPage() {
  return (
    <AppShell>
      <PageHeader title="Banking Hub" subtitle="Secure. Premium. Growing." right={<Badge tone="success">Insured</Badge>} />

      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <PiggyBank className="absolute -right-3 -top-3 h-28 w-28 opacity-15" />
          <p className="text-xs uppercase tracking-widest opacity-80">Total Savings</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(430000)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Interest Earned</p>
              <p className="mt-0.5 font-semibold">{fmt(38400)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Projected (1yr)</p>
              <p className="mt-0.5 font-semibold">{fmt(495000)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3 px-5">
        <Stat label="APY" value="12%" tone="gold" />
        <Stat label="Goals" value="4" tone="primary" />
        <Stat label="Growth" value="+9.1%" tone="success" />
      </section>

      <section className="mt-6 px-5">
        <SectionTitle
          title="Financial Goals"
          action={
            <button className="inline-flex items-center gap-1 rounded-full gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
              <Plus className="h-3 w-3" /> New goal
            </button>
          }
        />
        <div className="space-y-2.5">
          {savingsGoals.map((g) => {
            const pct = Math.round((g.saved / g.target) * 100);
            return (
              <Card key={g.name} className="!p-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Target className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fmt(g.saved)} of {fmt(g.target)}</p>
                  </div>
                  <Badge tone="gold">{g.apy}</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1"><Progress value={pct} /></div>
                  <span className="text-xs font-bold text-primary">{pct}%</span>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="Growth history" />
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Last 6 months</p>
              <p className="mt-0.5 text-lg font-bold text-success">+ {fmt(28400)}</p>
            </div>
            <LineChart className="h-6 w-6 text-primary" />
          </div>
          <div className="mt-4 flex h-24 items-end gap-2">
            {[40, 55, 48, 70, 65, 88].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-lg gradient-primary" style={{ height: `${h}%` }} />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            {["Jan","Feb","Mar","Apr","May","Jun"].map((m) => <span key={m}>{m}</span>)}
          </div>
        </Card>
      </section>
    </AppShell>
  );
}
