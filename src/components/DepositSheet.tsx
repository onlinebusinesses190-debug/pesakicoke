import { useEffect, useState, useRef } from "react";
import { toast } from "sonner";
import { ArrowLeft, TrendingUp, X, Loader2 } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { supabase } from "@/integrations/supabase/client";
import { MIN_DEPOSIT } from "@/utils/fees";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

export interface DepositSheetProps {
  onClose: () => void;
  user: any;
  onSuccess?: () => void;
  onDepositComplete?: () => void;
}

// ─── Shared Deposit Sheet ────────────────────────────────────────────────────
// Extracted from src/routes/wallet.tsx so every trading page can open the
// exact same M-Pesa STK push deposit flow inline, without navigating away.
export function DepositSheet({ onClose, user, onSuccess, onDepositComplete }: DepositSheetProps) {
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"form" | "processing" | "waiting" | "success" | "failed">(
    "form",
  );
  const [depositPhone, setDepositPhone] = useState("");
  const pollRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollDepositStatus = async (checkoutRequestId: string) => {
    if (attemptsRef.current >= 20) {
      stopPolling();
      setStep("failed");
      return;
    }

    attemptsRef.current += 1;

    try {
      const statusData = await apiRequest(`/wallet/deposit/status/${checkoutRequestId}`);
      const status = String(statusData?.data?.status || "").toLowerCase();

      if (status === "completed") {
        stopPolling();
        setStep("success");
        onSuccess?.();
        onDepositComplete?.();
        toast.success(`Deposit successful! KES ${amount} has been added to your wallet.`);
        setTimeout(() => onClose(), 3000);
      } else if (status === "failed") {
        stopPolling();
        setStep("failed");
        toast.error("Deposit failed or was cancelled. Please try again.");
        setTimeout(() => onClose(), 4000);
      } else {
        pollRef.current = window.setTimeout(() => pollDepositStatus(checkoutRequestId), 3000);
      }
    } catch (err) {
      pollRef.current = window.setTimeout(() => pollDepositStatus(checkoutRequestId), 3000);
    }
  };

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!amount || !phone) return;

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

      if (response.ok && data?.success && data?.data?.checkoutRequestId) {
        setDepositPhone(cleanPhone);
        setStep("waiting");
        attemptsRef.current = 0;
        pollDepositStatus(data.data.checkoutRequestId);
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
          <p className="mt-3 text-lg font-bold">Deposit Successful</p>
          <p className="text-xs text-muted-foreground">
            Deposit successful! KES {amount} has been added to your wallet.
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

  if (step === "failed") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-destructive/15 text-destructive">
            <X className="h-8 w-8" />
          </div>
          <p className="mt-3 text-lg font-bold">Deposit Failed</p>
          <p className="text-xs text-muted-foreground">
            Taking longer than expected. If you entered your PIN, refresh the page in a minute to
            see your updated balance.
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

  if (step === "processing") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <p className="mt-4 text-lg font-bold">Processing your request...</p>
          <p className="mt-2 text-xs text-muted-foreground">
            You will receive an M-Pesa prompt shortly.
          </p>
        </div>
      </div>
    );
  }

  if (step === "waiting") {
    return (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
        <div className="w-full max-w-sm rounded-2xl bg-card p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-warning/15 text-warning">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <p className="mt-4 text-lg font-bold">M-Pesa prompt sent</p>
          <p className="mt-2 text-xs text-muted-foreground">
            M-Pesa prompt sent to {depositPhone}. Enter your PIN to confirm.
          </p>
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
            disabled={loading || !amount || parseInt(amount) < MIN_DEPOSIT}
            className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
          >
            {loading ? "Processing..." : "Send STK Push"}
          </button>
          {amount && parseInt(amount) < MIN_DEPOSIT && (
            <p className="text-[11px] text-destructive">Minimum deposit is KES {MIN_DEPOSIT}</p>
          )}
          {amount && parseInt(amount) >= MIN_DEPOSIT && (
            <p className="text-[11px] text-muted-foreground">
              You will receive: KES {parseInt(amount)} (No deposit fee)
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
