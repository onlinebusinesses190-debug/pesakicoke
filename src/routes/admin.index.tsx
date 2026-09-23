import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { fmtCompact, fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { TrendingUp, Download } from "lucide-react";

interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  pendingKyc: number;
  totalDeposits: number;
  totalWithdrawals: number;
  pendingWithdrawals: number;
  platformRevenue: number;
  openTickets: number;
  activeJobs: number;
  fundedBusinesses: number;
}

interface RevenuePoint {
  m: string;
  v: number;
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

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const { loading: authLoading } = useAdminAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [adminTx, setAdminTx] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest("/admin/dashboard")
      .then(
        (res: {
          success: boolean;
          stats: DashboardStats;
          revenueSeries: RevenuePoint[];
          recentTransactions: Transaction[];
        }) => {
          setStats(res.stats);
          setRevenueSeries(res.revenueSeries || []);
          setAdminTx(res.recentTransactions || []);
          setLoading(false);
        },
      )
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        setLoading(false);
      });
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No data available.</p>
      </div>
    );
  }

  const max = revenueSeries.length > 0 ? Math.max(...revenueSeries.map((r) => r.v)) : 1;

  return (
    <>
      <AdminPageHeader
        title="Platform Overview"
        subtitle="Real-time metrics across PESAKI's wealth ecosystem."
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90">
            <Download className="h-4 w-4" /> Export report
          </button>
        }
      />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPI
          label="Total Users"
          value={stats.totalUsers.toLocaleString()}
          hint={`${stats.activeUsers.toLocaleString()} active`}
        />
        <KPI
          label="Platform Revenue"
          value={fmtCompact(stats.platformRevenue)}
          hint="+12.4% MoM"
          tone="gold"
        />
        <KPI
          label="Pending Withdrawals"
          value={fmtCompact(stats.pendingWithdrawals)}
          hint="Requires review"
          tone="destructive"
        />
        <KPI
          label="KYC Pending"
          value={stats.pendingKyc.toLocaleString()}
          hint="Verify within 24h"
          tone="success"
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard
          className="lg:col-span-2"
          title="Revenue trend (KES, millions)"
          action={
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <TrendingUp className="h-3 w-3" /> +18.4% YTD
            </span>
          }
        >
          <div className="flex h-56 items-end gap-3">
            {revenueSeries.map((r) => (
              <div key={r.m} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-lg gradient-primary transition-all"
                  style={{ height: `${(r.v / max) * 100}%` }}
                  title={`${r.v}M`}
                />
                <span className="text-[10px] font-medium text-muted-foreground">{r.m}</span>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="Quick stats">
          <ul className="space-y-3 text-sm">
            <Row label="Total Deposits" value={fmtCompact(stats.totalDeposits)} />
            <Row label="Total Withdrawals" value={fmtCompact(stats.totalWithdrawals)} />
            <Row label="Active Jobs" value={stats.activeJobs.toLocaleString()} />
            <Row label="Funded Businesses" value={stats.fundedBusinesses.toLocaleString()} />
            <Row label="Open Tickets" value={stats.openTickets.toLocaleString()} />
          </ul>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard
          title="Recent transactions"
          action={
            <a className="text-xs font-semibold text-primary" href="/admin/finance">
              View all
            </a>
          }
        >
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-center justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </li>
  );
}
