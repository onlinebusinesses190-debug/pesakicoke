import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI } from "@/components/AdminShell";
import { fmtCompact, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface CommissionTier {
  tier: string;
  referrals: string;
  rate: string;
  payout: number;
}

export const Route = createFileRoute("/admin/commissions")({
  component: AdminCommissions,
});

function AdminCommissions() {
  const { loading: authLoading } = useAdminAuth();
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [activeAffiliates, setActiveAffiliates] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{
      success: boolean;
      data: { tiers: CommissionTier[]; totalPaid: number; activeAffiliates: number };
    }>("/admin/commissions/referrals")
      .then((res) => {
        if (res.success && res.data) {
          setTiers(res.data.tiers || []);
          setTotalPaid(res.data.totalPaid || 0);
          setActiveAffiliates(res.data.activeAffiliates || 0);
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load commissions data");
        setLoading(false);
      });
  }, [authLoading]);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading commissions data…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Commissions"
        subtitle="Referral programs, affiliate tiers, and payouts."
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Total Paid" value={fmtCompact(totalPaid)} hint="All time" tone="gold" />
        <KPI
          label="Active Affiliates"
          value={fmt(activeAffiliates)}
          hint="Earning monthly"
          tone="success"
        />
        <KPI label="Top Earner" value="KES 184K" hint="This month" />
        <KPI
          label="Pending Payouts"
          value={fmtCompact(820_000)}
          hint="Next cycle"
          tone="destructive"
        />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        {tiers.map((t) => (
          <AdminCard key={t.tier} title={t.tier}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {t.referrals} referrals
            </p>
            <p className="mt-2 text-3xl font-bold text-primary">{t.rate}</p>
            <p className="mt-1 text-xs text-muted-foreground">Commission rate</p>
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Paid this year</p>
              <p className="text-lg font-semibold">{fmtCompact(t.payout)}</p>
            </div>
          </AdminCard>
        ))}
      </section>
    </>
  );
}
