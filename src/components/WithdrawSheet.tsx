import { useState, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { toast } from "sonner";
import { apiRequest } from "@/utils/api";
import { fmt } from "@/lib/mock";
import { calculateWithdrawalFee, MIN_WITHDRAWAL } from "@/utils/fees";
import { SheetShell } from "@/components/SheetShell";

export interface WithdrawSheetProps {
  onClose: () => void;
  user: any;
  balance: number;
  onSuccess: () => void;
}

export function WithdrawSheet({ onClose, user, balance, onSuccess }: WithdrawSheetProps) {
  const { requireAuth } = useRequireAuth();
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableBalance, setAvailableBalance] = useState(balance);
  const [withdrawStatus, setWithdrawStatus] = useState<
    "idle" | "processing" | "success" | "failed"
  >("idle");

  useEffect(() => {
    let cancelled = false;
    const fetchAvailable = async () => {
      try {
        const data = await apiRequest("/wallet/available-balance?mode=real");
        if (!cancelled && data?.data?.available !== undefined) {
          setAvailableBalance(data.data.available);
        }
      } catch {
        // fallback to raw balance
      }
    };
    fetchAvailable();
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshBalance = async () => {
    try {
      const data = await apiRequest("/wallet/available-balance?mode=real");
      if (data?.data?.available !== undefined) {
        setAvailableBalance(data.data.available);
      }
    } catch {
      // ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    if (!amount || !phone) return;
    const numAmount = parseInt(amount);

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.startsWith("0")) cleanPhone = "254" + cleanPhone.slice(1);
    if (!cleanPhone.startsWith("254")) cleanPhone = "254" + cleanPhone;

    if (cleanPhone.length !== 12) {
      toast.error("Enter a valid phone number");
      return;
    }

    setLoading(true);
    setWithdrawStatus("processing");
    try {
      const result = await apiRequest("/wallet/withdraw/b2c", {
        method: "POST",
        body: JSON.stringify({ amount: numAmount, phone: cleanPhone }),
      });

      if (result?.success) {
        setWithdrawStatus("success");
        refreshBalance();
        onSuccess();
        toast.success("Withdrawal successful");
        setTimeout(() => onClose(), 3000);
      } else {
        throw new Error(result?.error || "Withdrawal failed");
      }
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
      setWithdrawStatus("failed");
      setTimeout(() => onClose(), 4000);
    } finally {
      setLoading(false);
    }
  };

  if (withdrawStatus === "success") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-bold">Withdrawal Successful</p>
          <p className="text-xs text-muted-foreground">
            {fmt(parseInt(amount))} has been sent to your M-Pesa account.
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

  if (withdrawStatus === "failed") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/15 text-destructive">
            <XCircle className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-bold">Withdrawal Failed</p>
          <p className="text-xs text-muted-foreground">
            The withdrawal could not be completed. The funds have been returned to your wallet.
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
    <SheetShell title="Withdraw Funds" onClose={onClose}>
      <p className="text-xs text-muted-foreground">
        Withdraw to your M-Pesa account via Palpluss B2C.
      </p>
      <p className="mt-1 text-sm font-semibold">Available: {fmt(availableBalance)}</p>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Amount (KES)
          </label>
          <input
            type="number"
            min={MIN_WITHDRAWAL}
            max={availableBalance}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. 500"
          />
          {amount && parseInt(amount) < MIN_WITHDRAWAL && (
            <p className="mt-1 text-[11px] text-destructive">
              Minimum withdrawal is KES {MIN_WITHDRAWAL}
            </p>
          )}
          {amount && parseInt(amount) >= MIN_WITHDRAWAL && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              You will receive: KES{" "}
              {Math.max(0, parseInt(amount) - calculateWithdrawalFee(parseInt(amount)))} (Fee: KES{" "}
              {calculateWithdrawalFee(parseInt(amount))})
            </p>
          )}
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
          disabled={
            loading ||
            !amount ||
            parseInt(amount) < MIN_WITHDRAWAL ||
            parseInt(amount) > availableBalance
          }
          className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : "Withdraw"}
        </button>
      </form>
    </SheetShell>
  );
}
