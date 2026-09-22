import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle, Badge } from "@/components/ui-bits";
import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
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
  Loader2,
  RefreshCw,
} from "lucide-react";
import { fmt } from "@/lib/mock";
import { apiRequest } from "@/utils/api";
import { supabase } from "@/integrations/supabase/client";
import {
  calculateTransferFee,
  calculateWithdrawalFee,
  MIN_TRANSFER,
  MIN_WITHDRAWAL,
} from "@/utils/fees";
import { DepositSheet } from "@/components/DepositSheet";
import { WithdrawSheet } from "@/components/WithdrawSheet";
import { TransferSheet } from "@/components/TransferSheet";
import { SheetShell } from "@/components/SheetShell";

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
  const { requireAuth } = useRequireAuth();
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
  const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal" | "trading" | "transfer">(
    "all",
  );
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
    if (tx.mode === "demo") return false;
    if (tx.mode === "demo" || /demo/i.test(tx.description || "")) return false;
    switch (filter) {
      case "all":
        return true;
      case "deposit":
        return tx.type === "deposit";
      case "withdrawal":
        return tx.type === "withdrawal";
      case "trading":
        return (
          tx.type === "game_win" ||
          tx.type === "game_loss" ||
          tx.type === "market" ||
          tx.type === "bet" ||
          tx.type === "win"
        );
      case "transfer":
        return tx.type === "transfer";
      default:
        return true;
    }
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
              onClick={refreshWallet}
              className="rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </span>
            </button>
            <button
              onClick={() => setShowTransfer(true)}
              className="rounded-full border border-border bg-background px-3 py-2 text-[11px] font-semibold text-foreground"
            >
              <span className="inline-flex items-center gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Transfer
              </span>
            </button>
            <button
              onClick={() => {
                if (!requireAuth()) return;
                setShowDeposit(true);
              }}
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
          <p className="mt-1 font-display text-3xl font-bold">{fmt(wallet?.balance || 0)}</p>
          <p className="mt-0.5 text-xs opacity-80">Locked: {fmt(wallet?.locked || 0)}</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowDeposit(true)}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <ArrowDownToLine className="h-3.5 w-3.5" /> Deposit
            </button>
            <button
              onClick={() => {
                if (!requireAuth()) return;
                setShowWithdraw(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <ArrowUpFromLine className="h-3.5 w-3.5" /> Withdraw
            </button>
            <button
              onClick={() => {
                if (!requireAuth()) return;
                setShowTransfer(true);
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-white/20 py-2 text-xs font-semibold hover:bg-white/30"
            >
              <Send className="h-3.5 w-3.5" /> Transfer
            </button>
          </div>
        </div>
      </section>

      <section className="mt-4 grid grid-cols-4 gap-2 px-5">
        <StatCard label="Total Deposits" value={fmt(stats.totalDeposits)} tone="success" />
        <StatCard
          label="Total Withdrawals"
          value={fmt(stats.totalWithdrawals)}
          tone="destructive"
        />
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
            { key: "transfer", label: "Transfer" },
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
function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
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
