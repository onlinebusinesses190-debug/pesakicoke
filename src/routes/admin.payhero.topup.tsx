import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { fmtCompact, fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface TopUp {
  id: string;
  admin_email: string;
  admin_name: string;
  amount: number;
  phone_number: string;
  reference_id: string | null;
  status: string;
  provider_response: any;
  created_at: string;
  updated_at: string;
}

interface TopUpStats {
  totalTopups: number;
  totalAmount: number;
  pendingAmount: number;
  completedAmount: number;
}

export const Route = createFileRoute("/admin/payhero/topup")({
  component: PayHeroTopUpPage,
});

function PayHeroTopUpPage() {
  const { loading: authLoading } = useAdminAuth();
  const [topups, setTopups] = useState<TopUp[]>([]);
  const [stats, setStats] = useState<TopUpStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    Promise.all([
      apiRequest<{ success: boolean; data: { topups: TopUp[]; count: number } }>("/api/admin/payhero/topups"),
      apiRequest<{ success: boolean; data: TopUpStats }>("/api/admin/payhero/topup/stats"),
    ])
      .then(([topupsRes, statsRes]) => {
        if (topupsRes.success) setTopups(topupsRes.data?.topups || []);
        if (statsRes.success) setStats(statsRes.data || null);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load top-up data");
        setLoading(false);
      });
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading top-ups…</p>
      </div>
    );
  }

  const pending = topups.filter((t) => t.status === "PENDING");
  const completed = topups.filter((t) => t.status === "QUEUED" || t.status === "COMPLETED");
  const failed = topups.filter((t) => t.status === "FAILED");

  return (
    <>
      <AdminPageHeader
        title="PayHero Wallet Top-Up"
        subtitle="Fund the PayHero payout wallet via M-Pesa STK Push."
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90">
            New Top-Up
          </button>
        }
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI
            label="Total Top-Ups"
            value={stats.totalTopups.toLocaleString()}
            hint="All time"
            tone="primary"
          />
          <KPI
            label="Total Funded"
            value={fmtCompact(stats.totalAmount)}
            hint="KES credited to PayHero wallet"
            tone="success"
          />
          <KPI
            label="Pending"
            value={fmtCompact(stats.pendingAmount)}
            hint={pending.length.toLocaleString() + " awaiting STK Push"}
            tone="destructive"
          />
          <KPI
            label="Completed"
            value={fmtCompact(stats.completedAmount)}
            hint={completed.length.toLocaleString() + " successful"}
            tone="success"
          />
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard title="Pending Top-Ups" className="lg:col-span-2">
          <ul className="space-y-3 text-sm">
            {pending.length === 0 ? (
              <li className="py-8 text-center text-muted-foreground">No pending top-ups.</li>
            ) : (
              pending.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                  <div>
                    <p className="font-semibold">{t.admin_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.admin_email} · {t.phone_number} ·
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-KE") : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{fmtKES(t.amount)}</p>
                    <StatusPill status={t.status} />
                  </div>
                </li>
              ))
            )}
          </ul>
        </AdminCard>

        <AdminCard title="Failed Top-Ups">
          <ul className="space-y-3 text-sm">
            {failed.length === 0 ? (
              <li className="py-8 text-center text-muted-foreground">No failed top-ups.</li>
            ) : (
              failed.map((t) => (
                <li key={t.id} className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 p-3">
                  <div>
                    <p className="font-semibold">{t.admin_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.phone_number} ·
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-KE") : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-destructive">{fmtKES(t.amount)}</p>
                    <StatusPill status={t.status} />
                  </div>
                </li>
              ))
            )}
          </ul>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="All Top-Ups">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Admin</th>
                  <th className="py-2 pr-3">Phone</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {topups.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                      {t.id.slice(0, 8)}…
                    </td>
                    <td className="py-3 pr-3 font-medium">{t.admin_name}</td>
                    <td className="py-3 pr-3">{t.phone_number}</td>
                    <td className="py-3 pr-3 text-right font-semibold">
                      {fmtKES(t.amount)}
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">
                      {t.reference_id || "—"}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="py-3 text-muted-foreground">
                      {t.created_at ? new Date(t.created_at).toLocaleDateString("en-KE") : ""}
                    </td>
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
