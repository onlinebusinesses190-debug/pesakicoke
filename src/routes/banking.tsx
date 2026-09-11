import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  PiggyBank, Lock, Target, HandCoins, TrendingUp,
  ArrowDownToLine, ArrowUpFromLine, Plus, X, ArrowLeft,
  CheckCircle2, Info, Calendar, Clock,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Progress, Badge } from "@/components/ui-bits";
import { toast } from "sonner";
import { apiRequest } from "@/utils/api";

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

const fmt = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
};

function BankingPage() {
  const { user } = useAuth();
  const [modal, setModal] = useState<ActionKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({
    totalSavings: 0, interestEarned: 0, projectedAnnual: 0,
    lockedTotal: 0, availableBalance: 0, avgApy: 0,
  });
  const [ledger, setLedger] = useState<any[]>([]);
  const [lockedSavings, setLockedSavings] = useState<any[]>([]);
  const [investments, setInvestments] = useState<any[]>([]);
  const [goals, setGoals] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const hasFetched = useRef(false);

  const fetchBankingData = useCallback(async () => {
    if (!user || hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);
    try {
      const [summaryRes, ledgerRes, savingsRes, investRes, goalsRes, loansRes] = await Promise.all([
        apiRequest('/banking/summary'),
        apiRequest('/banking/ledger'),
        apiRequest('/banking/locked-savings'),
        apiRequest('/banking/investments'),
        apiRequest('/banking/goals'),
        apiRequest('/banking/loans'),
      ]);
      if (summaryRes?.success) setSummary(summaryRes.data);
      if (ledgerRes?.success) setLedger(ledgerRes.data || []);
      if (savingsRes?.success) setLockedSavings(savingsRes.data || []);
      if (investRes?.success) setInvestments(investRes.data || []);
      if (goalsRes?.success) setGoals(goalsRes.data || []);
      if (loansRes?.success) setLoans(loansRes.data || []);
    } catch (err) {
      console.error('Failed to load banking data:', err);
      toast.error('Could not load banking data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user && !hasFetched.current) fetchBankingData();
    if (!user) setLoading(false);
  }, [user?.id, fetchBankingData]);

  const refresh = () => {
    hasFetched.current = false;
    fetchBankingData();
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Banking Hub" subtitle="Your PESAKI bank" right={<Badge tone="success"><CheckCircle2 className="h-2.5 w-2.5" /> Insured</Badge>} />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading banking data...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader title="Banking Hub" subtitle="Your PESAKI bank" right={<Badge tone="success"><CheckCircle2 className="h-2.5 w-2.5" /> Insured</Badge>} />

      {/* Section 1 — Balance Card */}
      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <PiggyBank className="absolute -right-3 -top-3 h-28 w-28 opacity-15" />
          <p className="text-xs uppercase tracking-widest opacity-80">Total Savings</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(summary.totalSavings)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Interest Earned</p>
              <p className="mt-0.5 font-semibold">{fmt(summary.interestEarned)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Projected (1yr)</p>
              <p className="mt-0.5 font-semibold">{fmt(summary.projectedAnnual)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2 — Action Row */}
      <section className="-mt-3 px-5">
        <Card className="grid grid-cols-4 gap-2">
          {[
            { key: 'deposit' as ActionKey, label: 'Deposit', icon: ArrowDownToLine, tone: 'bg-success/15 text-success' },
            { key: 'withdraw' as ActionKey, label: 'Withdraw', icon: ArrowUpFromLine, tone: 'bg-primary/10 text-primary' },
            { key: 'invest' as ActionKey, label: 'Invest', icon: TrendingUp, tone: 'bg-gold/15 text-gold-foreground' },
            { key: 'loan' as ActionKey, label: 'Loan', icon: HandCoins, tone: 'bg-muted text-foreground' },
          ].map((a) => (
            <button key={a.key} onClick={() => setModal(a.key)} className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-muted">
              <span className={`grid h-11 w-11 place-items-center rounded-xl ${a.tone}`}><a.icon className="h-5 w-5" /></span>
              <span className="text-[11px] font-semibold">{a.label}</span>
            </button>
          ))}
        </Card>
      </section>

      {/* Section 3 — KPI Row */}
      <section className="mt-5 grid grid-cols-3 gap-3 px-5">
        <Stat label="Locked" value={fmt(summary.lockedTotal)} tone="primary" />
        <Stat label="Available" value={fmt(summary.availableBalance)} tone="success" />
        <Stat label="Avg. APY" value={`${summary.avgApy}%`} tone="gold" />
      </section>

      {/* Section 4 — Deposit History */}
      <section className="mt-6 px-5">
        <SectionTitle title="Deposit History" />
        <div className="space-y-2.5">
          {ledger.length === 0 && <Card className="!p-4 text-center text-xs text-muted-foreground">No transactions yet.</Card>}
          {ledger.slice(0, 5).map((entry) => (
            <Card key={entry.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">{entry.description || entry.type}</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(entry.created_at).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${entry.mode === 'credit' ? 'text-success' : 'text-destructive'}`}>
                    {entry.mode === 'credit' ? '+' : '-'}{fmt(entry.amount)}
                  </p>
                  <Badge tone={entry.status === 'completed' ? 'success' : 'warning'}>{entry.status}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Section 5 — Lock Funds & Earn */}
      <section className="mt-6 px-5">
        <SectionTitle title="Lock Funds & Earn" />
        <LockSavingsForm available={summary.availableBalance} onSuccess={refresh} />
      </section>

      {/* Section 6 — Active Locked Savings */}
      <section className="mt-6 px-5">
        <SectionTitle title="Active Locked Savings" />
        <div className="space-y-2.5">
          {lockedSavings.length === 0 && <Card className="!p-4 text-center text-xs text-muted-foreground">No active locked savings.</Card>}
          {lockedSavings.map((lock) => (
            <LockedSavingsCard key={lock.id} lock={lock} />
          ))}
        </div>
      </section>

      {/* Section 7 — My Investments */}
      <section className="mt-6 px-5">
        <SectionTitle title="My Investments" />
        <div className="space-y-2.5">
          {investments.length === 0 && <Card className="!p-4 text-center text-xs text-muted-foreground">No active investments.</Card>}
          {investments.map((inv) => (
            <InvestmentCard key={inv.id} investment={inv} />
          ))}
        </div>
      </section>

      {/* Section 8 — Financial Goals */}
      <section className="mt-6 px-5">
        <SectionTitle
          title="Financial Goals"
          action={
            <button onClick={() => setModal('deposit')} className="inline-flex items-center gap-1 rounded-full gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
              <Plus className="h-3 w-3" /> New goal
            </button>
          }
        />
        <div className="space-y-2.5">
          {goals.length === 0 && <Card className="!p-4 text-center text-xs text-muted-foreground">No savings goals yet.</Card>}
          {goals.map((g) => {
            const pct = Math.round((g.saved_amount / g.target_amount) * 100);
            return (
              <Card key={g.id} className="!p-4">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary"><Target className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{g.name}</p>
                    <p className="text-[11px] text-muted-foreground">{fmt(g.saved_amount)} of {fmt(g.target_amount)}</p>
                  </div>
                  <Badge tone="gold">{g.apy}%</Badge>
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

      {/* Section 9 — Instant Loans */}
      <section className="mt-6 px-5">
        <SectionTitle title="Instant Loans" />
        <Card className="!p-4 mb-4">
          <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-gold/15 text-gold-foreground"><HandCoins className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">You qualify for up to</p>
              <p className="text-lg font-bold text-primary">{fmt(150000)}</p>
              <p className="text-[11px] text-muted-foreground">20% p.a. · Repay in 3–24 months</p>
            </div>
            <button onClick={() => setModal('loan')} className="rounded-full gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">Get loan</button>
          </div>
        </Card>
        <div className="space-y-2.5">
          {loans.length === 0 && <Card className="!p-4 text-center text-xs text-muted-foreground">No loan applications yet.</Card>}
          {loans.map((loan) => (
            <Card key={loan.id} className="!p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">Loan Application</p>
                  <p className="text-[11px] text-muted-foreground">{new Date(loan.applied_at).toLocaleDateString()} · {loan.duration_months} months</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{fmt(loan.amount)}</p>
                  <Badge tone={
                    loan.status === 'pending' ? 'warning' :
                    loan.status === 'approved' || loan.status === 'disbursed' ? 'success' :
                    loan.status === 'denied' ? 'destructive' : 'neutral'
                  }>{loan.status.toUpperCase()}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <p className="my-8 px-5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Funds insured · Secured by PESAKI
      </p>

      {modal && <BankingSheet action={modal} onClose={() => setModal(null)} onSuccess={refresh} />}
    </AppShell>
  );
}

// ─── Lock Savings Form (inline) ──────────────────────────────────────────────
function LockSavingsForm({ available, onSuccess }: { available: number; onSuccess: () => void }) {
  const [amount, setAmount] = useState(50000);
  const [duration, setDuration] = useState(12);
  const [loading, setLoading] = useState(false);
  const durations = [1, 2, 3, 6, 12, 24];
  const interest = amount * (10 / 100) * (duration / 12);
  const totalAtMaturity = amount + interest;

  const handleLock = async () => {
    if (amount < 1000) return toast.error('Minimum lock amount is KES 1,000');
    if (amount > available) return toast.error('Insufficient available balance');
    setLoading(true);
    try {
      await apiRequest('/banking/lock-savings', {
        method: 'POST',
        body: JSON.stringify({ amount, durationMonths: duration }),
      });
      toast.success(`Locked KES ${amount} for ${duration} months`);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to lock savings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="!p-4">
      <div className="space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount to Lock</label>
          <div className="mt-1 flex items-center gap-2">
            <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="flex-1 rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" />
            <span className="text-sm font-semibold text-muted-foreground">KES</span>
          </div>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[10000, 25000, 50000, 100000].map((preset) => (
              <button key={preset} onClick={() => setAmount(preset)} className={`rounded-lg border py-1.5 text-xs font-semibold ${amount === preset ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                {preset >= 1000 ? `${preset / 1000}k` : preset}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</label>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {durations.map((d) => (
              <button key={d} onClick={() => setDuration(d)} className={`rounded-lg border py-2 text-xs font-semibold ${duration === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                {d}mo
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">APY</span><span className="font-bold text-success">10%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Interest</span><span className="font-bold">+{fmt(interest)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">At maturity</span><span className="font-bold text-primary">{fmt(totalAtMaturity)}</span></div>
        </div>
        <p className="text-[11px] text-muted-foreground">Funds are locked for the full duration. No early withdrawal.</p>
        <button onClick={handleLock} disabled={loading || amount < 1000 || amount > available} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
          {loading ? 'Processing...' : '🔒 Lock Now'}
        </button>
      </div>
    </Card>
  );
}

// ─── Locked Savings Card with countdown ─────────────────────────────────────
function LockedSavingsCard({ lock }: { lock: any }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const end = new Date(lock.end_date);
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) { setTimeLeft('Matured'); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${days}d ${hours}h ${mins}m left`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [lock.end_date]);
  const interest = Number(lock.interest_earned) || 0;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><Lock className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold">{lock.duration_months}-Month Lock</p>
            <p className="text-[11px] text-muted-foreground">{fmt(lock.amount)} · earns {fmt(interest)}</p>
          </div>
        </div>
        <Badge tone="gold">10% APY</Badge>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1"><Progress value={100} /></div>
        <span className="text-xs font-bold text-primary">100%</span>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {timeLeft}</p>
    </Card>
  );
}

// ─── Investment Card with countdown ─────────────────────────────────────────
function InvestmentCard({ investment }: { investment: any }) {
  const [timeLeft, setTimeLeft] = useState('');
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const end = new Date(investment.end_date);
      const diff = end.getTime() - now.getTime();
      if (diff <= 0) { setTimeLeft('Matured'); return; }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setTimeLeft(`${days}d ${hours}h ${mins}m left`);
    };
    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, [investment.end_date]);
  const interest = Number(investment.interest_earned) || 0;
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gold/15 text-gold-foreground"><TrendingUp className="h-5 w-5" /></span>
          <div>
            <p className="text-sm font-semibold">{investment.duration_months}-Month Investment</p>
            <p className="text-[11px] text-muted-foreground">{fmt(investment.amount)} · earns {fmt(interest)}</p>
          </div>
        </div>
        <Badge tone="gold">12% APY</Badge>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <div className="flex-1"><Progress value={100} /></div>
        <span className="text-xs font-bold text-primary">100%</span>
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Clock className="h-3 w-3" /> {timeLeft}</p>
    </Card>
  );
}

// ─── Banking Sheet (modals) ──────────────────────────────────────────────────
function BankingSheet({ action, onClose, onSuccess }: { action: ActionKey; onClose: () => void; onSuccess: () => void }) {
  if (action === 'deposit') return <DepositSheet onClose={onClose} onSuccess={onSuccess} />;
  if (action === 'withdraw') return <WithdrawSheet onClose={onClose} onSuccess={onSuccess} />;
  if (action === 'invest') return <InvestSheet onClose={onClose} onSuccess={onSuccess} />;
  if (action === 'loan') return <LoanSheet onClose={onClose} onSuccess={onSuccess} />;
  return null;
}

function DepositSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'processing' | 'waiting' | 'success' | 'failed'>('form');
  const [checkoutRequestId, setCheckoutRequestId] = useState('');
  const pollRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = () => { if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; } };

  const pollStatus = async (crId: string) => {
    if (attemptsRef.current >= 20) { stopPolling(); setStep('failed'); return; }
    attemptsRef.current += 1;
    try {
      const data = await apiRequest(`/banking/deposit/status/${crId}`);
      const status = String(data?.data?.status || '').toLowerCase();
      if (status === 'completed') { stopPolling(); setStep('success'); onSuccess(); toast.success('Deposit successful!'); setTimeout(onClose, 3000); }
      else if (status === 'failed') { stopPolling(); setStep('failed'); toast.error('Deposit failed'); setTimeout(onClose, 4000); }
      else { pollRef.current = window.setTimeout(() => pollStatus(crId), 3000); }
    } catch { pollRef.current = window.setTimeout(() => pollStatus(crId), 3000); }
  };

  useEffect(() => () => stopPolling(), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !phone) return;
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
    if (cleanPhone.length !== 12) return toast.error('Enter a valid phone number');
    setLoading(true);
    setStep('processing');
    try {
      const res = await apiRequest('/banking/deposit', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), phone: cleanPhone }),
      });
      if (res?.success && res?.data?.checkoutRequestId) {
        setCheckoutRequestId(res.data.checkoutRequestId);
        setStep('waiting');
        attemptsRef.current = 0;
        pollStatus(res.data.checkoutRequestId);
      } else {
        throw new Error(res?.error || 'Failed to initiate deposit');
      }
    } catch (err: any) {
      toast.error(err.message || 'Deposit failed');
      setStep('form');
    } finally { setLoading(false); }
  };

  if (step === 'success') return <SuccessSheet title="Deposit Successful" message={`KES ${amount} deposited to Banking Hub.`} onClose={onClose} />;
  if (step === 'failed') return <SuccessSheet title="Deposit Failed" message="Taking longer than expected. Refresh in a minute to see your updated balance." onClose={onClose} />;
  if (step === 'processing') return <ProcessingSheet message="Processing your request..." sub="You will receive an M-Pesa prompt shortly." />;
  if (step === 'waiting') return <ProcessingSheet message="M-Pesa prompt sent" sub={`Check your phone (${phone}) and enter your PIN.`} />;

  return (
    <SheetShell title="Deposit to Banking Hub" onClose={onClose}>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
          <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. 5000" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">M-Pesa Phone</label>
          <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="0712345678" />
        </div>
        <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Processing...' : 'Send STK Push'}</button>
      </form>
    </SheetShell>
  );
}

function WithdrawSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [tab, setTab] = useState<'wallet' | 'mpesa'>('wallet');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleWalletWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return;
    setLoading(true);
    try {
      await apiRequest('/banking/withdraw-to-wallet', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount) }),
      });
      toast.success('Withdrawn to wallet successfully');
      onSuccess();
      setTimeout(onClose, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Withdrawal failed');
    } finally { setLoading(false); }
  };

  const handleMpesaWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !phone) return;
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
    if (cleanPhone.length !== 12) return toast.error('Enter a valid phone number');
    setLoading(true);
    try {
      const res = await apiRequest('/banking/withdraw-to-mpesa', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), phone: cleanPhone }),
      });
      if (res?.success) {
        toast.success('Withdrawal successful');
        onSuccess();
        setTimeout(onClose, 3000);
      } else {
        throw new Error(res?.error || 'Withdrawal failed');
      }
    } catch (err: any) {
      toast.error(err.message || 'Withdrawal failed');
    } finally { setLoading(false); }
  };

  return (
    <SheetShell title="Withdraw from Banking Hub" onClose={onClose}>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => setTab('wallet')} className={`rounded-xl border py-2 text-xs font-semibold ${tab === 'wallet' ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>To Wallet</button>
        <button onClick={() => setTab('mpesa')} className={`rounded-xl border py-2 text-xs font-semibold ${tab === 'mpesa' ? 'border-primary bg-primary text-primary-foreground' : 'border-border'}`}>To M-Pesa</button>
      </div>
      {tab === 'wallet' ? (
        <form onSubmit={handleWalletWithdraw} className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
            <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. 10000" />
          </div>
          <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Processing...' : 'Withdraw to Wallet'}</button>
        </form>
      ) : (
        <form onSubmit={handleMpesaWithdraw} className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
            <input type="number" required value={amount} onChange={(e) => setAmount(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. 10000" />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">M-Pesa Phone</label>
            <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="0712345678" />
          </div>
          <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Processing...' : 'Withdraw to M-Pesa'}</button>
        </form>
      )}
    </SheetShell>
  );
}

function InvestSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState(50000);
  const [duration, setDuration] = useState(12);
  const [loading, setLoading] = useState(false);
  const interest = amount * (12 / 100) * (duration / 12);
  const totalAtMaturity = amount + interest;

  const handleInvest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest('/banking/invest', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), durationMonths: duration }),
      });
      toast.success(`Invested KES ${amount} for ${duration} months`);
      onSuccess();
      setTimeout(onClose, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Investment failed');
    } finally { setLoading(false); }
  };

  return (
    <SheetShell title="New Investment" onClose={onClose}>
      <form onSubmit={handleInvest} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
          <input type="number" required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. 50000" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {[12, 24].map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-lg border py-2 text-xs font-semibold ${duration === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                {d} months
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-lg bg-gold/10 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">APY</span><span className="font-bold text-success">12%</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Est. return</span><span className="font-bold">+{fmt(interest)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">At maturity</span><span className="font-bold text-primary">{fmt(totalAtMaturity)}</span></div>
        </div>
        <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Processing...' : 'Invest Now'}</button>
      </form>
    </SheetShell>
  );
}

function LoanSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [amount, setAmount] = useState(20000);
  const [duration, setDuration] = useState(12);
  const [purpose, setPurpose] = useState('');
  const [loading, setLoading] = useState(false);
  const totalRepay = amount * (1 + 0.20 * (duration / 12));
  const monthlyRepay = totalRepay / duration;

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest('/banking/loans', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), durationMonths: duration, purpose }),
      });
      toast.success('Loan application submitted');
      onSuccess();
      setTimeout(onClose, 2000);
    } catch (err: any) {
      toast.error(err.message || 'Loan application failed');
    } finally { setLoading(false); }
  };

  return (
    <SheetShell title="Apply for Loan" onClose={onClose}>
      <form onSubmit={handleApply} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
          <input type="number" required value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. 50000" />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</label>
          <div className="mt-1 grid grid-cols-4 gap-2">
            {[3, 6, 12, 24].map((d) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`rounded-lg border py-2 text-xs font-semibold ${duration === d ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
                {d}m
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Purpose</label>
          <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="e.g. Business expansion" />
        </div>
        <div className="rounded-lg bg-muted/60 p-3 text-xs space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Interest rate</span><span className="font-bold">20% p.a.</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Monthly repayment</span><span className="font-bold">{fmt(Math.round(monthlyRepay))}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total to repay</span><span className="font-bold text-primary">{fmt(Math.round(totalRepay))}</span></div>
        </div>
        <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">{loading ? 'Processing...' : 'Apply Now'}</button>
      </form>
    </SheetShell>
  );
}

// ─── Shared UI helpers ───────────────────────────────────────────────────────
function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl pb-20">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"><ArrowLeft className="h-4 w-4" /></button>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function ProcessingSheet({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning"><Clock className="h-7 w-7 animate-spin" /></div>
        <p className="mt-4 text-lg font-bold">{message}</p>
        <p className="mt-2 text-xs text-muted-foreground">{sub}</p>
      </div>
    </div>
  );
}

function SuccessSheet({ title, message, onClose }: { title: string; message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success"><CheckCircle2 className="h-6 w-6" /></div>
        <p className="mt-3 text-base font-bold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{message}</p>
        <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Done</button>
      </div>
    </div>
  );
}
