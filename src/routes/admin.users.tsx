import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, StatusPill, KPI } from "@/components/AdminShell";
import { fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { UserPlus, Filter } from "lucide-react";

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  status: string;
  kyc: string;
  balance: number;
  joined: string;
}

interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  banned: boolean;
  kyc_status: string;
  balance: number;
  created_at: string;
}

interface UserStats {
  totalUsers: number;
  activeUsers: number;
  pendingKyc: number;
  suspended: number;
}

export const Route = createFileRoute("/admin/users")({
  component: AdminUsers,
});

function AdminUsers() {
  const { loading: authLoading } = useAdminAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    const fetchStats = apiRequest<{ stats: UserStats }>("/admin/users/stats");
    const fetchUsers = apiRequest<{ success: boolean; users: UserResponse[] }>(
      "/admin/users?limit=50",
    );

    Promise.all([fetchStats, fetchUsers])
      .then(([statsRes, usersRes]) => {
        setStats(statsRes.stats || null);
        const mapped = (usersRes.users || []).map((u) => ({
          id: u.id,
          name: u.full_name || u.email?.split("@")[0] || "Unknown",
          email: u.email || "",
          status: u.banned ? "Suspended" : u.kyc_status === "Pending" ? "Pending" : "Active",
          kyc: u.kyc_status,
          balance: Number(u.balance || 0),
          joined: new Date(u.created_at).toLocaleDateString("en-KE", {
            year: "numeric",
            month: "short",
            day: "numeric",
          }),
        }));
        setUsers(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Users fetch error:", err);
        setLoading(false);
      });
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading users…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Users & KYC"
        subtitle="Manage user accounts, verifications, and access."
        actions={
          <div className="flex gap-2">
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Filter className="h-4 w-4" /> Filter
            </button>
            <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <UserPlus className="h-4 w-4" /> Add user
            </button>
          </div>
        }
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI label="Total Users" value={stats.totalUsers.toLocaleString()} hint="All time" />
          <KPI
            label="Active"
            value={stats.activeUsers.toLocaleString()}
            hint="Last 30 days"
            tone="success"
          />
          <KPI
            label="KYC Pending"
            value={stats.pendingKyc.toLocaleString()}
            hint="Verify within 24h"
            tone="gold"
          />
          <KPI
            label="Suspended"
            value={stats.suspended.toLocaleString()}
            hint="Compliance holds"
            tone="destructive"
          />
        </section>
      )}

      <section className="mt-6">
        <AdminCard title="All users">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Name</th>
                  <th className="py-2 pr-3">Email</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">KYC</th>
                  <th className="py-2 pr-3 text-right">Balance</th>
                  <th className="py-2 pr-3">Joined</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{u.id}</td>
                    <td className="py-3 pr-3 font-medium">{u.name}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{u.email}</td>
                    <td className="py-3 pr-3">
                      <StatusPill status={u.status} />
                    </td>
                    <td className="py-3 pr-3">
                      <StatusPill status={u.kyc} />
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold">{fmtKES(u.balance)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{u.joined}</td>
                    <td className="py-3">
                      <button className="text-xs font-semibold text-primary hover:underline">
                        Manage
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
