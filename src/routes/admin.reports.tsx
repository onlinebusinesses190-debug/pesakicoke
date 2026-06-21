import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI } from "@/components/AdminShell";
import { revenueSeries, adminStats, fmtCompact } from "@/lib/admin-mock";
import { Download, FileText } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
});

function AdminReports() {
  const max = Math.max(...revenueSeries.map((r) => r.v));
  return (
    <>
      <AdminPageHeader
        title="Reports & Analytics"
        subtitle="Export financial, operational, and compliance reports."
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Download className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Revenue YTD" value={fmtCompact(adminStats.platformRevenue)} hint="+18.4%" tone="gold" />
        <KPI label="GMV" value={fmtCompact(adminStats.totalDeposits)} hint="Gross merchandise" tone="success" />
        <KPI label="Active Users" value={adminStats.activeUsers.toLocaleString()} hint="MAU" />
        <KPI label="Conversion" value="6.8%" hint="Signup → Verified" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard title="Revenue (KES, millions)" className="lg:col-span-2">
          <div className="flex h-64 items-end gap-3">
            {revenueSeries.map((r) => (
              <div key={r.m} className="flex flex-1 flex-col items-center gap-2">
                <div className="w-full rounded-t-lg gradient-primary" style={{ height: `${(r.v / max) * 100}%` }} />
                <span className="text-[10px] font-medium text-muted-foreground">{r.m}</span>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminCard title="Available reports">
          <ul className="space-y-2 text-sm">
            {[
              "Monthly financial statement",
              "KYC compliance log",
              "Withdrawal audit",
              "Trading volume & house P&L",
              "Loan performance",
              "Referral commission ledger",
            ].map((r) => (
              <li key={r} className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{r}</span>
                </div>
                <button className="text-xs font-semibold text-primary hover:underline">Download</button>
              </li>
            ))}
          </ul>
        </AdminCard>
      </section>
    </>
  );
}
