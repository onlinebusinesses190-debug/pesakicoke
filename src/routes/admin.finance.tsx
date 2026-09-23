import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { fmtCompact, fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface FinanceStats {
  totalDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  platformRevenue: number;
}

interface Transaction {
  id: string;
  user: string;
  type: string;
  amount: number;
  method: string;
  status: string;
  date: string;
}

interface Withdrawal {
  id: string;
  user_id: string;
  amount: number;
  phone: string;
  reference: string;
  status: string;
  user: string;
  created_at: string;
}

interface MethodShare {
  name: string;
  share: number;
}

export const Route = createFileRoute("/admin/finance")({
  component: AdminFinance,
});

function AdminFinance() {
  const { loading: authLoading } = useAdminAuth();
  const [stats, setStats] = useState<FinanceStats | null>(null);
  const [adminTx, setAdminTx] = useState<Transaction[]>([]);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  const computeMethods = (txs: Transaction[]): MethodShare[] => {
    const methodCounts: Record<string, number> = {};
    let total = 0;
    for (const t of txs) {
      const m = t.method?.toLowerCase() || "";
      let name = "Other";
      if (m.includes("mpesa") || m.includes("m-pesa")) name = "M-PESA";
      else if (m.includes("bank")) name = "Bank Transfer";
      else if (m.includes("card")) name = "Card";
      else if (m.includes("crypto")) name = "Crypto";
      methodCounts[name] = (methodCounts[name] || 0) + 1;
      total++;
    }
    if (total === 0) return [{ name: "M-PESA", share: 100 }];
    return Object.entries(methodCounts)
      .map(([name, count]) => ({ name, share: Math.round((count / total) * 100) }))
      .sort((a, b) => b.share - a.share);
  };

  useEffect(() => {
    if (authLoading) return;

    Promise.all([
      apiRequest("/admin/finance/stats"),
      apiRequest<{ success: boolean; withdrawals: Withdrawal[] }>("/admin/finance/withdrawals"),
      apiRequest<{ success: boolean; transactions: Transaction[] }>("/admin/finance/transactions"),
    ])
      .then(([statsRes, wdRes, txRes]) => {
        setStats(statsRes.stats || null);
        setWithdrawals(wdRes.withdrawals || []);
        setAdminTx(txRes.transactions || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Finance fetch error:", err);
        toast.error("Could not load finance data");
        setLoading(false);
      });
  }, [authLoading]);

  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");
  const methods = computeMethods(adminTx);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading finance data…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader title="Finance" subtitle="Deposits, withdrawals, and revenue oversight." />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI
            label="Total Deposits"
            value={fmtCompact(stats.totalDeposits)}
            hint="All time"
            tone="success"
          />
          <KPI
            label="Total Withdrawals"
            value={fmtCompact(stats.totalWithdrawals)}
            hint="All time"
          />
          <KPI
            label="Pending Withdrawals"
            value={fmtCompact(stats.pendingWithdrawals)}
            hint="Awaiting approval"
            tone="destructive"
          />
          <KPI
            label="Platform Revenue"
            value={fmtCompact(stats.platformRevenue)}
            hint="+12.4% MoM"
            tone="gold"
          />
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard title="Pending withdrawals" className="lg:col-span-2">
          <ul className="space-y-3 text-sm">
            {pendingWithdrawals.length === 0 ? (
              <li className="text-center text-muted-foreground py-8">No pending withdrawals.</li>
            ) : (
              pendingWithdrawals.map((w) => (
                <li
                  key={w.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3"
                >
                  <div>
                    <p className="font-semibold">{w.user}</p>
                    <p className="text-xs text-muted-foreground">
                      {w.reference} · {w.phone} ·{" "}
                      {w.created_at ? new Date(w.created_at).toLocaleDateString("en-KE") : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{fmtKES(Number(w.amount))}</p>
                    <div className="mt-1 flex justify-end gap-2">
                      <button
                        onClick={async () => {
                          try {
                            await apiRequest(`/admin/finance/withdrawal/${w.id}/approve`, {
                              method: "POST",
                            });
                            setWithdrawals(withdrawals.filter((x) => x.id !== w.id));
                            toast.success("Withdrawal approved");
                          } catch (err) {
                            toast.error("Failed to approve");
                          }
                        }}
                        className="rounded-md bg-success px-3 py-1 text-xs font-semibold text-success-foreground"
                      >
                        Approve
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await apiRequest(`/admin/finance/withdrawal/${w.id}/reject`, {
                              method: "POST",
                              body: JSON.stringify({ reason: "Fraud investigation" }),
                            });
                            setWithdrawals(withdrawals.filter((x) => x.id !== w.id));
                            toast.success("Withdrawal rejected");
                          } catch (err) {
                            toast.error("Failed to reject");
                          }
                        }}
                        className="rounded-md border border-border px-3 py-1 text-xs font-semibold"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
        </AdminCard>

        <AdminCard title="Payment methods">
          <ul className="space-y-3 text-sm">
            {methods.map((m) => (
              <Method key={m.name} name={m.name} share={m.share} />
            ))}
          </ul>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="All transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {adminTx.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{t.id}</td>
                    <td className="py-3 pr-3 font-medium">{t.user}</td>
                    <td className="py-3 pr-3">{t.type}</td>
                    <td
                      className={`py-3 pr-3 text-right font-semibold ${t.amount < 0 ? "text-destructive" : "text-success"}`}
                    >
                      {fmtKES(t.amount)}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">{t.method}</td>
                    <td className="py-3 pr-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="py-3 text-muted-foreground">{t.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </section>
    </>
  );
}

function Method({ name, share }: { name: string; share: number }) {
  return (
    <li>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">{share}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full gradient-primary" style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}
