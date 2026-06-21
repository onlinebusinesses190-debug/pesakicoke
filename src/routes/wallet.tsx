import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, History, Eye, EyeOff, TrendingUp } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { transactions, user, fmt } from "@/lib/mock";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — PESAKI" },
      { name: "description", content: "Deposit, withdraw, transfer and track all your PESAKI transactions in one secure wallet." },
    ],
  }),
  component: WalletPage,
});

function WalletPage() {
  const [show, setShow] = useState(true);
  const [filter, setFilter] = useState<string>("All");

  const types = ["All", "Deposit", "Withdrawal", "Trading", "Job Earnings", "Business Funding", "Savings"];
  const filtered = filter === "All" ? transactions : transactions.filter((t) => t.type === filter);

  return (
    <AppShell>
      <PageHeader title="Wallet" subtitle="Your PESAKI money center" />

      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-2xl" />
          <div className="relative flex items-start justify-between">
            <p className="text-xs uppercase tracking-widest opacity-80">Available Balance</p>
            <button onClick={() => setShow(!show)} className="opacity-80">
              {show ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          <p className="relative mt-1 font-display text-4xl font-bold tracking-tight">
            {show ? fmt(user.balance) : "•••••••"}
          </p>
          <div className="relative mt-5 grid grid-cols-3 gap-2">
            {[
              { l: "Deposit",  i: ArrowDownToLine },
              { l: "Withdraw", i: ArrowUpFromLine },
              { l: "Transfer", i: ArrowLeftRight  },
            ].map((a) => (
              <button key={a.l} className="flex flex-col items-center gap-1 rounded-xl bg-white/15 py-2.5 text-xs font-semibold backdrop-blur">
                <a.i className="h-4 w-4" />
                {a.l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <Stat label="Total Deposits"     value={fmt(225000)} tone="success" />
        <Stat label="Total Withdrawals"  value={fmt(118000)} tone="primary" />
        <Stat label="Pending"            value="2"           hint="KES 12,500" tone="gold" />
        <Stat label="Referral Earnings"  value={fmt(user.referralEarnings)} tone="gold" />
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="Transaction history" action={<History className="h-4 w-4 text-muted-foreground" />} />
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === t ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <Card className="mt-2 !p-2">
          <ul className="divide-y divide-border">
            {filtered.map((t) => {
              const positive = t.amount > 0;
              return (
                <li key={t.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${positive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    <TrendingUp className={`h-4 w-4 ${positive ? "" : "rotate-180"}`} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{t.type}</p>
                    <p className="truncate text-[11px] text-muted-foreground">{t.date}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-bold ${positive ? "text-success" : "text-foreground"}`}>
                      {positive ? "+" : ""}{fmt(t.amount).replace("KES ", "")}
                    </p>
                    <Badge tone={t.status === "Pending" ? "warning" : "success"}>{t.status}</Badge>
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-2 py-8 text-center text-xs text-muted-foreground">No transactions</li>
            )}
          </ul>
        </Card>
      </section>
    </AppShell>
  );
}
