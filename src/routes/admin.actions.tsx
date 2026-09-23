import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, StatusPill, KPI } from "@/components/AdminShell";
import { fmtKES, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";

interface AuditAction {
  id: string;
  admin_email: string;
  action: string;
  target_type: string;
  target_id: string;
  details: string;
  created_at: string;
}

interface AuditStats {
  total_actions: number;
  today_actions: number;
  unique_admins: number;
}

export const Route = createFileRoute("/admin/actions")({
  component: AdminActions,
});

function AdminActions() {
  const { loading: authLoading } = useAdminAuth();
  const [actions, setActions] = useState<AuditAction[]>([]);
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams({ limit: "100" });
    if (search) params.set("search", search);

    Promise.all([
      apiRequest<{ success: boolean; data: AuditStats }>("/admin/actions/stats"),
      apiRequest<{ success: boolean; data: AuditAction[] }>(`/admin/actions?${params}`),
    ])
      .then(([statsRes, actionsRes]) => {
        if (statsRes.success) setStats(statsRes.data || null);
        if (actionsRes.success && Array.isArray(actionsRes.data)) setActions(actionsRes.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authLoading, search]);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading audit log…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Audit Log"
        subtitle="Record of every admin action on the platform."
        actions={
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search actions…"
              className="h-9 w-56 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <KPI label="Total actions" value={fmt(stats.total_actions)} hint="All time" />
          <KPI label="Today" value={fmt(stats.today_actions)} hint="24h rolling" tone="gold" />
          <KPI
            label="Active admins"
            value={fmt(stats.unique_admins)}
            hint="Past 24h"
            tone="success"
          />
        </section>
      )}

      <section className="mt-6">
        <AdminCard title="Recent actions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Time</th>
                  <th className="py-2 pr-3">Admin</th>
                  <th className="py-2 pr-3">Action</th>
                  <th className="py-2 pr-3">Target</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {actions.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                      No actions recorded yet.
                    </td>
                  </tr>
                ) : (
                  actions.map((a) => (
                    <tr key={a.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 text-xs text-muted-foreground">
                        {new Date(a.created_at).toLocaleString()}
                      </td>
                      <td className="py-3 pr-3 font-medium">{a.admin_email}</td>
                      <td className="py-3 pr-3 uppercase">{a.action}</td>
                      <td className="py-3 pr-3">
                        {a.target_type} #{a.target_id.slice(0, 8)}…
                      </td>
                      <td className="py-3 text-muted-foreground">{a.details || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </section>
    </>
  );
}
