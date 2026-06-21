import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminFunding, fmtKES, fmtCompact } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/business")({
  component: AdminBusiness,
});

function AdminBusiness() {
  return (
    <>
      <AdminPageHeader title="Business Funding" subtitle="Review applications, disbursements, and repayments." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Funded Businesses" value="312" hint="All time" tone="success" />
        <KPI label="Total Disbursed" value={fmtCompact(184_000_000)} hint="Capital deployed" tone="gold" />
        <KPI label="Repayment Rate" value="94.2%" hint="On-time" />
        <KPI label="In Review" value="42" hint="Pending approval" tone="destructive" />
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
                {adminFunding.map((f) => (
                  <tr key={f.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{f.id}</td>
                    <td className="py-3 pr-3 font-medium">{f.business}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{f.owner}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{fmtKES(f.amount)}</td>
                    <td className="py-3 pr-3 text-right">{fmtKES(f.repaid)}</td>
                    <td className="py-3 pr-3"><StatusPill status={f.status} /></td>
                    <td className="py-3"><button className="text-xs font-semibold text-primary hover:underline">Review</button></td>
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
