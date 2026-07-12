import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Target, PiggyBank, Plus, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, HandCoins, Lock, Info, CheckCircle2, ShieldCheck, Calendar, X, ArrowLeft,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Progress, Badge } from "@/components/ui-bits";
import { savingsGoals, fmt } from "@/lib/mock";
import { balanceStore, useBalance, totalLocked } from "@/lib/balance";
import { toast } from "sonner";


export const Route = createFileRoute("/banking")({
  head: () => ({
    meta: [
      { title: "Banking Hub — PESAKI" },
      { name: "description", content: "Deposit, withdraw, lock funds, invest and borrow — your PESAKI bank in one place." },
    ],
  }),
  component: BankingPage,
});

type ActionKey = "deposit" | "withdraw" | "invest" | "loan";

const actions: { key: ActionKey; label: string; icon: any; tone: string }[] = [
  { key: "deposit",  label: "Deposit",  icon: ArrowDownToLine, tone: "bg-success/15 text-success" },
  { key: "withdraw", label: "Withdraw", icon: ArrowUpFromLine, tone: "bg-primary/10 text-primary" },
  { key: "invest",   label: "Invest",   icon: TrendingUp,      tone: "bg-gold/15 text-gold-foreground" },
  { key: "loan",     label: "Loan",     icon: HandCoins,       tone: "bg-muted text-foreground" },
];

const durations = [
  { months: 3,  apy: 4,  label: "3 months",  hint: "Flexible" },
  { months: 6,  apy: 6,  label: "6 months",  hint: "Balanced" },
  { months: 12, apy: 8,  label: "12 months", hint: "Popular", featured: true },
  { months: 24, apy: 10, label: "24 months", hint: "Best rate" },
];

function BankingPage() {
  const [modal, setModal] = useState<ActionKey | null>(null);
  const state = useBalance();
  const locked = totalLocked(state);


  return (
    <AppShell>
      <PageHeader title="Banking Hub" subtitle="Your PESAKI bank" right={<Badge tone="success"><ShieldCheck className="h-2.5 w-2.5" /> Insured</Badge>} />

      {/* Balance card */}
      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <PiggyBank className="absolute -right-3 -top-3 h-28 w-28 opacity-15" />
          <p className="text-xs uppercase tracking-widest opacity-80">Total Savings</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(state.available + locked)}</p>

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

      {/* Quick banking actions */}
      <section className="-mt-3 px-5">
        <Card className="grid grid-cols-4 gap-2">
          {actions.map((a) => (
            <button
              key={a.key}
              onClick={() => setModal(a.key)}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-muted"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${a.tone}`}>
                <a.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-semibold">{a.label}</span>
            </button>
          ))}
        </Card>
      </section>

      {/* KPIs */}
      <section className="mt-5 grid grid-cols-3 gap-3 px-5">
        <Stat label="Locked" value={fmt(locked)} tone="primary" />
        <Stat label="Available" value={fmt(state.available)} tone="success" />
        <Stat label="Avg. APY" value="8%" tone="gold" />
      </section>

      {/* Lock funds — the star card */}
      <section className="mt-6 px-5">
        <SectionTitle title="Lock funds & earn" action={<Badge tone="gold">Up to 10% APY</Badge>} />
        <LockFundsCard />
      </section>


      {/* Active locked deposits */}
      <section className="mt-6 px-5">
        <SectionTitle title="Active locked deposits" />
        <div className="space-y-2.5">
          {state.locked.length === 0 && (
            <Card className="!p-4 text-center text-xs text-muted-foreground">No locked deposits yet.</Card>
          )}
          {state.locked.map((d) => {
            const pct = Math.round((d.days / d.total) * 100);
            const daysLeft = d.total - d.days;
            const projected = Math.round(d.amount * (d.apy / 100) * (d.total / 365));
            return (
              <Card key={d.id} className="!p-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Lock className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fmt(d.amount)} · earns {fmt(projected)}</p>
                  </div>
                  <Badge tone="gold">{d.apy}% APY</Badge>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex-1"><Progress value={pct} /></div>
                  <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap">{daysLeft}d left</span>
                </div>
              </Card>
            );
          })}
        </div>

      </section>

      {/* Financial Goals */}
      <section className="mt-6 px-5">
        <SectionTitle
          title="Financial goals"
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

      {/* Loan preview */}
      <section className="mt-6 px-5">
        <SectionTitle title="Instant loans" action={<button onClick={() => setModal("loan")} className="text-xs font-semibold text-primary">Apply</button>} />
        <Card className="!p-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold-foreground">
              <HandCoins className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">You qualify for up to</p>
              <p className="text-lg font-bold text-primary">{fmt(150000)}</p>
              <p className="text-[11px] text-muted-foreground">5% p.a. · Repay in 3–24 months</p>
            </div>
            <button onClick={() => setModal("loan")} className="rounded-full gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
              Get loan
            </button>
          </div>
        </Card>
      </section>

      <p className="my-8 px-5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Funds insured · Secured by PESAKI
      </p>

      {modal && <ActionSheet action={modal} onClose={() => setModal(null)} />}
    </AppShell>
  );
}

