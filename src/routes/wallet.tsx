import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, X } from "lucide-react";
import { fmt } from "@/lib/mock";

export const Route = createFileRoute("/wallet")({
  component: WalletPage,
});

interface Wallet {
  balance: number;
  demo_balance: number;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  mode: string;
  description: string;
  created_at: string;
}

function WalletPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  // ─── Fetch wallet data ──────────────────────────────────────────────
  const fetchWallet = async () => {
    // ✅ Fix: if no user, stop loading and return
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // 1. Get wallet balance
      const { data: walletData, error: walletErr } = await supabase
        .from('wallets')
        .select('balance, demo_balance')
        .eq('user_id', user.id)
        .single();

      if (walletErr) throw walletErr;
      setWallet(walletData);

      // 2. Get transaction history
      const { data: txData, error: txErr } = await supabase
        .from('wallet_ledger')
        .select('id, type, amount, mode, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txErr) throw txErr;
      setTransactions(txData || []);

    } catch (err) {
      console.error('Error fetching wallet:', err);
      toast.error('Could not load wallet data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallet();
  }, [user]);

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Wallet" subtitle="Your funds" />
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
          <button
            onClick={() => setShowDeposit(true)}
            className="rounded-full gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
          >
            Deposit
          </button>
        }
      />

      <section className="px-5 pt-5">
        <div className="gradient-primary rounded-2xl p-5 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-80">Available Balance</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(wallet?.balance || 0)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Demo Balance</p>
              <p className="mt-0.5 font-semibold">{fmt(wallet?.demo_balance || 0)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Locked</p>
              <p className="mt-0.5 font-semibold">KES 0</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="Recent transactions" />
        {transactions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
            No transactions yet.
          </div>
        ) : (
          <div className="space-y-2.5">
            {transactions.map((tx) => (
              <Card key={tx.id} className="!p-3.5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{tx.description || tx.type}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {new Date(tx.created_at).toLocaleDateString()} · {new Date(tx.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className={`font-semibold ${
                    tx.mode === 'credit' ? 'text-success' : 'text-destructive'
                  }`}>
                    {tx.mode === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {showDeposit && (
        <DepositSheet
          onClose={() => setShowDeposit(false)}
          user={user}
          supabase={supabase}
          onSuccess={fetchWallet}
        />
      )}
    </AppShell>
  );
}

// ─── Deposit Sheet ──────────────────────────────────────────────────────
function DepositSheet({ onClose, user, supabase, onSuccess }: any) {
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'form' | 'processing' | 'success'>('form');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || !phone) return;
    if (!user) return;

    // Ensure phone format: 2547XXXXXXXX
    let cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
    if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;

    if (cleanPhone.length !== 12) {
      toast.error('Enter a valid Safaricom phone number');
      return;
    }

    setLoading(true);
    setStep('processing');

    try {
      // Call Supabase Edge Function
      const { data, error } = await supabase.functions.invoke('mpesa-stk', {
        body: {
          amount: parseInt(amount),
          phone: cleanPhone,
          userId: user.id,
        },
      });

      if (error) throw error;

      if (data?.checkout_request_id) {
        toast.success('STK Push sent. Check your phone for the prompt.');
        setStep('success');
        onSuccess();
        setTimeout(() => onClose(), 5000);
      } else {
        throw new Error(data?.message || 'Failed to initiate payment');
      }
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to initiate deposit');
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
            <TrendingUp className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-bold">STK Push Sent</p>
          <p className="text-xs text-muted-foreground">Check your phone for the M-Pesa prompt. Enter your PIN to confirm.</p>
          <button onClick={onClose} className="mt-4 w-full rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      {/* ✅ Added max-h and overflow-y-auto for scrolling */}
      <div className="relative z-10 w-full max-w-md max-h-[90vh] overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">Deposit via M-Pesa</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount (KES)</label>
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
            <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">M-Pesa Phone Number</label>
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
              placeholder="0712345678"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">Enter the phone number registered with M-Pesa.</p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? 'Processing...' : 'Send STK Push'}
          </button>
        </form>
      </div>
    </div>
  );
}
