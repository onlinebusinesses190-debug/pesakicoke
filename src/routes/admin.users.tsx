import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard, StatusPill, KPI } from "@/components/AdminShell";
import { fmtKES, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { UserPlus, Filter, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface UserResponse {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  banned: boolean;
  kyc_status: string;
  balance: number;
  locked: number;
  demo_balance: number;
  referral_code: string | null;
  referred_by_email: string | null;
  flagged: boolean;
  last_sign_in_at: string | null;
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
  const [users, setUsers] = useState<UserResponse[]>([]);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(() => {
    if (authLoading) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);

    const fetchStats = apiRequest<{ success: boolean; data: UserStats }>("/admin/users/stats");
    const fetchUsers = apiRequest<{ success: boolean; data: UserResponse[] }>(
      `/admin/users?${params}`,
    );

    Promise.all([fetchStats, fetchUsers])
      .then(([statsRes, usersRes]) => {
        if (statsRes.success) setStats(statsRes.data || null);
        if (usersRes.success && Array.isArray(usersRes.data)) {
          const data = usersRes.data;
          setUsers(data);
          setTotal(data.length < limit ? offset + data.length : total);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, [authLoading, search, offset, limit, total]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    fetchPage();
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
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
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Search users…"
                className="h-9 w-64 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </form>
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
          <KPI label="Total Users" value={fmt(stats.totalUsers)} hint="All time" />
          <KPI label="Active" value={fmt(stats.activeUsers)} hint="Last 30 days" tone="success" />
          <KPI
            label="KYC Pending"
            value={fmt(stats.pendingKyc)}
            hint="Verify within 24h"
            tone="gold"
          />
          <KPI
            label="Suspended"
            value={fmt(stats.suspended)}
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
                  <th className="py-2 pr-3">Last login</th>
                  <th className="py-2 pr-3">Joined</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const name = u.full_name || u.email?.split("@")[0] || "Unknown";
                  const status = u.banned
                    ? "Suspended"
                    : u.kyc_status === "Pending"
                      ? "Pending"
                      : "Active";
                  return (
                    <tr key={u.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                        {u.id.slice(0, 8)}…
                      </td>
                      <td className="py-3 pr-3 font-medium">{name}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{u.email}</td>
                      <td className="py-3 pr-3">
                        <StatusPill status={status} />
                      </td>
                      <td className="py-3 pr-3">
                        <StatusPill status={u.kyc_status} />
                      </td>
                      <td className="py-3 pr-3 text-right font-semibold">
                        {fmtKES(Number(u.balance || 0))}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {u.last_sign_in_at
                          ? new Date(u.last_sign_in_at).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <Link
                          to={"/admin/users/" + u.id}
                          className="text-xs font-semibold text-primary hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {offset + 1}-{Math.min(offset + users.length, limit)} of {total} users
            </p>
            <div className="flex gap-1">
              <button
                className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-50"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
              >
                <ChevronLeft className="h-3 w-3" />
              </button>
              <button
                className="rounded-lg border border-border px-2 py-1 text-xs disabled:opacity-50"
                onClick={() => setOffset(offset + limit)}
                disabled={users.length < limit}
              >
                <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </AdminCard>
      </section>
    </>
  );
}