function LockFundsCard() {
  const [amount, setAmount] = useState<number>(50000);
  const [months, setMonths] = useState<number>(12);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const selected = durations.find((d) => d.months === months)!;
  const interest = useMemo(
    () => Math.round(amount * (selected.apy / 100) * (months / 12)),
    [amount, months, selected.apy],
  );
  const total = amount + interest;

  const presets = [10000, 25000, 50000, 100000];

  if (done) {
    return (
      <Card className="!p-5 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <p className="mt-3 text-base font-bold">Funds locked</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {fmt(amount)} locked for {months} months at {selected.apy}% APY.
        </p>
        <button
          onClick={() => setDone(false)}
          className="mt-4 rounded-full border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
        >
          Lock another
        </button>
      </Card>
    );
  }

  return (
    <>
    <Card className="!p-4">
      {/* Amount */}
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount to lock</label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">KES</span>
        <input
          type="number"
          min={1000}
          step={1000}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-lg font-bold outline-none"
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => setAmount(p)}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              amount === p ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {fmt(p).replace("KES ", "KES ")}
          </button>
        ))}
      </div>

      {/* Duration */}
      <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Choose duration</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {durations.map((d) => {
          const active = d.months === months;
          return (
            <button
              key={d.months}
              onClick={() => setMonths(d.months)}
              className={`relative rounded-xl border p-3 text-left transition-all ${
                active ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-primary/40"
              }`}
            >
              {d.featured && (
                <span className="absolute -top-2 right-2 rounded-full bg-gold px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gold-foreground">
                  Popular
                </span>
              )}
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <Calendar className="h-3 w-3" /> {d.label}
              </div>
              <div className="mt-1 text-lg font-bold text-primary">{d.apy}%</div>
              <div className="text-[10px] text-muted-foreground">{d.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 rounded-xl bg-muted/60 p-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Interest ({selected.apy}% APY)</span>
          <span className="font-bold text-success">+ {fmt(interest)}</span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">At maturity</span>
          <span className="font-bold text-primary">{fmt(total)}</span>
        </div>
        <div className="mt-2 flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>Early withdrawal available with reduced interest. Funds insured up to KES 500,000.</span>
        </div>
      </div>

      <button
        onClick={() => setConfirming(true)}
        disabled={amount < 1000}
        className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground shadow hover:opacity-95 disabled:opacity-50"
      >
        <span className="inline-flex items-center gap-2">
          <Lock className="h-4 w-4" /> Lock Now
        </span>
      </button>
    </Card>

    {confirming && (
      <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
        <div className="absolute inset-0 bg-black/50" onClick={() => setConfirming(false)} />
        <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
          <div className="mb-4 flex items-center justify-between">
            <button
              onClick={() => setConfirming(false)}
              className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h3 className="text-base font-bold">Confirm lock</h3>
            <button onClick={() => setConfirming(false)} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
            <Lock className="h-6 w-6" />
          </div>
          <p className="mt-3 text-center text-xs text-muted-foreground">Please review the details below before locking your funds.</p>

          <div className="mt-4 divide-y divide-border rounded-xl border border-border">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">Amount</span>
              <span className="text-sm font-bold">{fmt(amount)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">Duration</span>
              <span className="text-sm font-bold">{months} months</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">APY</span>
              <span className="text-sm font-bold text-primary">{selected.apy}%</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">Interest earned</span>
              <span className="text-sm font-bold text-success">+ {fmt(interest)}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-muted-foreground">Total at maturity</span>
              <span className="text-sm font-bold text-primary">{fmt(total)}</span>
            </div>
          </div>

          <button
            onClick={() => {
              const res = balanceStore.lock(`${months}-Month Lock`, amount, months, selected.apy);
              if (!res.ok) { toast.error(res.error!); return; }
              toast.success(`Locked ${fmt(amount)} for ${months} months`);
              setConfirming(false); setDone(true);
            }}
            className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
          >
            <span className="inline-flex items-center gap-2"><Lock className="h-4 w-4" /> Confirm Lock</span>
          </button>

          <button
            onClick={() => setConfirming(false)}
            className="mt-2 h-11 w-full rounded-xl border border-border text-sm font-semibold"
          >
            Cancel
          </button>
        </div>
      </div>
    )}
    </>
  );
}

function ActionSheet({ action, onClose }: { action: ActionKey; onClose: () => void }) {
  const config = {
    deposit:  { title: "Deposit funds",  cta: "Deposit",  hint: "Top up via M-Pesa, bank or card." },
    withdraw: { title: "Withdraw funds", cta: "Withdraw", hint: "Instant to M-Pesa or bank." },
    invest:   { title: "New investment", cta: "Invest",   hint: "Grow with our curated portfolios." },
    loan:     { title: "Apply for loan", cta: "Apply",    hint: "Get pre-approved in minutes." },
  }[action];

  const [amount, setAmount] = useState<number>(action === "loan" ? 20000 : 5000);
  const [months, setMonths] = useState<number>(6);
  const [done, setDone] = useState(false);

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold">{config.title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-base font-bold">Request submitted</p>
            <p className="mt-1 text-xs text-muted-foreground">
              We'll notify you as soon as it's processed.
            </p>
            <button
              onClick={onClose}
              className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">{config.hint}</p>

            <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount
            </label>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
              <span className="text-sm font-semibold text-muted-foreground">KES</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
                className="w-full bg-transparent text-lg font-bold outline-none"
              />
            </div>

            {action === "loan" && (
              <>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Repayment period</p>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {[3, 6, 12, 24].map((m) => (
                    <button
                      key={m}
                      onClick={() => setMonths(m)}
                      className={`rounded-lg border py-2 text-xs font-semibold ${
                        months === m ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Monthly repayment</span><span className="font-bold">{fmt(Math.round((amount * 1.08) / months))}</span></div>
                  <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Total to repay</span><span className="font-bold text-primary">{fmt(Math.round(amount * 1.08))}</span></div>
                </div>
              </>
            )}

            {action === "invest" && (
              <div className="mt-3 rounded-lg bg-gold/10 p-3 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Est. annual return</span><span className="font-bold text-success">+ {fmt(Math.round(amount * 0.15))}</span></div>
              </div>
            )}

            <button
              onClick={() => setDone(true)}
              disabled={amount < 100}
              className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {config.cta} {fmt(amount)}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
