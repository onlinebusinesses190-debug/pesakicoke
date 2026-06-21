import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminStats, revenueSeries, adminTx, fmtCompact, fmtKES } from "@/lib/admin-mock";
import { TrendingUp, Download } from "lucide-react";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

function AdminDashboard() {
  const max = Math.max(...revenueSeries.map((r) => r.v));
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
        <KPI label="Total Users" value={adminStats.totalUsers.toLocaleString()} hint={`${adminStats.activeUsers.toLocaleString()} active`} />
        <KPI label="Platform Revenue" value={fmtCompact(adminStats.platformRevenue)} hint="+12.4% MoM" tone="gold" />
        <KPI label="Pending Withdrawals" value={fmtCompact(adminStats.pendingWithdrawals)} hint="Requires review" tone="destructive" />
        <KPI label="KYC Pending" value={adminStats.pendingKyc.toLocaleString()} hint="Verify within 24h" tone="success" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard className="lg:col-span-2" title="Revenue trend (KES, millions)" action={<span className="inline-flex items-center gap-1 text-xs text-success"><TrendingUp className="h-3 w-3" /> +18.4% YTD</span>}>
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
            <Row label="Total Deposits" value={fmtCompact(adminStats.totalDeposits)} />
            <Row label="Total Withdrawals" value={fmtCompact(adminStats.totalWithdrawals)} />
            <Row label="Active Jobs" value={adminStats.activeJobs.toLocaleString()} />
            <Row label="Funded Businesses" value={adminStats.fundedBusinesses.toLocaleString()} />
            <Row label="Open Tickets" value={adminStats.openTickets.toLocaleString()} />
          </ul>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="Recent transactions" action={<a className="text-xs font-semibold text-primary" href="/admin/finance">View all</a>}>
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
                    <td className={`py-3 pr-3 text-right font-semibold ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{fmtKES(t.amount)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{t.method}</td>
                    <td className="py-3 pr-3"><StatusPill status={t.status} /></td>
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
