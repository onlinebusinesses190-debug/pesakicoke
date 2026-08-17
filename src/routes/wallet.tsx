import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  History,
  Eye,
  EyeOff,
  TrendingUp,
  X,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { apiRequest } from "@/utils/api";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const fmt = (amount: number) => {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(Number(amount) || 0);
};

const normalizeAmount = (value: unknown): number => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — PESAKI" },
      {
        name: "description",
        content:
          "Deposit, withdraw, transfer and track all your PESAKI transactions in one secure wallet.",
      },
    ],
  }),
  component: WalletPage,
});

type Action = "deposit" | "withdraw" | "transfer";

type Transaction = {
  id: string;
  type: string;
  amount: number;
  date?: string;
  created_at?: string;
  status: string;
  description?: string;
};

type DepositResponse = {
  success?: boolean;
  message?: string;
  error?: string;
  CheckoutRequestID?: string;
  checkoutRequestId?: string;
  CustomerMessage?: string;
  customerMessage?: string;
  ResponseDescription?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Wallet Page
// ─────────────────────────────────────────────────────────────────────────────

function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [locked, setLocked] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [referralEarnings, setReferralEarnings] = useState(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const [show, setShow] = useState(true);
  const [filter, setFilter] = useState("All");
  const [action, setAction] = useState<Action | null>(null);

  const [depositPending, setDepositPending] = useState(false);
  const [depositRequestId, setDepositRequestId] = useState<string | null>(
    null
  );

  const types = [
    "All",
    "Deposit",
    "Withdrawal",
    "Trading",
    "Job Earnings",
    "Business Funding",
    "Savings",
    "Transfer",
  ];

  const filtered =
    filter === "All"
      ? transactions
      : transactions.filter((t) =>
          String(t.type || "")
            .toLowerCase()
            .includes(filter.toLowerCase())
        );

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch wallet data
  // ─────────────────────────────────────────────────────────────────────────

  const fetchWalletData = async () => {
    try {
      setLoading(true);

      const balanceData = await apiRequest("/wallet/balance");

      setBalance(normalizeAmount(balanceData?.balance));
      setLocked(normalizeAmount(balanceData?.locked));
      setTotalEarnings(normalizeAmount(balanceData?.totalEarnings));
      setReferralEarnings(normalizeAmount(balanceData?.referralEarnings));

      const txData = await apiRequest("/wallet/transactions");

      const txs = Array.isArray(txData)
        ? txData
        : Array.isArray(txData?.transactions)
          ? txData.transactions
          : [];

      setTransactions(
        txs.map((t: any) => ({
          id: String(t.id ?? crypto.randomUUID()),
          type: String(t.type ?? "Transaction"),
          amount: normalizeAmount(t.amount),
          date:
            t.date ??
            t.created_at ??
            t.createdAt ??
            new Date().toISOString(),
          created_at: t.created_at ?? t.createdAt,
          status: String(t.status ?? "Completed"),
          description: t.description,
        }))
      );
    } catch (err) {
      console.error("Failed to fetch wallet data:", err);
      toast.error("Could not load wallet data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWalletData();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Poll wallet after STK Push
  //
  // Safaricom sends the final result to the BACKEND callback.
  // The frontend does not receive the Daraja callback directly.
  // We periodically refresh the wallet while the STK transaction is pending.
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!depositPending || !depositRequestId) return;

    let cancelled = false;
    let attempts = 0;

    const poll = async () => {
      if (cancelled) return;

      attempts++;

      try {
        const txData = await apiRequest("/wallet/transactions");

        const txs = Array.isArray(txData)
          ? txData
          : Array.isArray(txData?.transactions)
            ? txData.transactions
            : [];

        setTransactions(
          txs.map((t: any) => ({
            id: String(t.id ?? crypto.randomUUID()),
            type: String(t.type ?? "Transaction"),
            amount: normalizeAmount(t.amount),
            date:
              t.date ??
              t.created_at ??
              t.createdAt ??
              new Date().toISOString(),
            created_at: t.created_at ?? t.createdAt,
            status: String(t.status ?? "Completed"),
            description: t.description,
          }))
        );

        const matchingDeposit = txs.find((t: any) => {
          const status = String(t.status ?? "").toLowerCase();

          const checkoutId =
            t.checkout_request_id ??
            t.checkoutRequestId ??
            t.CheckoutRequestID;

          const isSameRequest =
            !checkoutId || String(checkoutId) === String(depositRequestId);

          const isDeposit =
            String(t.type ?? "")
              .toLowerCase()
              .includes("deposit");

          return isDeposit && isSameRequest;
        });

        if (matchingDeposit) {
          const status = String(
            matchingDeposit.status ?? ""
          ).toLowerCase();

          if (
            status.includes("completed") ||
            status.includes("complete") ||
            status.includes("success") ||
            status.includes("successful")
          ) {
            setDepositPending(false);
            setDepositRequestId(null);

            await fetchWalletData();

            toast.success(
              "M-Pesa payment received. Your PESAKI wallet has been credited."
            );

            return;
          }

          if (
            status.includes("failed") ||
            status.includes("cancelled") ||
            status.includes("canceled")
          ) {
            setDepositPending(false);
            setDepositRequestId(null);

            toast.error("The M-Pesa payment was cancelled or failed.");

            await fetchWalletData();

            return;
          }
        }
      } catch (err) {
        console.error("Deposit status polling error:", err);
      }

      // Stop polling after approximately 2 minutes.
      if (attempts < 24 && !cancelled) {
        setTimeout(poll, 5000);
      } else if (!cancelled) {
        setDepositPending(false);
        setDepositRequestId(null);

        toast.info(
          "We are still waiting for M-Pesa confirmation. Your wallet will update once the payment is confirmed."
        );

        await fetchWalletData();
      }
    };

    poll();

    return () => {
      cancelled = true;
    };
  }, [depositPending, depositRequestId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Derived statistics
  // ─────────────────────────────────────────────────────────────────────────

  const totalDeposits = transactions
    .filter((t) => t.type.toLowerCase().startsWith("deposit"))
    .reduce((sum, t) => sum + Math.abs(normalizeAmount(t.amount)), 0);

  const totalWithdrawals = transactions
    .filter(
      (t) =>
        t.type.toLowerCase().startsWith("withdrawal") &&
        !t.type.toLowerCase().includes("fee")
    )
    .reduce((sum, t) => sum + Math.abs(normalizeAmount(t.amount)), 0);

  const pending = transactions.filter(
    (t) => t.status.toLowerCase() === "pending"
  ).length;

  const available = Math.max(0, balance - locked);

  // ─────────────────────────────────────────────────────────────────────────
  // Loading
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Wallet" subtitle="Your PESAKI money center" />

        <div className="flex h-64 items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p>Loading wallet...</p>
          </div>
        </div>
      </AppShell>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <AppShell>
      <PageHeader title="Wallet" subtitle="Your PESAKI money center" />

      {/* Balance */}
      <section className="px-5 pt-5">
        <div className="relative overflow-hidden rounded-2xl gradient-primary p-5 text-primary-foreground">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gold/20 blur-2xl" />

          <div className="relative flex items-start justify-between">
            <p className="text-xs uppercase tracking-widest opacity-80">
              Available Balance
            </p>

            <button
              onClick={() => setShow(!show)}
              className="opacity-80"
              aria-label={show ? "Hide balance" : "Show balance"}
            >
              {show ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>
          </div>

          <p className="relative mt-1 font-display text-4xl font-bold tracking-tight">
            {show ? fmt(available) : "•••••••"}
          </p>

          <p className="relative mt-1 text-[11px] opacity-80">
            Locked: {show ? fmt(locked) : "•••"}
          </p>

          <div className="relative mt-5 grid grid-cols-3 gap-2">
            {[
              {
                l: "Deposit",
                i: ArrowDownToLine,
                a: "deposit" as const,
              },
              {
                l: "Withdraw",
                i: ArrowUpFromLine,
                a: "withdraw" as const,
              },
              {
                l: "Transfer",
                i: ArrowLeftRight,
                a: "transfer" as const,
              },
            ].map((item) => (
              <button
                key={item.l}
                onClick={() => setAction(item.a)}
                className="flex flex-col items-center gap-1 rounded-xl bg-white/15 py-2.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
              >
                <item.i className="h-4 w-4" />
                {item.l}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Statistics */}
      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <Stat
          label="Total Deposits"
          value={fmt(totalDeposits)}
          tone="success"
        />

        <Stat
          label="Total Withdrawals"
          value={fmt(totalWithdrawals)}
          tone="primary"
        />

        <Stat
          label="Pending"
          value={String(pending)}
          tone="gold"
        />

        <Stat
          label="Referral Earnings"
          value={fmt(referralEarnings)}
          tone="gold"
        />
      </section>

      {/* Transactions */}
      <section className="mt-6 px-5">
        <SectionTitle
          title="Transaction history"
          action={<History className="h-4 w-4 text-muted-foreground" />}
        />

        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {types.map((type) => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === type
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        <Card className="mt-2 !p-2">
          <ul className="divide-y divide-border">
            {filtered.map((t) => {
              const amount = normalizeAmount(t.amount);
              const positive =
                amount > 0 ||
                t.type.toLowerCase().includes("deposit") ||
                t.type.toLowerCase().includes("earning");

              const date = t.date
                ? new Date(t.date).toLocaleString("en-KE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "";

              return (
                <li
                  key={t.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3"
                >
                  <span
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
                      positive
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <TrendingUp
                      className={`h-4 w-4 ${
                        positive ? "" : "rotate-180"
                      }`}
                    />
                  </span>

                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {t.type}
                    </p>

                    <p className="truncate text-[11px] text-muted-foreground">
                      {date}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-bold ${
                        positive
                          ? "text-success"
                          : "text-foreground"
                      }`}
                    >
                      {positive ? "+" : "-"}
                      {fmt(Math.abs(amount)).replace("KES ", "")}
                    </p>

                    <Badge
                      tone={
                        t.status.toLowerCase() === "pending"
                          ? "warning"
                          : t.status.toLowerCase().includes("fail")
                            ? "danger"
                            : "success"
                      }
                    >
                      {t.status}
                    </Badge>
                  </div>
                </li>
              );
            })}

            {filtered.length === 0 && (
              <li className="px-2 py-8 text-center text-xs text-muted-foreground">
                No transactions
              </li>
            )}
          </ul>
        </Card>
      </section>

      {/* Modals */}
      {action === "deposit" && (
        <DepositModal
          onClose={() => setAction(null)}
          onSuccess={fetchWalletData}
          onPending={(requestId) => {
            setDepositRequestId(requestId);
            setDepositPending(true);
          }}
        />
      )}

      {action === "withdraw" && (
        <WithdrawModal
          onClose={() => setAction(null)}
          onSuccess={fetchWalletData}
        />
      )}

      {action === "transfer" && (
        <TransferModal
          onClose={() => setAction(null)}
          onSuccess={fetchWalletData}
        />
      )}

      {/* Global STK waiting indicator */}
      {depositPending && (
        <div className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-md">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/95 p-4 text-white shadow-2xl backdrop-blur">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500/20">
                <Smartphone className="h-5 w-5 text-emerald-400" />
              </div>

              <div className="min-w-0">
                <p className="font-bold text-emerald-400">
                  Waiting for M-Pesa
                </p>

                <p className="mt-1 text-xs text-zinc-300">
                  Check your phone and enter your M-Pesa PIN to complete the
                  payment.
                </p>

                <div className="mt-2 flex items-center gap-2 text-[11px] text-zinc-500">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Waiting for Safaricom confirmation...
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Shell
// ─────────────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/30 sm:place-items-center">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <h3 className="text-base font-bold">{title}</h3>

          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DEPOSIT MODAL — M-PESA STK PUSH
// ─────────────────────────────────────────────────────────────────────────────

function DepositModal({
  onClose,
  onSuccess,
  onPending,
}: {
  onClose: () => void;
  onSuccess: () => void;
  onPending: (requestId: string) => void;
}) {
  const [amount, setAmount] = useState(100);
  const [method, setMethod] = useState<"M-Pesa" | "Bank Transfer">("M-Pesa");
  const [submitting, setSubmitting] = useState(false);
  const [stkSent, setStkSent] = useState(false);

  const QUICK_AMOUNTS = [50, 100, 500, 1000, 2000, 5000];

  const submit = async () => {
    if (amount < 10) {
      toast.error("Minimum deposit is KSh 10");
      return;
    }

    setSubmitting(true);

    try {
      /*
       * IMPORTANT:
       *
       * This is the new frontend → backend call.
       *
       * apiRequest handles your Render backend URL.
       *
       * The backend should:
       * 1. Authenticate the logged-in user.
       * 2. Get the user's registered phone number.
       * 3. Request a Daraja OAuth token.
       * 4. Send the STK Push.
       * 5. Save CheckoutRequestID.
       * 6. Receive the Safaricom callback.
       * 7. Credit the user's PESAKI wallet after successful payment.
       */

      if (method === "M-Pesa") {
        const response: DepositResponse = await apiRequest(
          "/wallet/deposit",
          {
            method: "POST",
            body: JSON.stringify({
              amount,
              method: "M-Pesa",
            }),
          }
        );

        if (response?.error) {
          throw new Error(response.error);
        }

        const requestId =
          response?.CheckoutRequestID ||
          response?.checkoutRequestId ||
          "";

        if (!requestId) {
          /*
           * Some backend implementations may return success without
           * exposing CheckoutRequestID. We still show the user that
           * the request was accepted.
           */
          setStkSent(true);

          toast.success(
            response?.message ||
              response?.CustomerMessage ||
              "M-Pesa payment request sent."
          );

          onSuccess();

          setTimeout(() => {
            onClose();
          }, 1500);

          return;
        }

        setStkSent(true);

        onPending(requestId);

        toast.success(
          response?.CustomerMessage ||
            response?.customerMessage ||
            "STK Push sent to your phone."
        );

        /*
         * Keep the modal open briefly so the user can see that
         * the STK Push was actually initiated.
         */
        setTimeout(() => {
          onClose();
        }, 1800);

        return;
      }

      // Bank transfer
      const response = await apiRequest("/wallet/deposit", {
        method: "POST",
        body: JSON.stringify({
          amount,
          method,
        }),
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      toast.success(
        response?.message ||
          `Deposit of ${fmt(amount)} initiated via bank transfer.`
      );

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Deposit error:", err);

      toast.error(
        err?.message ||
          "Unable to initiate the deposit. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Deposit funds" onClose={onClose}>
      {stkSent ? (
        <div className="py-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-7 w-7" />
          </div>

          <h3 className="mt-4 text-lg font-bold">
            STK Push Sent
          </h3>

          <p className="mt-2 text-sm text-muted-foreground">
            Check your M-Pesa phone and enter your PIN to complete
            the payment.
          </p>

          <div className="mt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Waiting for payment confirmation
          </div>
        </div>
      ) : (
        <>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount
          </label>

          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-semibold text-muted-foreground">
              KES
            </span>

            <input
              type="number"
              min={10}
              value={amount}
              onChange={(e) =>
                setAmount(Number(e.target.value) || 0)
              }
              className="w-full bg-transparent text-lg font-bold outline-none"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2">
            {QUICK_AMOUNTS.map((quickAmount) => (
              <button
                key={quickAmount}
                type="button"
                onClick={() => setAmount(quickAmount)}
                className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${
                  amount === quickAmount
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                KSh {quickAmount.toLocaleString()}
              </button>
            ))}
          </div>

          <label className="mt-5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Payment method
          </label>

          <select
            value={method}
            onChange={(e) =>
              setMethod(
                e.target.value as "M-Pesa" | "Bank Transfer"
              )
            }
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none"
          >
            <option value="M-Pesa">M-Pesa STK Push</option>
            <option value="Bank Transfer">Bank Transfer</option>
          </select>

          {method === "M-Pesa" && (
            <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <div className="flex items-start gap-3">
                <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />

                <div>
                  <p className="text-sm font-semibold">
                    M-Pesa STK Push
                  </p>

                  <p className="mt-1 text-xs text-muted-foreground">
                    Your registered PESAKI phone number will receive
                    an M-Pesa payment prompt.
                  </p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={submit}
            disabled={submitting || amount < 10}
            className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending STK Push...
              </>
            ) : method === "M-Pesa" ? (
              "Pay with M-Pesa"
            ) : (
              "Deposit Now"
            )}
          </button>

          <p className="mt-3 text-center text-[10px] text-muted-foreground">
            Secured by Safaricom Daraja API
          </p>
        </>
      )}
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WITHDRAW MODAL
// ─────────────────────────────────────────────────────────────────────────────

function WithdrawModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState<"M-Pesa" | "Bank">("M-Pesa");
  const [submitting, setSubmitting] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);

  const fee =
    method === "M-Pesa"
      ? Math.min(amount * 0.01, 50)
      : Math.min(amount * 0.02, 100);

  const total = amount + fee;

  const insufficient = total > availableBalance;

  useEffect(() => {
    apiRequest("/wallet/balance")
      .then((data) => {
        const bal = normalizeAmount(data?.balance);
        const locked = normalizeAmount(data?.locked);

        setAvailableBalance(Math.max(0, bal - locked));
      })
      .catch((err) => {
        console.error("Failed to load withdrawal balance:", err);
      });
  }, []);

  const submit = async () => {
    if (amount < 100) {
      toast.error("Minimum withdrawal is KSh 100");
      return;
    }

    if (insufficient) {
      toast.error("Insufficient balance");
      return;
    }

    setSubmitting(true);

    try {
      const response = await apiRequest("/wallet/withdraw", {
        method: "POST",
        body: JSON.stringify({
          amount,
          method,
          fee,
        }),
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      toast.success(
        response?.message ||
          `Withdrawal of ${fmt(amount)} to ${method} has been submitted.`
      );

      await onSuccess();
      onClose();
    } catch (err: any) {
      console.error("Withdrawal error:", err);

      toast.error(
        err?.message ||
          "Withdrawal failed. Please try again later."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell title="Withdraw funds" onClose={onClose}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Amount
      </label>

      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">
          KES
        </span>

        <input
          type="number"
          min={100}
          value={amount}
          onChange={(e) =>
            setAmount(Number(e.target.value) || 0)
          }
          className="w-full bg-transparent text-lg font-bold outline-none"
        />
      </div>

      <p className="mt-1.5 text-[11px] text-muted-foreground">
        Fee:{" "}
        <span className="font-semibold text-foreground">
          {fmt(fee)}
        </span>{" "}
        · Total deducted:{" "}
        <span className="font-semibold text-foreground">
          {fmt(total)}
        </span>
      </p>

      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Withdrawal method
      </label>

      <select
        value={method}
        onChange={(e) =>
          setMethod(e.target.value as "M-Pesa" | "Bank")
        }
        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none"
      >
        <option value="M-Pesa">M-Pesa</option>
        <option value="Bank">Bank</option>
      </select>

      <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
        Available balance:{" "}
        <span className="font-bold text-foreground">
          {fmt(availableBalance)}
        </span>
      </div>

      {insufficient && (
        <p className="mt-3 text-xs font-semibold text-destructive">
          Insufficient balance. You need {fmt(total)} but only have{" "}
          {fmt(availableBalance)} available.
        </p>
      )}

      <button
        onClick={submit}
        disabled={
          insufficient ||
          submitting ||
          amount < 100
        }
        className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          "Withdraw Now"
        )}
      </button>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER MODAL
// ─────────────────────────────────────────────────────────────────────────────

function TransferModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(500);
  const [step, setStep] = useState<"form" | "confirm" | "done">(
    "form"
  );
  const [submitting, setSubmitting] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(0);

  const insufficient = amount > availableBalance;

  useEffect(() => {
    apiRequest("/wallet/balance")
      .then((data) => {
        const bal = normalizeAmount(data?.balance);
        const locked = normalizeAmount(data?.locked);

        setAvailableBalance(Math.max(0, bal - locked));
      })
      .catch((err) => {
        console.error("Failed to load transfer balance:", err);
      });
  }, []);

  const validate = () => {
    if (!/^0\d{9}$/.test(phone)) {
      toast.error("Enter a valid 10-digit phone number");
      return false;
    }

    if (amount <= 0) {
      toast.error("Enter an amount");
      return false;
    }

    if (insufficient) {
      toast.error("Insufficient balance");
      return false;
    }

    return true;
  };

  const submitTransfer = async () => {
    if (!validate()) return;

    setSubmitting(true);

    try {
      const response = await apiRequest("/wallet/transfer", {
        method: "POST",
        body: JSON.stringify({
          recipientPhone: phone,
          amount,
        }),
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      toast.success(
        response?.message ||
          `Transfer of ${fmt(amount)} to ${phone} was successful.`
      );

      await onSuccess();

      setStep("done");
    } catch (err: any) {
      console.error("Transfer error:", err);

      toast.error(
        err?.message ||
          "Transfer failed. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell
      title={
        step === "confirm"
          ? "Confirm transfer"
          : step === "done"
            ? "Transfer sent"
            : "Send money"
      }
      onClose={onClose}
    >
      {step === "form" && (
        <>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recipient phone (07XXXXXXXX)
          </label>

          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="0712345678"
            maxLength={10}
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none"
          />

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount
          </label>

          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-semibold text-muted-foreground">
              KES
            </span>

            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) =>
                setAmount(Number(e.target.value) || 0)
              }
              className="w-full bg-transparent text-lg font-bold outline-none"
            />
          </div>

          <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
            Available balance:{" "}
            <span className="font-bold text-foreground">
              {fmt(availableBalance)}
            </span>
          </div>

          {insufficient && (
            <p className="mt-3 text-xs font-semibold text-destructive">
              Insufficient balance
            </p>
          )}

          <button
            onClick={() => {
              if (validate()) {
                setStep("confirm");
              }
            }}
            disabled={submitting}
            className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            Send Money
          </button>
        </>
      )}

      {step === "confirm" && (
        <>
          <div className="rounded-2xl bg-muted/50 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              Confirm transfer
            </p>

            <p className="mt-2 text-2xl font-bold">
              {fmt(amount)}
            </p>

            <p className="mt-2 text-sm">
              Send to{" "}
              <span className="font-bold">{phone}</span>
            </p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button
              onClick={() => setStep("form")}
              className="h-11 rounded-xl border border-border text-sm font-semibold"
            >
              Cancel
            </button>

            <button
              onClick={submitTransfer}
              disabled={submitting}
              className="flex h-11 items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                "Confirm"
              )}
            </button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="py-4 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-7 w-7" />
          </div>

          <p className="mt-4 text-sm font-bold">
            Transfer successful
          </p>

          <p className="mt-2 text-sm text-muted-foreground">
            {fmt(amount)} has been sent to {phone}.
          </p>

          <button
            onClick={onClose}
            className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
          >
            Done
          </button>
        </div>
      )}
    </ModalShell>
  );
}
