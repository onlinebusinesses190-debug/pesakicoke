import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard, StatusPill } from "@/components/AdminShell";
import { fmtKES } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { ChevronLeft, ChevronRight, Search, Filter, Eye } from "lucide-react";

interface Transaction {
  id: string;
  user_id: string;
  user_email: string;
  type: string;
  amount: number;
  method: string;
  status: string;
  reference: string;
  created_at: string;
}

interface TransactionStats {
  total: number;
  deposits: number;
  withdrawals: number;
  trades: number;
  referral_earnings: number;
}

export const Route = createFileRoute("/admin/transactions")({
  component: AdminTransactions,
});

function AdminTransactions() {
  const { loading: authLoading } = useAdminAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TransactionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(() => {
    if (authLoading) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);

    const fetchStats = apiRequest<{ success: boolean; data: TransactionStats }>(
      "/admin/transactions/stats",
    );
    const fetchTx = apiRequest<{ success: boolean; data: Transaction[] }>(
      `/admin/transactions?${params}`,
    );

    Promise.all([fetchStats, fetchTx])
      .then(([statsRes, txRes]) => {
        if (statsRes.success) setStats(statsRes.data || null);
        if (txRes.success && Array.isArray(txRes.data)) {
          const data = txRes.data;
          setTransactions(data);
          setTotal(data.length < limit ? offset + data.length : total);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [authLoading, search, statusFilter, typeFilter, offset, limit, total]);

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
        <p className="text-muted-foreground">Loading transactions…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="All Transactions"
        subtitle="Every wallet action, trade, and referral event."
        actions={
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Search transactions…"
                className="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </form>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setOffset(0);
              }}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">All types</option>
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
              <option value="trade">Trade</option>
              <option value="referral">Referral</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setOffset(0);
              }}
              className="h-9 rounded-lg border border-border bg-card px-3 text-sm outline-none focus:border-primary"
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
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
        <>
          <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <AdminCard title="Total transactions">
              <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
            </AdminCard>
            <AdminCard title="Deposits">
              <p className="text-2xl font-bold text-success">{fmtKES(stats.deposits)}</p>
            </AdminCard>
            <AdminCard title="Withdrawals">
              <p className="text-2xl font-bold text-destructive">{fmtKES(stats.withdrawals)}</p>
            </AdminCard>
            <AdminCard title="Referral earnings">
              <p className="text-2xl font-bold text-gold">{fmtKES(stats.referral_earnings)}</p>
            </AdminCard>
          </section>

          <section className="mt-6">
            <AdminCard title="Recent transactions">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3">ID</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3 text-right">Amount</th>
                      <th className="py-2 pr-3">Method</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => (
                      <tr key={t.id} className="border-b border-border/60 last:border-0">
                        <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                          {t.id.slice(0, 8)}…
                        </td>
                        <td className="py-3 pr-3 font-medium">{t.user_email}</td>
                        <td className="py-3 pr-3 capitalize">{t.type}</td>
                        <td
                          className={`py-3 pr-3 text-right font-semibold ${t.amount < 0 ? "text-destructive" : "text-success"}`}
                        >
                          {fmtKES(t.amount)}
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">{t.method}</td>
                        <td className="py-3 pr-3">
                          <StatusPill status={t.status} />
                        </td>
                        <td className="py-3 pr-3 text-muted-foreground">
                          {new Date(t.created_at).toLocaleDateString()}
                        </td>
                        <td className="py-3">
                          <button className="text-xs font-semibold text-primary hover:underline">
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {offset + 1}-{Math.min(offset + transactions.length, limit)} of {total}{" "}
                  transactions
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
                    disabled={transactions.length < limit}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </AdminCard>
          </section>
        </>
      )}
    </>
  );
}
