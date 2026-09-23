import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard, StatusPill } from "@/components/AdminShell";
import { fmtKES, fmtDate } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { ChevronLeft, ChevronRight, Search, Filter, Check, X } from "lucide-react";

interface Deposit {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  method: string;
  reference: string;
  status: string;
  created_at: string;
  processed_at: string | null;
}

interface DepositStats {
  total_amount: number;
  pending_count: number;
  completed_count: number;
  failed_count: number;
}

export const Route = createFileRoute("/admin/deposits")({
  component: AdminDeposits,
});

function AdminDeposits() {
  const { loading: authLoading } = useAdminAuth();
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [stats, setStats] = useState<DepositStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(() => {
    if (authLoading) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);

    const fetchStats = apiRequest<{ success: boolean; data: DepositStats }>(
      "/admin/deposits/stats",
    );
    const fetchDeposits = apiRequest<{ success: boolean; data: Deposit[] }>(
      `/admin/deposits?${params}`,
    );

    Promise.all([fetchStats, fetchDeposits])
      .then(([statsRes, depRes]) => {
        if (statsRes.success) setStats(statsRes.data || null);
        if (depRes.success && Array.isArray(depRes.data)) {
          const data = depRes.data;
          setDeposits(data);
          setTotal(data.length < limit ? offset + data.length : total);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authLoading, search, statusFilter, offset, limit, total]);

  useEffect(() => {
    fetchPage();
  }, [fetchPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    fetchPage();
  };

  const handleAction = async (id: string, action: string) => {
    await apiRequest(`/admin/deposits/${id}/${action}`, { method: "POST" });
    fetchPage();
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading deposits…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Deposits"
        subtitle="Review and approve deposit requests."
        actions={
          <div className="flex gap-2">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Search deposits…"
                className="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </form>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="flagged">Flagged</option>
            </select>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Filter className="h-4 w-4" /> More filters
            </button>
          </div>
        }
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <AdminCard title="Pending" tone="gold">
            <p className="text-2xl font-bold">{stats.pending_count.toLocaleString()}</p>
          </AdminCard>
          <AdminCard title="Approved today" tone="success">
            <p className="text-2xl font-bold">{stats.completed_count.toLocaleString()}</p>
          </AdminCard>
          <AdminCard title="Total volume" tone="primary">
            <p className="text-2xl font-bold">{fmtKES(stats.total_amount)}</p>
          </AdminCard>
          <AdminCard title="Failed/Flagged" tone="destructive">
            <p className="text-2xl font-bold">{stats.failed_count.toLocaleString()}</p>
          </AdminCard>
        </section>
      )}

      <section className="mt-6">
        <AdminCard title="Deposit requests">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Reference</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {deposits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                      No deposits match your filters.
                    </td>
                  </tr>
                ) : (
                  deposits.map((d) => (
                    <tr key={d.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                        {d.id.slice(0, 8)}…
                      </td>
                      <td className="py-3 pr-3 font-medium">{d.user_email}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{fmtKES(d.amount)}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{d.method}</td>
                      <td className="py-3 pr-3 font-mono text-xs">{d.reference || "—"}</td>
                      <td className="py-3 pr-3">
                        <StatusPill status={d.status} />
                      </td>
                      <td className="py-3">
                        <div className="flex gap-1">
                          {d.status === "pending" && (
                            <>
                              <button
                                onClick={() => handleAction(d.id, "approve")}
                                className="rounded-lg bg-success/15 p-1 text-success hover:bg-success/25"
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleAction(d.id, "reject")}
                                className="rounded-lg bg-destructive/15 p-1 text-destructive hover:bg-destructive/25"
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </>
                          )}
                          <Link
                            to={("/admin/users/" + d.user_id) as never}
                            className="rounded-lg bg-primary/10 p-1 text-primary hover:bg-primary/20"
                            title="View user"
                          >
                            <Search className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {offset + 1}-{Math.min(offset + deposits.length, limit)} of {total} deposits
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
                disabled={deposits.length < limit}
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
