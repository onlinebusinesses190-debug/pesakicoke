import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface KaziJob {
  id: string;
  title: string;
  employer: string;
  location: string;
  pay: number | string;
  status: string;
  created_at: string;
}

interface KaziStats {
  activeJobs: number;
  workersListed: number;
  hiresThisMonth: number;
  flaggedListings: number;
}

interface KaziJobResponse {
  id: string;
  title: string;
  employer: string;
  location: string;
  pay: number;
  pay_label: string;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/admin/kazi")({
  component: AdminKazi,
});

function AdminKazi() {
  const { loading: authLoading } = useAdminAuth();
  const [jobs, setJobs] = useState<KaziJob[]>([]);
  const [stats, setStats] = useState<KaziStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; data: { jobs: KaziJobResponse[]; stats: KaziStats } }>(
      "/admin/kazi/jobs?limit=50",
    )
      .then((res) => {
        if (res.success && res.data) {
          const mapped = (res.data.jobs || []).map((j) => ({
            id: j.id,
            title: j.title,
            employer: j.employer || "Unknown",
            location: j.location || "Nairobi",
            pay: j.pay,
            status: j.status,
            created_at: j.created_at,
          }));
          setJobs(mapped);
          setStats(
            res.data.stats || {
              activeJobs: mapped.length,
              workersListed: 0,
              hiresThisMonth: mapped.filter((j) => j.status === "hired").length,
              flaggedListings: 0,
            },
          );
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load KAZI data");
        setLoading(false);
      });
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading KAZI data…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="KAZI Link"
        subtitle="Moderate job listings, hires, and worker profiles."
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI
            label="Active Jobs"
            value={stats.activeJobs.toLocaleString()}
            hint="+12% this week"
            tone="success"
          />
          <KPI
            label="Workers Listed"
            value={stats.workersListed.toLocaleString()}
            hint="Verified profiles"
          />
          <KPI
            label="Hires This Month"
            value={stats.hiresThisMonth.toLocaleString()}
            hint="Completed contracts"
            tone="gold"
          />
          <KPI
            label="Flagged Listings"
            value={stats.flaggedListings.toLocaleString()}
            hint="Needs review"
            tone="destructive"
          />
        </section>
      )}

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
                {jobs.map((j) => (
                  <tr key={j.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                      {j.id.slice(0, 8)}…
                    </td>
                    <td className="py-3 pr-3 font-medium">{j.title}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{j.employer}</td>
                    <td className="py-3 pr-3">{j.location}</td>
                    <td className="py-3 pr-3 text-right font-semibold">
                      {typeof j.pay === "number" ? fmtKES(j.pay) : j.pay}
                    </td>
                    <td className="py-3 pr-3">
                      <StatusPill status={j.status} />
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
