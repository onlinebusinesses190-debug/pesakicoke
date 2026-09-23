import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard, StatusPill, KPI } from "@/components/AdminShell";
import { fmtKES, fmtCompact, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { ChevronLeft, ChevronRight, Search, Filter, Users, BarChart3 } from "lucide-react";

interface ReferralUser {
  id: string;
  email: string;
  full_name: string | null;
  referral_code: string | null;
  total_earned: number;
  referrals_count: number;
  created_at: string;
}

interface ReferralLink {
  id: string;
  user_id: string;
  user_email: string;
  referred_user_id: string | null;
  referred_email: string | null;
  commission: number;
  level: number;
  created_at: string;
}

interface ReferralStats {
  total_referrals: number;
  total_commission: number;
  top_affiliates: number;
  conversion_rate: number;
}

export const Route = createFileRoute("/admin/referrals")({
  component: AdminReferrals,
});

function AdminReferrals() {
  const { loading: authLoading } = useAdminAuth();
  const [affiliates, setAffiliates] = useState<ReferralUser[]>([]);
  const [links, setLinks] = useState<ReferralLink[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"affiliates" | "links">("affiliates");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [total, setTotal] = useState(0);

  const fetchPage = useCallback(() => {
    if (authLoading) return;
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);

    const fetchStats = apiRequest<{ success: boolean; data: ReferralStats }>(
      "/admin/referrals/stats",
    );
    const fetchAffiliates = apiRequest<{ success: boolean; data: ReferralUser[] }>(
      `/admin/referrals/affiliates?${params}`,
    );
    const fetchLinks = apiRequest<{ success: boolean; data: ReferralLink[] }>(
      `/admin/referrals/links?${params}`,
    );

    Promise.all([fetchStats, fetchAffiliates, fetchLinks])
      .then(([statsRes, affRes, linkRes]) => {
        if (statsRes.success) setStats(statsRes.data || null);
        if (affRes.success && Array.isArray(affRes.data)) {
          setAffiliates(affRes.data);
          setTotal(affRes.data.length < limit ? offset + affRes.data.length : total);
        }
        if (linkRes.success && Array.isArray(linkRes.data)) {
          setLinks(linkRes.data);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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
        <p className="text-muted-foreground">Loading referrals…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Referrals"
        subtitle="Affiliate program performance and commission tracking."
        actions={
          <div className="flex gap-2">
            <form onSubmit={handleSearch} className="relative">
              <input
                type="text"
                placeholder="Search affiliates…"
                className="h-9 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none focus:border-primary"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </form>
            <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
              <Filter className="h-4 w-4" /> Filter
            </button>
          </div>
        }
      />

      {stats && (
        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KPI label="Total Referrals" value={fmt(stats.total_referrals)} hint="All tiers" />
          <KPI
            label="Total Commission"
            value={fmtCompact(stats.total_commission)}
            hint="KES"
            tone="gold"
          />
          <KPI
            label="Active Affiliates"
            value={fmt(stats.top_affiliates)}
            hint="This month"
            tone="success"
          />
          <KPI
            label="Conversion Rate"
            value={(stats.conversion_rate ?? 0).toFixed(1) + "%"}
            hint="Sign-ups to conversions"
            tone="primary"
          />
        </section>
      )}

      <section className="mt-6">
        <AdminCard>
          <div className="border-b border-border px-5 py-3">
            <div className="flex gap-4 text-sm font-medium">
              <button
                className={`border-b-2 pb-2 ${activeTab === "affiliates" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => setActiveTab("affiliates")}
              >
                Top affiliates
              </button>
              <button
                className={`border-b-2 pb-2 ${activeTab === "links" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
                onClick={() => setActiveTab("links")}
              >
                Referral links
              </button>
            </div>
          </div>

          {activeTab === "affiliates" ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3">Code</th>
                      <th className="py-2 pr-3">User</th>
                      <th className="py-2 pr-3">Email</th>
                      <th className="py-2 pr-3 text-right">Referrals</th>
                      <th className="py-2 pr-3 text-right">Commission</th>
                      <th className="py-2 pr-3">Joined</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {affiliates.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          No affiliates found.
                        </td>
                      </tr>
                    ) : (
                      affiliates.map((a) => (
                        <tr key={a.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-3 font-mono text-xs">{a.referral_code || "—"}</td>
                          <td className="py-3 pr-3 font-medium">
                            {a.full_name || a.email.split("@")[0]}
                          </td>
                          <td className="py-3 pr-3 text-muted-foreground">{a.email}</td>
                          <td className="py-3 pr-3 text-right">{fmt(a.referrals_count)}</td>
                          <td className="py-3 pr-3 text-right font-semibold text-gold">
                            {fmtKES(a.total_earned)}
                          </td>
                          <td className="py-3 pr-3 text-muted-foreground">
                            {new Date(a.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3">
                            <Link
                              to={`/admin/users/${a.id}`}
                              className="text-xs font-semibold text-primary hover:underline"
                            >
                              View user
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex items-center justify-between px-5 pb-3">
                <p className="text-xs text-muted-foreground">
                  {offset + 1}-{Math.min(offset + affiliates.length, limit)} of {total} affiliates
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
                    disabled={affiliates.length < limit}
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2 pr-3">Affiliate</th>
                      <th className="py-2 pr-3">Referred</th>
                      <th className="py-2 pr-3">Level</th>
                      <th className="py-2 pr-3 text-right">Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-muted-foreground">
                          No referral links found.
                        </td>
                      </tr>
                    ) : (
                      links.map((l) => (
                        <tr key={l.id} className="border-b border-border/60 last:border-0">
                          <td className="py-3 pr-3 text-muted-foreground">
                            {new Date(l.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 pr-3 font-medium">{l.user_email}</td>
                          <td className="py-3 pr-3">{l.referred_email || "—"}</td>
                          <td className="py-3 pr-3">{l.level}</td>
                          <td className="py-3 pr-3 text-right font-semibold text-gold">
                            {fmtKES(l.commission)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </AdminCard>
      </section>
    </>
  );
}
