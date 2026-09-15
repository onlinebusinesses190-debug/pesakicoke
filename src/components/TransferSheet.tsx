import { useState } from "react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { toast } from "sonner";
import { apiRequest } from "@/utils/api";
import { fmt } from "@/lib/mock";
import { calculateTransferFee, MIN_TRANSFER } from "@/utils/fees";
import { SheetShell } from "@/components/SheetShell";

export interface TransferSheetProps {
  onClose: () => void;
  user: any;
  balance: number;
  onSuccess: () => void;
}

export function TransferSheet({ onClose, user, balance, onSuccess }: TransferSheetProps) {
  const { requireAuth } = useRequireAuth();
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!requireAuth()) return;
    if (!amount || !recipient) return;
    const numAmount = parseInt(amount);
    if (numAmount > balance) {
      toast.error("Insufficient balance");
      return;
    }

    setLoading(true);
    try {
      await apiRequest("/wallet/transfer", {
        method: "POST",
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
            min={MIN_TRANSFER}
            max={balance}
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="e.g. 500"
          />
          {amount && parseInt(amount) < MIN_TRANSFER && (
            <p className="mt-1 text-[11px] text-destructive">
              Minimum transfer is KES {MIN_TRANSFER}
            </p>
          )}
          {amount && parseInt(amount) >= MIN_TRANSFER && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Recipient will receive: KES{" "}
              {Math.max(0, parseInt(amount) - calculateTransferFee(parseInt(amount)))} (Fee: KES{" "}
              {calculateTransferFee(parseInt(amount))})
            </p>
          )}
        </div>
        <button
          type="submit"
          disabled={
            loading || !amount || parseInt(amount) < MIN_TRANSFER || parseInt(amount) > balance
          }
          className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Processing..." : "Transfer"}
        </button>
      </form>
    </SheetShell>
  );
}
