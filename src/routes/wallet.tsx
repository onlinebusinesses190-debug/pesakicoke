import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle } from "@/components/ui-bits";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  ArrowLeft,
  TrendingUp,
  X,
  ArrowDownToLine,
  ArrowUpFromLine,
  Send,
  Filter,
  ArrowLeftRight,
} from "lucide-react";
import { fmt } from "@/lib/mock";
import { apiRequest } from "@/utils/api";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/wallet")({
  component: WalletPage,
});

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

interface Wallet {
  balance: number;
  locked: number;
  demo_balance: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  mode: string;
  description: string;
  created_at: string;
  status?: string;
}

interface WalletStats {
  totalDeposits: number;
  totalWithdrawals: number;
  pending: number;
  referralEarnings: number;
}

function WalletPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<WalletStats>({
    totalDeposits: 0,
    totalWithdrawals: 0,
    pending: 0,
    referralEarnings: 0,
  });
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "trading">("all");
  const hasFetched = useRef(false);

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  };

  const fetchWallet = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);

    try {
      const token = await getAuthToken();

      const balanceRes = await fetch(`${API_BASE}/wallet/balance`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!balanceRes.ok) throw new Error("Failed to fetch balance");
      const balanceData = await balanceRes.json();
      setWallet({
        balance: balanceData.balance || 0,
        locked: balanceData.locked || 0,
        demo_balance: balanceData.demo_balance || 8600,
      });

      const txRes = await fetch(`${API_BASE}/wallet/transactions?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!txRes.ok) throw new Error("Failed to fetch transactions");
      const txData = await txRes.json();
      const txWithStatus = txData.map((tx: any) => ({
        ...tx,
        status: tx.status || "completed",
      }));
      setTransactions(txWithStatus);

      const statsRes = await fetch(`${API_BASE}/wallet/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats({
          totalDeposits: statsData.totalDeposits || 0,
          totalWithdrawals: statsData.totalWithdrawals || 0,
          pending: statsData.pending || 0,
          referralEarnings: statsData.referralEarnings || 0,
        });
      }
    } catch (err) {
      console.error("Error fetching wallet:", err);
      toast.error("Could not load wallet data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !hasFetched.current) fetchWallet();
    if (!user) setLoading(false);
  }, [user?.id]);

  const refreshWallet = () => {
    hasFetched.current = false;
    fetchWallet();
  };

  const filteredTransactions = transactions.filter((tx) => {
    if (filter === "all") return true;
    if (filter === "deposit") return tx.type === "deposit";
    if (filter === "withdrawal") return tx.type === "withdrawal";
    if (filter === "trading")
      return tx.type === "game_win" || tx.type === "game_loss" || tx.type === "market";
    return true;
  });

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Wallet" subtitle="Your PESAKI money center" />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Wallet"
        subtitle="Manage your funds"
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTransfer(true)}
              className="rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground"
            >
              <span className="inline-flex items-center gap-1.5"><ArrowLeftRight className="h-3.5 w-3.5" />Transfer</span>
            </button>
            <button
              onClick={() => setShowDeposit(true)}
              className="rounded-full gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              Deposit
            </button>
          </div>
        }
      />

      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-80">Available Balance</p>
          <p className="mt-1 font-display text-3xl font-bold">
            {fmt(wallet?.balance || 0)}
          </p>
          <p className="mt-0.5 text-xs opacity-80">Locked: {fmt(wallet?.locked || 0)}</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowDeposit(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" /> Deposit
            </button>
            <button
              onClick={() => setShowWithdraw(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Withdraw
            </button>
            <button
              onClick={() => setShowTransfer(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <Send className="h-3.5 w-3.5" /> Transfer
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-4 gap-2 px-5">
        <StatCard label="Total Deposits" value={fmt(stats.totalDeposits)} tone="success" />
        <StatCard label="Total Withdrawals" value={fmt(stats.totalWithdrawals)} tone="destructive" />
        <StatCard label="Pending" value={stats.pending.toString()} tone="warning" />
        <StatCard label="Referral Earnings" value={fmt(stats.referralEarnings)} tone="gold" />
      </section>

      <section className="mt-6 px-5">
        <div className="flex items-center justify-between">
          <SectionTitle title="Transaction history" />
          <button className="text-xs text-muted-foreground hover:text-foreground">
            <Filter className="inline h-3.5 w-3.5" /> Filter
          </button>
        </div>

        <div className="mt-2 flex gap-1 rounded-full bg-muted p-1">
          {[
            { key: "all", label: "All" },
            { key: "deposit", label: "Deposit" },
            { key: "withdrawal", label: "Withdrawal" },
            { key: "trading", label: "Trading" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key as typeof filter)}
              className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold transition-all ${
                filter === tab.key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-3 space-y-2.5">
          {filteredTransactions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No transactions found.
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <Card key={tx.id} className="!p-3.5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{tx.description || tx.type}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString()} ·{" "}
                      {new Date(tx.created_at).toLocaleTimeString()}
                    </p>
                    {tx.status && (
                      <Badge
                        tone={tx.status === "completed" ? "success" : "warning"}
                        className="mt-1"
                      >
                        {tx.status}
                      </Badge>
                    )}
                  </div>
                  <div
                    className={`font-semibold ${
                      tx.mode === "credit" ? "text-success" : "text-destructive"
                    }`}
                  >
                    {tx.mode === "credit" ? "+" : "-"}
                    {fmt(tx.amount)}
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      {showDeposit && (
        <DepositSheet onClose={() => setShowDeposit(false)} user={user} onSuccess={refreshWallet} />
      )}
      {showWithdraw && (
        <WithdrawSheet
          onClose={() => setShowWithdraw(false)}
          user={user}
          balance={wallet?.balance || 0}
          onSuccess={refreshWallet}
        />
      )}
      {showTransfer && (
        <TransferSheet
          onClose={() => setShowTransfer(false)}
          user={user}
          balance={wallet?.balance || 0}
          onSuccess={refreshWallet}
        />
      )}
    </AppShell>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  const colorClasses = {
    success: "bg-success/10 text-success",
    destructive: "bg-destructive/10 text-destructive",
    warning: "bg-warning/10 text-warning",
    gold: "bg-gold/10 text-gold-foreground",
  };
  const color =
    tone && tone in colorClasses
      ? colorClasses[tone as keyof typeof colorClasses]
      : "bg-muted text-foreground";

  return (
    <div className={`rounded-xl ${color} p-2.5 text-center`}>
      <p className="text-[10px] font-medium uppercase tracking-wider opacity-70">{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
    </div>
  );
}

// ─── Deposit Sheet ──────────────────────────────────────────────────────
function DepositSheet({ onClose, user, onSuccess }: any) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "processing" | "success">("form");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !phone) return;
    if (!user) return;

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.slice(1);
    if (!cleanPhone.startsWith("254")) cleanPhone = "254" + cleanPhone;

    if (cleanPhone.length !== 12) {
      toast.error("Enter a valid Safaricom phone number");
      return;
    }

    setLoading(true);
    setStep("processing");

    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${API_BASE}/api/p/deposit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: parseInt(amount),
          phone: cleanPhone,
          userId: user.id,
        }),
      });

      const data = await response.json();

      if (response.ok && data?.checkout_request_id) {
        toast.success("STK Push sent. Check your phone for the prompt.");
        setStep("success");
        onSuccess();
        setTimeout(() => onClose(), 5000);
      } else {
        throw new Error(data?.message || "Failed to initiate payment");
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to initiate deposit");
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  if (step === "success") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
            <TrendingUp className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-bold">STK Push Sent</p>
          <p className="text-xs text-muted-foreground">
            Check your phone for the M-Pesa prompt. Enter your PIN to confirm.
          </p>
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl pb-20">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">Deposit via M-Pesa</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Amount (KES)
            </label>
            <input
              type="number"
              min="1"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. 500"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              M-Pesa Phone Number
            </label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="0712345678"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Enter the phone number registered with M-Pesa.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Processing..." : "Send STK Push"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Withdraw Sheet ─────────────────────────────────────────────────────
function WithdrawSheet({ onClose, user, balance, onSuccess }: any) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !phone) return;
    const numAmount = parseInt(amount);
    if (numAmount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.slice(1);
    if (!cleanPhone.startsWith("254")) cleanPhone = "254" + cleanPhone;

    if (cleanPhone.length !== 12) {
      toast.error("Enter a valid phone number");
      return;
    }

    setLoading(true);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${API_BASE}/wallet/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: numAmount, phone: cleanPhone }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Withdrawal failed");
      toast.success("Withdrawal request submitted");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetShell title="Withdraw Funds" onClose={onClose}>
      <p className="text-xs text-muted-foreground">Withdraw to your M-Pesa account.</p>
      <p className="mt-1 text-sm font-semibold">Available: {fmt(balance)}</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount (KES)
          </label>
          <input
            type="number"
            min="1"
            max={balance}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. 500"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            M-Pesa Phone Number
          </label>
          <input
            type="tel"
            required
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="0712345678"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : "Withdraw"}
        </button>
      </form>
    </SheetShell>
  );
}

// ─── Transfer Sheet ──────────────────────────────────────────────────────
function TransferSheet({ onClose, user, balance, onSuccess }: any) {
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !recipient) return;
    const numAmount = parseInt(amount);
    if (numAmount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/wallet/transfer', {
        method: 'POST',
        body: JSON.stringify({ amount: numAmount, recipient }),
      });
      toast.success("Transfer completed");
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Transfer failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SheetShell title="Transfer Funds" onClose={onClose}>
      <p className="text-xs text-muted-foreground">Transfer to another PESAKI user.</p>
      <p className="mt-1 text-sm font-semibold">Available: {fmt(balance)}</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recipient Email or Phone
          </label>
          <input
            type="text"
            required
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="email@example.com or 0712345678"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount (KES)
          </label>
          <input
            type="number"
            min="1"
            max={balance}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. 500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : "Transfer"}
        </button>
      </form>
    </SheetShell>
  );
}

// ─── Sheet Shell ──────────────────────────────────────────────────────────
function SheetShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[95vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl pb-20">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
