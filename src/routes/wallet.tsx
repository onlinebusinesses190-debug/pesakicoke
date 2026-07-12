import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, History, Eye, EyeOff, TrendingUp,
  X, ArrowLeft, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { user, fmt } from "@/lib/mock";
import { balanceStore, useBalance, withdrawFee, totalLocked } from "@/lib/balance";

export const Route = createFileRoute("/wallet")({
  head: () => ({
    meta: [
      { title: "Wallet — PESAKI" },
      { name: "description", content: "Deposit, withdraw, transfer and track all your PESAKI transactions in one secure wallet." },
    ],
  }),
  component: WalletPage,
});

type Action = "deposit" | "withdraw" | "transfer";

function WalletPage() {
  const state = useBalance();
  const [show, setShow] = useState(true);
  const [filter, setFilter] = useState<string>("All");
  const [action, setAction] = useState<Action | null>(null);

  const types = ["All", "Deposit", "Withdrawal", "Trading", "Job Earnings", "Business Funding", "Savings", "Transfer"];
  const filtered = filter === "All" ? state.transactions : state.transactions.filter((t) => t.type.toLowerCase().includes(filter.toLowerCase()));

  const totalDeposits = state.transactions.filter((t) => t.type.startsWith("Deposit")).reduce((s, t) => s + t.amount, 0);
  const totalWithdrawals = -state.transactions.filter((t) => t.type.startsWith("Withdrawal") && !t.type.includes("fee")).reduce((s, t) => s + t.amount, 0);
  const pending = state.transactions.filter((t) => t.status === "Pending").length;

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
            {show ? fmt(state.available) : "•••••••"}
          </p>
          <p className="relative mt-1 text-[11px] opacity-80">Locked: {show ? fmt(totalLocked(state)) : "•••"}</p>
          <div className="relative mt-5 grid grid-cols-3 gap-2">
            {[
              { l: "Deposit",  i: ArrowDownToLine, a: "deposit" as const },
              { l: "Withdraw", i: ArrowUpFromLine, a: "withdraw" as const },
              { l: "Transfer", i: ArrowLeftRight,  a: "transfer" as const },
            ].map((it) => (
              <button
                key={it.l}
                onClick={() => setAction(it.a)}
                className="flex flex-col items-center gap-1 rounded-xl bg-white/15 py-2.5 text-xs font-semibold backdrop-blur hover:bg-white/25"
              >
                <it.i className="h-4 w-4" />
                {it.l}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 px-5">
        <Stat label="Total Deposits"     value={fmt(totalDeposits)} tone="success" />
        <Stat label="Total Withdrawals"  value={fmt(totalWithdrawals)} tone="primary" />
        <Stat label="Pending"            value={String(pending)} tone="gold" />
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

      {action === "deposit"  && <DepositModal  onClose={() => setAction(null)} />}
      {action === "withdraw" && <WithdrawModal onClose={() => setAction(null)} />}
      {action === "transfer" && <TransferModal onClose={() => setAction(null)} />}
    </AppShell>
  );
}

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DepositModal({ onClose }: { onClose: () => void }) {
  const [amount, setAmount] = useState(5000);
  const [method, setMethod] = useState<"M-Pesa" | "Bank Transfer">("M-Pesa");

  const submit = () => {
    if (amount <= 0) return toast.error("Enter an amount");
    balanceStore.deposit(amount, method);
    toast.success(`Deposit of ${fmt(amount)} received via ${method}`);
    onClose();
  };

  return (
    <ModalShell title="Deposit funds" onClose={onClose}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">KES</span>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-lg font-bold outline-none" />
      </div>

      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Payment method</label>
      <select value={method} onChange={(e) => setMethod(e.target.value as any)}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none">
        <option>M-Pesa</option>
        <option>Bank Transfer</option>
      </select>

      <button onClick={submit} className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
        Deposit Now
      </button>
    </ModalShell>
  );
}

function WithdrawModal({ onClose }: { onClose: () => void }) {
  const state = useBalance();
  const [amount, setAmount] = useState(1000);
  const [method, setMethod] = useState<"M-Pesa" | "Bank">("M-Pesa");
  const fee = withdrawFee(amount, method);
  const total = amount + fee;
  const insufficient = total > state.available;

  const submit = () => {
    if (amount <= 0) return toast.error("Enter an amount");
    const res = balanceStore.withdraw(amount, method);
    if (!res.ok) return toast.error(res.error!);
    toast.success(`Withdrawal of ${fmt(amount)} to ${method} processed`);
    onClose();
  };

  return (
    <ModalShell title="Withdraw funds" onClose={onClose}>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
      <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
        <span className="text-sm font-semibold text-muted-foreground">KES</span>
        <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-lg font-bold outline-none" />
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Fee: <span className="font-semibold text-foreground">{fmt(fee)}</span> · Total deducted: <span className="font-semibold text-foreground">{fmt(total)}</span></p>

      <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Withdrawal method</label>
      <select value={method} onChange={(e) => setMethod(e.target.value as any)}
        className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none">
        <option>M-Pesa</option>
        <option>Bank</option>
      </select>

      {insufficient && <p className="mt-3 text-xs font-semibold text-destructive">Insufficient balance (available {fmt(state.available)})</p>}

      <button onClick={submit} disabled={insufficient} className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
        Withdraw Now
      </button>
    </ModalShell>
  );
}

function TransferModal({ onClose }: { onClose: () => void }) {
  const state = useBalance();
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(500);
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");

  const insufficient = amount > state.available;

  const confirm = () => {
    const res = balanceStore.transfer(phone, amount);
    if (!res.ok) return toast.error(res.error!);
    toast.success(`Transfer of ${fmt(amount)} to ${phone} was successful`);
    // Simulate receiver toast
    setTimeout(() => toast(`Recipient ${phone} received ${fmt(amount)} from you`), 800);
    setStep("done");
  };

  return (
    <ModalShell title={step === "confirm" ? "Confirm transfer" : step === "done" ? "Transfer sent" : "Send money"} onClose={onClose}>
      {step === "form" && (
        <>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recipient phone (07XXXXXXXX)</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712345678"
            className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none" />

          <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Amount</label>
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="text-sm font-semibold text-muted-foreground">KES</span>
            <input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)}
              className="w-full bg-transparent text-lg font-bold outline-none" />
          </div>
          {insufficient && <p className="mt-3 text-xs font-semibold text-destructive">Insufficient balance</p>}

          <button
            onClick={() => {
              if (!/^0\d{9}$/.test(phone)) return toast.error("Enter a valid 10-digit phone");
              if (amount <= 0) return toast.error("Enter an amount");
              if (insufficient) return toast.error("Insufficient balance");
              setStep("confirm");
            }}
            className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
          >
            Send Money
          </button>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="text-center text-sm">
            Confirm transfer: send <span className="font-bold">{fmt(amount)}</span> to <span className="font-bold">{phone}</span>?
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2">
            <button onClick={() => setStep("form")} className="h-11 rounded-xl border border-border text-sm font-semibold">Cancel</button>
            <button onClick={confirm} className="h-11 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Confirm</button>
          </div>
        </>
      )}

      {step === "done" && (
        <div className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-sm font-bold">Transfer of {fmt(amount)} to {phone} was successful.</p>
          <button onClick={onClose} className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Done</button>
        </div>
      )}
    </ModalShell>
  );
}
