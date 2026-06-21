import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminJobs, fmtKES } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/kazi")({
  component: AdminKazi,
});

function AdminKazi() {
  return (
    <>
      <AdminPageHeader title="KAZI Link" subtitle="Moderate job listings, hires, and worker profiles." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Active Jobs" value="5,840" hint="+12% this week" tone="success" />
        <KPI label="Workers Listed" value="12,402" hint="Verified profiles" />
        <KPI label="Hires This Month" value="1,284" hint="Completed contracts" tone="gold" />
        <KPI label="Flagged Listings" value="14" hint="Needs review" tone="destructive" />
      </section>

      <section className="mt-6">
        <AdminCard title="Job listings">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 pr-3">Posted by</th>
                  <th className="py-2 pr-3">Location</th>
                  <th className="py-2 pr-3 text-right">Pay</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {adminJobs.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{j.id}</td>
                    <td className="py-3 pr-3 font-medium">{j.title}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{j.poster}</td>
                    <td className="py-3 pr-3">{j.loc}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{fmtKES(j.pay)}</td>
                    <td className="py-3 pr-3"><StatusPill status={j.status} /></td>
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
