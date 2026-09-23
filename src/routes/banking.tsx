import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import {
  Target, PiggyBank, Plus, ArrowDownToLine, ArrowUpFromLine,
  TrendingUp, HandCoins, Lock, Info, CheckCircle2, ShieldCheck, Calendar, X, ArrowLeft,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Progress, Badge } from "@/components/ui-bits";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/banking")({
  head: () => ({
    meta: [
      { title: "Banking Hub — PESAKI" },
      { name: "description", content: "Deposit, withdraw, invest and borrow – your PESAKI bank in one place." },
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

// Helper: format currency
const fmt = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
};

function BankingPage() {
  const { user } = useAuth();
  const [modal, setModal] = useState<ActionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef(false);

  // ─── Supabase client ──────────────────────────────────────────────────────
  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  // ─── Data state ──────────────────────────────────────────────────────────
  const [summary, setSummary] = useState({
    totalSavings: 0,
    interestEarned: 0,
    projectedAnnual: 0,
    lockedTotal: 0,
    availableBalance: 0,
    avgApy: 0,
  });
  const [deposits, setDeposits] = useState<any[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<any[]>([]);

  // ─── Fetch banking data directly from Supabase ──────────────────────────
  const fetchBankingData = async () => {
    // ✅ If no user, stop loading and return
    if (!user) {
      console.log("🟡 Banking: No user – setting loading false");
      setLoading(false);
      return;
    }

    // ✅ Prevent multiple simultaneous fetches
    if (hasFetched.current) {
      console.log("⏭️ Banking: Already fetched – skipping");
      return;
    }

    hasFetched.current = true;
    setLoading(true);

    try {
      // 1. Fetch wallet balance
      // Use let so we can reassign if 'locked' column is missing
      let walletData: any;

      try {
        // Try fetching with 'locked' column first
        const { data, error } = await supabase
          .from('wallets')
          .select('balance, locked')
          .eq('user_id', user.id)
          .single();

        if (!error) {
          walletData = data;
        } else {
          // If 'locked' column doesn't exist, fetch just balance
          const { data: balanceOnly, error: balanceErr } = await supabase
            .from('wallets')
            .select('balance')
            .eq('user_id', user.id)
            .single();

          if (balanceErr) throw balanceErr;
          walletData = { ...balanceOnly, locked: 0 };
        }
      } catch (err) {
        throw err;
      }

      // 2. Fetch completed deposits from mpesa_deposits
      const { data: depositData, error: depositErr } = await supabase
        .from('mpesa_deposits')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false });

      if (depositErr) throw depositErr;

      // 3. Fetch savings goals (if any)
      const { data: goalsData, error: goalsErr } = await supabase
        .from('savings_goals')
        .select('*')
        .order('created_at', { ascending: false });

      if (goalsErr) throw goalsErr;

      // ── Calculate summary ──────────────────────────────────────────────
      const totalLocked = walletData?.locked || 0;
      const totalSavings = (walletData?.balance || 0) + totalLocked;

      setSummary({
        totalSavings: totalSavings,
        interestEarned: 0,
        projectedAnnual: 0,
        lockedTotal: totalLocked,
        availableBalance: walletData?.balance || 0,
        avgApy: 0,
      });

      setDeposits(depositData || []);
      setSavingsGoals(goalsData || []);

    } catch (err) {
      console.error('🔴 Failed to load banking data:', err);
      toast.error('Could not load banking data');
    } finally {
      console.log("🟣 Banking: Setting loading false");
      setLoading(false);
    }
  };

  // ─── Effect ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user && !hasFetched.current) {
      fetchBankingData();
    }
    if (!user) {
      setLoading(false);
    }
  }, [user?.id]);

  const refreshBanking = () => {
    hasFetched.current = false;
    fetchBankingData();
  };

  const { totalSavings, interestEarned, projectedAnnual, lockedTotal, availableBalance, avgApy } = summary;

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Banking Hub" subtitle="Your PESAKI bank" right={<Badge tone="success"><ShieldCheck className="h-2.5 w-2.5" /> Insured</Badge>} />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading banking data...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Banking Hub" subtitle="Your PESAKI bank" right={<Badge tone="success"><ShieldCheck className="h-2.5 w-2.5" /> Insured</Badge>} />

      {/* Balance card */}
      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <PiggyBank className="absolute -right-3 -top-3 h-28 w-28 opacity-15" />
          <p className="text-xs uppercase tracking-widest opacity-80">Total Savings</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(totalSavings)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Interest Earned</p>
              <p className="mt-0.5 font-semibold">{fmt(interestEarned)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Projected (1yr)</p>
              <p className="mt-0.5 font-semibold">{fmt(projectedAnnual)}</p>
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
        <Stat label="Locked" value={fmt(lockedTotal)} tone="primary" />
        <Stat label="Available" value={fmt(availableBalance)} tone="success" />
        <Stat label="Avg. APY" value={`${avgApy}%`} tone="gold" />
      </section>

      {/* Deposit History (replaces lock funds) */}
      <section className="mt-6 px-5">
        <SectionTitle title="Deposit History" />
        <div className="space-y-2.5">
          {deposits.length === 0 && (
            <Card className="!p-4 text-center text-xs text-muted-foreground">No deposits yet.</Card>
          )}
          {deposits.map((d) => (
            <Card key={d.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Deposit</p>
                  <p className="text-[11px] text-muted-foreground">
                    {new Date(d.created_at).toLocaleDateString()} · {d.phone}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-success">+{fmt(d.amount)}</p>
                  <Badge tone={d.status === 'completed' ? 'success' : 'warning'}>{d.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
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
          {savingsGoals.length === 0 && (
            <Card className="!p-4 text-center text-xs text-muted-foreground">No savings goals yet.</Card>
          )}
          {savingsGoals.map((g) => {
            const pct = Math.round((g.saved / g.target) * 100);
            return (
              <Card key={g.id || g.name} className="!p-4">
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
              <p className="text-[11px] text-muted-foreground">20% p.a. · Repay in 3–24 months</p>
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

      {modal && <ActionSheet action={modal} onClose={() => setModal(null)} onSuccess={refreshBanking} />}
    </AppShell>
  );
}

// ─── ActionSheet ──────────────────────────────────────────────────────────
function ActionSheet({ action, onClose, onSuccess }: { action: ActionKey; onClose: () => void; onSuccess: () => void }) {
  const { user } = useAuth();
  const config = {
    deposit:  { title: "Deposit funds",  cta: "Deposit",  hint: "Top up via M-Pesa, bank or card." },
    withdraw: { title: "Withdraw funds", cta: "Withdraw", hint: "Instant to M-Pesa or bank." },
    invest:   { title: "New investment", cta: "Invest",   hint: "Grow with our curated portfolios." },
    loan:     { title: "Apply for loan", cta: "Apply",    hint: "Get pre-approved in minutes." },
  }[action];

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  const [amount, setAmount] = useState<number>(action === "loan" ? 20000 : 5000);
  const [months, setMonths] = useState<number>(6);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleAction = async () => {
    if (!user) return toast.error('Please log in');
    if (amount < 100) return toast.error('Minimum amount is KES 100');
    setSubmitting(true);
    try {
      // Map action to table – adjust as needed
      const tableMap = {
        deposit: 'transactions',
        withdraw: 'transactions',
        invest: 'investments',
        loan: 'loan_applications',
      };

      const payload = action === 'loan'
        ? { user_id: user.id, amount, months, status: 'pending' }
        : { user_id: user.id, amount, type: action, status: 'pending' };

      const { error } = await supabase
        .from(tableMap[action])
        .insert([payload]);

      if (error) throw error;
      toast.success(`${config.cta} of ${fmt(amount)} submitted successfully`);
      setDone(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || `${config.cta} failed`);
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
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
        </div>
      </div>
    );
  }

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
              <div className="flex justify-between"><span className="text-muted-foreground">Interest rate</span><span className="font-bold">20% p.a.</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Monthly repayment</span><span className="font-bold">{fmt(Math.round((amount * (1 + 0.20 * (months / 12))) / months))}</span></div>
              <div className="mt-1 flex justify-between"><span className="text-muted-foreground">Total to repay</span><span className="font-bold text-primary">{fmt(Math.round(amount * (1 + 0.20 * (months / 12))))}</span></div>
            </div>
          </>
        )}

        {action === "invest" && (
          <div className="mt-3 rounded-lg bg-gold/10 p-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Est. annual return</span><span className="font-bold text-success">+ {fmt(Math.round(amount * 0.15))}</span></div>
          </div>
        )}

        <button
          onClick={handleAction}
          disabled={submitting || amount < 100}
          className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Processing...' : `${config.cta} ${fmt(amount)}`}
        </button>
      </div>
    </div>
  );
}
