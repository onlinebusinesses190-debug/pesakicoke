import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI } from "@/components/AdminShell";
import { fmtCompact, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { Download, FileText } from "lucide-react";

interface RevenuePoint {
  m: string;
  v: number;
}

interface ReportMetrics {
  platformRevenue: number;
  totalDeposits: number;
  totalWithdrawals: number;
  activeUsers: number;
  fundedBusinesses: number;
}

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
});

function AdminReports() {
  const { loading: authLoading } = useAdminAuth();
  const [revenueSeries, setRevenueSeries] = useState<RevenuePoint[]>([]);
  const [metrics, setMetrics] = useState<ReportMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    Promise.all([
      apiRequest<{ success: boolean; data: RevenuePoint[] }>("/admin/reports/revenue"),
      apiRequest<{ success: boolean; data: ReportMetrics }>("/admin/reports/metrics"),
    ])
      .then(([revRes, metricsRes]) => {
        if (revRes.success && Array.isArray(revRes.data)) setRevenueSeries(revRes.data);
        if (metricsRes.success && metricsRes.data) setMetrics(metricsRes.data);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load report data");
        setLoading(false);
      });
  }, [authLoading]);

  const max = revenueSeries.length > 0 ? Math.max(...revenueSeries.map((r) => r.v)) : 1;

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading reports…</p>
      </div>
    );
  }

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

      {metrics && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI
            label="Revenue YTD"
            value={fmtCompact(metrics.platformRevenue)}
            hint="+18.4%"
            tone="gold"
          />
          <KPI
            label="GMV"
            value={fmtCompact(metrics.totalDeposits)}
            hint="Gross merchandise"
            tone="success"
          />
          <KPI label="Active Users" value={fmt(metrics.activeUsers)} hint="MAU" />
          <KPI label="Conversion" value="6.8%" hint="Signup → Verified" />
        </section>
      )}

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard title="Revenue (KES, millions)" className="lg:col-span-2">
          <div className="flex h-64 items-end gap-3">
            {revenueSeries.map((r) => (
              <div key={r.m} className="flex flex-1 flex-col items-center gap-2">
                <div
                  className="w-full rounded-t-lg gradient-primary"
                  style={{ height: `${(r.v / max) * 100}%` }}
                />
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
              <li
                key={r}
                className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3"
              >
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>{r}</span>
                </div>
                <button className="text-xs font-semibold text-primary hover:underline">
                  Download
                </button>
              </li>
            ))}
          </ul>
        </AdminCard>
      </section>
    </>
  );
}
