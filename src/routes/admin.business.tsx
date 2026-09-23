import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { fmtKES, fmtCompact } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface BusinessApp {
  id: string;
  business: string;
  owner: string;
  amount: number;
  status: string;
  repaid: number;
  created_at: string;
}

interface BusinessAppResponse {
  id: string;
  business_name: string;
  owner: string;
  amount_requested: number;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/admin/business")({
  component: AdminBusiness,
});

function AdminBusiness() {
  const { loading: authLoading } = useAdminAuth();
  const [apps, setApps] = useState<BusinessApp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; applications: BusinessAppResponse[] }>(
      "/admin/business/applications?limit=50",
    )
      .then((res) => {
        const mapped = (res.applications || []).map((a) => ({
          id: a.id,
          business: a.business_name || "Unnamed",
          owner: a.owner || "Unknown",
          amount: Number(a.amount_requested || 0),
          status: a.status,
          repaid: 0,
          created_at: a.created_at,
        }));
        setApps(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Business fetch error:", err);
        toast.error("Could not load business data");
        setLoading(false);
      });
  }, [authLoading]);

  const fundedCount = apps.filter(
    (a) => a.status === "Approved" || a.status === "Disbursed",
  ).length;
  const totalDisbursed = apps
    .filter((a) => a.status === "Approved" || a.status === "Disbursed")
    .reduce((s, a) => s + a.amount, 0);
  const pendingCount = apps.filter((a) => a.status === "Pending").length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading business data…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Business Funding"
        subtitle="Review applications, disbursements, and repayments."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI
          label="Funded Businesses"
          value={fundedCount.toLocaleString()}
          hint="All time"
          tone="success"
        />
        <KPI
          label="Total Disbursed"
          value={fmtCompact(totalDisbursed)}
          hint="Capital deployed"
          tone="gold"
        />
        <KPI label="Repayment Rate" value="94.2%" hint="On-time" />
        <KPI
          label="In Review"
          value={pendingCount.toLocaleString()}
          hint="Pending approval"
          tone="destructive"
        />
      </section>

      <section className="mt-6">
        <AdminCard title="Applications">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Business</th>
                  <th className="py-2 pr-3">Owner</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Repaid</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{f.id}</td>
                    <td className="py-3 pr-3 font-medium">{f.business}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{f.owner}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{fmtKES(f.amount)}</td>
                    <td className="py-3 pr-3 text-right">{fmtKES(f.repaid)}</td>
                    <td className="py-3 pr-3">
                      <StatusPill status={f.status} />
                    </td>
                    <td className="py-3">
                      <button className="text-xs font-semibold text-primary hover:underline">
                        Review
                      </button>
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
